// Instead of sending the whole canvas to the recognize endpoint, compute a
// tight crop around everything drawn so far — cheaper (fewer image tokens)
// and more accurate (the model isn't distracted by empty margin elsewhere
// on the canvas).

// Pure — no DOM dependency, so it's easy to reason about/test in isolation.
// Returns the bounding box of ALL strokes in `strokes`, expanded by
// `margin` and clamped to the canvas bounds.
export function getFocusRegion(strokes, canvasWidth, canvasHeight, margin = 20) {
  if (!strokes || strokes.length === 0) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const point of stroke) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
  }

  const x = Math.max(0, Math.floor(minX - margin))
  const y = Math.max(0, Math.floor(minY - margin))
  const right = Math.min(canvasWidth, Math.ceil(maxX + margin))
  const bottom = Math.min(canvasHeight, Math.ceil(maxY + margin))

  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
}

// Crops `sourceCanvas` to `region` and returns the result as a PNG blob.
export function cropToBlob(sourceCanvas, region) {
  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = region.width
  cropCanvas.height = region.height
  const ctx = cropCanvas.getContext('2d')
  ctx.drawImage(
    sourceCanvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  )
  return new Promise((resolve) => cropCanvas.toBlob(resolve, 'image/png'))
}
