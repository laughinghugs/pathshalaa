import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cropToBlob, getFocusRegion } from '../utils/focusRegion'

// Sized by its parent element (fills 100%/100% and tracks parent resizes)
// rather than fixed width/height props, so it can sit inside flexible
// layouts (the board's canvas frame, the onboarding box) at any size.
const DrawingCanvas = forwardRef(function DrawingCanvas(
  { color = '#1a1a2e', lineWidth = 3, onChange, onStrokeStart, onStrokeEnd },
  ref,
) {
  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const currentStrokeRef = useRef(null)
  const drawingRef = useRef(false)
  const colorRef = useRef(color)
  const lineWidthRef = useRef(lineWidth)

  useEffect(() => {
    colorRef.current = color
  }, [color])
  useEffect(() => {
    lineWidthRef.current = lineWidth
  }, [lineWidth])

  function getContext() {
    return canvasRef.current.getContext('2d')
  }

  function drawStroke(ctx, stroke) {
    if (stroke.points.length < 2) return
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    for (const point of stroke.points.slice(1)) {
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  function redraw() {
    const canvas = canvasRef.current
    const ctx = getContext()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke)
    }
  }

  function resizeToParent() {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const { width, height } = parent.getBoundingClientRect()
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (canvas.width === w && canvas.height === h) return
    canvas.width = w
    canvas.height = h
    redraw()
  }

  useEffect(() => {
    resizeToParent()
    const parent = canvasRef.current?.parentElement
    if (!parent || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(resizeToParent)
    observer.observe(parent)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function notifyChange() {
    onChange?.(strokesRef.current.length === 0)
  }

  function getPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e) {
    canvasRef.current.setPointerCapture(e.pointerId)
    drawingRef.current = true
    currentStrokeRef.current = {
      color: colorRef.current,
      width: lineWidthRef.current,
      points: [getPoint(e)],
    }
    onStrokeStart?.()
  }

  function handlePointerMove(e) {
    if (!drawingRef.current) return
    currentStrokeRef.current.points.push(getPoint(e))
    redraw()
    drawStroke(getContext(), currentStrokeRef.current)
  }

  function handlePointerUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      strokesRef.current.push(currentStrokeRef.current)
      notifyChange()
      onStrokeEnd?.()
    }
    currentStrokeRef.current = null
    redraw()
  }

  useImperativeHandle(ref, () => ({
    undo() {
      strokesRef.current.pop()
      redraw()
      notifyChange()
    },
    clear() {
      strokesRef.current = []
      redraw()
      notifyChange()
    },
    isEmpty() {
      return strokesRef.current.length === 0
    },
    toBlob() {
      return new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png'))
    },
    getStrokes() {
      return strokesRef.current
    },
    // Crops to a tight bounding box around the most recently drawn stroke
    // (plus margin) instead of sending the whole canvas — see
    // src/utils/focusRegion.js. Falls back to the full canvas if empty.
    toFocusRegionBlob(margin = 20) {
      const canvas = canvasRef.current
      const strokePointLists = strokesRef.current.map((s) => s.points)
      const region = getFocusRegion(strokePointLists, canvas.width, canvas.height, margin)
      return cropToBlob(canvas, region)
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
    />
  )
})

export default DrawingCanvas
