import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cropToBlob, getFocusRegion } from '../utils/focusRegion'

const DrawingCanvas = forwardRef(function DrawingCanvas(
  { width = 500, height = 220, onChange, onStrokeStart, onStrokeEnd },
  ref,
) {
  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const currentStrokeRef = useRef(null)
  const drawingRef = useRef(false)

  function getContext() {
    return canvasRef.current.getContext('2d')
  }

  function drawStroke(ctx, stroke) {
    if (stroke.length < 2) return
    ctx.beginPath()
    ctx.moveTo(stroke[0].x, stroke[0].y)
    for (const point of stroke.slice(1)) {
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
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke)
    }
  }

  useEffect(() => {
    redraw()
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
    currentStrokeRef.current = [getPoint(e)]
    onStrokeStart?.()
  }

  function handlePointerMove(e) {
    if (!drawingRef.current) return
    currentStrokeRef.current.push(getPoint(e))
    redraw()
    drawStroke(getContext(), currentStrokeRef.current)
  }

  function handlePointerUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (currentStrokeRef.current && currentStrokeRef.current.length > 1) {
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
      const region = getFocusRegion(strokesRef.current, canvas.width, canvas.height, margin)
      return cropToBlob(canvas, region)
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  )
})

export default DrawingCanvas
