import { useMemo, useRef, useState } from 'react'
import Corners from './Corners'

const H = 280
const R = 170

function buildRings() {
  const rings = []
  for (let i = 1; i <= 6; i++) {
    const t = i / 6
    const y = t * H
    const radius = R * Math.sqrt(t)
    const size = radius * 2
    const tz = y - H / 2
    rings.push({
      key: 'r' + i,
      style: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        border: '1.5px solid var(--color-accent-700)',
        transformStyle: 'preserve-3d',
        transform: `rotateX(90deg) translateZ(${tz}px)`,
      },
    })
  }
  return rings
}

function buildProfilePath() {
  const N = 14
  const right = []
  const left = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const rad = R * Math.sqrt(t)
    const yy = H - t * H
    right.push(`${(R + rad).toFixed(1)},${yy.toFixed(1)}`)
    left.push(`${(R - rad).toFixed(1)},${yy.toFixed(1)}`)
  }
  return { right: 'M' + right.join(' L'), left: 'M' + left.join(' L'), vb: `0 0 ${2 * R} ${H}` }
}

const MERIDIAN_ANGLES = Array.from({ length: 10 }, (_, i) => i * 18)

// A hand-built (no WebGL) demo of a paraboloid of revolution — rings viewed
// edge-on plus repeated profile-curve "meridians" spun in 3D space, matching
// the design mockup exactly. It's illustrative geometry, not derived from
// the teacher's actual equation (the mockup itself doesn't parameterize it
// either — every AICommand-driven surface still renders through GraphView).
export default function ThreeDView({ t, onBack }) {
  const [rotX, setRotX] = useState(-20)
  const [rotY, setRotY] = useState(35)
  const [zoom, setZoom] = useState(1)
  const dragRef = useRef(null)

  const rings = useMemo(buildRings, [])
  const profile = useMemo(buildProfilePath, [])

  function onRigDown(e) {
    dragRef.current = { x: e.clientX, y: e.clientY, rx: rotX, ry: rotY }
  }
  function onRigMove(e) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    setRotY(drag.ry + dx * 0.4)
    setRotX(Math.max(-80, Math.min(80, drag.rx - dy * 0.4)))
  }
  function onRigUp() {
    dragRef.current = null
  }
  function onRigWheel(e) {
    e.preventDefault()
    setZoom((z) => Math.max(0.6, Math.min(1.8, z - e.deltaY * 0.001)))
  }

  const rigTransform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${zoom})`

  return (
    <div className="threeD-screen">
      <div className="threeD-back">
        <button type="button" className="btn btn-ghost blueprint" onClick={onBack}>
          <Corners />
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          {t.threeDBack}
        </button>
      </div>
      <div className="threeD-heading">
        <div className="title">{t.threeDTitle}</div>
        <div className="subtitle">{t.threeDSubtitle}</div>
      </div>
      <div
        className="threeD-stage"
        onPointerDown={onRigDown}
        onPointerMove={onRigMove}
        onPointerUp={onRigUp}
        onPointerLeave={onRigUp}
        onWheel={onRigWheel}
      >
        <div className="threeD-rig" style={{ transform: rigTransform }}>
          {rings.map((ring) => (
            <div key={ring.key} style={ring.style} />
          ))}
          {MERIDIAN_ANGLES.map((ang, i) => (
            <div
              key={'m' + i}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 2 * R,
                height: H,
                marginLeft: -R,
                marginTop: -H / 2,
                transformStyle: 'preserve-3d',
                transform: `rotateY(${ang}deg)`,
              }}
            >
              <svg viewBox={profile.vb} width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                <path d={profile.left} fill="none" stroke="var(--color-accent-400)" strokeWidth="1.4" />
                <path d={profile.right} fill="none" stroke="var(--color-accent-400)" strokeWidth="1.4" />
              </svg>
            </div>
          ))}
        </div>
      </div>
      <div className="threeD-hint">{t.threeDHint}</div>
    </div>
  )
}
