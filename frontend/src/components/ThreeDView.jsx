import { useEffect, useRef, useState } from 'react'
import Corners from './Corners'
import { loadPlotly } from '../utils/plotly'
import { renderGraphData } from '../utils/plotGraph'
import { buildShapeSurface, SHAPE_LABELS } from '../utils/shape3d'

// `payload` is either:
//   { kind: 'graph', latex, data }   — a 3D surface from POST /api/graph
//   { kind: 'shape3d', shape, params } — a recognized cone/sphere/cylinder
// Both render as a real, orbit-able Plotly scene — not a canned demo.
const DARK_PLOT_OPTIONS = {
  paperBg: 'transparent',
  font: { color: '#e7e7ea' },
  axisColor: '#9a9da3',
  gridColor: 'rgba(255,255,255,0.15)',
  colorscale: 'Blues',
  displayModeBar: true,
}

export default function ThreeDView({ t, onBack, payload }) {
  const plotRef = useRef(null)
  const plotlyRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setError('')

    async function draw() {
      if (!payload || !plotRef.current) return
      try {
        const Plotly = await loadPlotly()
        if (cancelled || !plotRef.current) return
        plotlyRef.current = Plotly

        if (payload.kind === 'graph') {
          renderGraphData(Plotly, plotRef.current, payload.data, DARK_PLOT_OPTIONS)
          return
        }

        if (payload.kind === 'shape3d') {
          const surface = buildShapeSurface(payload.shape, payload.params)
          if (!surface) {
            setError(`Unsupported shape: ${payload.shape}`)
            return
          }
          Plotly.newPlot(
            plotRef.current,
            [
              {
                x: surface.x,
                y: surface.y,
                z: surface.z,
                type: 'surface',
                showscale: false,
                colorscale: DARK_PLOT_OPTIONS.colorscale,
              },
            ],
            {
              paper_bgcolor: DARK_PLOT_OPTIONS.paperBg,
              font: DARK_PLOT_OPTIONS.font,
              margin: { t: 10, r: 10, b: 10, l: 10 },
              scene: {
                aspectmode: 'data',
                xaxis: { color: DARK_PLOT_OPTIONS.axisColor, gridcolor: DARK_PLOT_OPTIONS.gridColor },
                yaxis: { color: DARK_PLOT_OPTIONS.axisColor, gridcolor: DARK_PLOT_OPTIONS.gridColor },
                zaxis: { color: DARK_PLOT_OPTIONS.axisColor, gridcolor: DARK_PLOT_OPTIONS.gridColor },
              },
            },
            { responsive: true, displayModeBar: true },
          )
        }
      } catch {
        if (!cancelled) setError('Could not render this in 3D.')
      }
    }

    draw()
    return () => {
      cancelled = true
      if (plotlyRef.current && plotRef.current) plotlyRef.current.purge(plotRef.current)
    }
  }, [payload])

  const title =
    payload?.kind === 'shape3d'
      ? SHAPE_LABELS[payload.shape] || payload.shape
      : payload?.kind === 'graph'
        ? payload.latex || t.threeDTitle
        : t.threeDTitle

  const subtitle =
    payload?.kind === 'shape3d'
      ? Object.entries(payload.params || {})
          .map(([k, v]) => `${k} = ${v}`)
          .join(' · ')
      : payload?.kind === 'graph'
        ? `${payload.data.z_label}(${payload.data.x_label}, ${payload.data.y_label})`
        : t.threeDSubtitle

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
        <div className="title">{title}</div>
        <div className="subtitle">{subtitle}</div>
      </div>
      <div className="threeD-stage">
        {error ? <p className="error">{error}</p> : <div ref={plotRef} className="threeD-plot" />}
      </div>
      <div className="threeD-hint">{t.threeDHint}</div>
    </div>
  )
}
