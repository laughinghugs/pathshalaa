// Turns a recognized `shape3d` AICommand (see backend/app/commands.py —
// shape + a dict of plain numeric params) into a parametric surface grid
// Plotly can render. Params are only ever read as numbers here, never
// evaluated as code, matching the safety contract on Shape3DCommand.
const STEPS = 36

export const SHAPE_LABELS = { cone: 'Cone', sphere: 'Sphere', cylinder: 'Cylinder' }

function linspace(start, end, count) {
  if (count <= 1) return [start]
  const step = (end - start) / (count - 1)
  return Array.from({ length: count }, (_, i) => start + step * i)
}

function grid(us, vs, fn) {
  const x = []
  const y = []
  const z = []
  for (const v of vs) {
    const xr = []
    const yr = []
    const zr = []
    for (const u of us) {
      const [px, py, pz] = fn(u, v)
      xr.push(px)
      yr.push(py)
      zr.push(pz)
    }
    x.push(xr)
    y.push(yr)
    z.push(zr)
  }
  return { x, y, z }
}

function numParam(params, keys, fallback) {
  for (const key of keys) {
    const value = params?.[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return fallback
}

export function buildShapeSurface(shape, params = {}) {
  const us = linspace(0, 2 * Math.PI, STEPS)

  if (shape === 'sphere') {
    const radius = numParam(params, ['radius', 'r'], 1)
    const vs = linspace(0, Math.PI, STEPS)
    return {
      ...grid(us, vs, (u, v) => [radius * Math.sin(v) * Math.cos(u), radius * Math.sin(v) * Math.sin(u), radius * Math.cos(v)]),
      summary: { radius },
    }
  }

  if (shape === 'cylinder') {
    const radius = numParam(params, ['radius', 'r'], 1)
    const height = numParam(params, ['height', 'h'], 2)
    const vs = linspace(-height / 2, height / 2, 2)
    return {
      ...grid(us, vs, (u, v) => [radius * Math.cos(u), radius * Math.sin(u), v]),
      summary: { radius, height },
    }
  }

  if (shape === 'cone') {
    const radius = numParam(params, ['radius', 'r'], 1)
    const height = numParam(params, ['height', 'h'], 2)
    const vs = linspace(0, 1, STEPS)
    return {
      ...grid(us, vs, (u, t) => [radius * (1 - t) * Math.cos(u), radius * (1 - t) * Math.sin(u), t * height]),
      summary: { radius, height },
    }
  }

  return null
}
