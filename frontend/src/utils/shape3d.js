// Turns a recognized `shape3d` / `shape_mensuration` AICommand (see
// backend/app/commands.py — shape + a dict of plain numeric params) into
// parametric surface grids Plotly can render, plus small text labels for
// whichever dimensions were actually given. Params/dimensions are only
// ever read as numbers here, never evaluated as code, matching the safety
// contract on Shape3DCommand/ShapeMensurationCommand.
const STEPS = 36

export const SHAPE_LABELS = { cone: 'Cone', sphere: 'Sphere', cylinder: 'Cylinder', cuboid: 'Cuboid' }

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

function labelText(name, value, unit) {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100
  return unit ? `${name} = ${rounded} ${unit}` : `${name} = ${rounded}`
}

// A box as 6 flat quads rather than one continuous parametric surface —
// Plotly's `surface` trace type expects one topological sheet (which is
// natural for a sphere/cylinder/cone but not a box), so a cuboid renders
// as several small independent surfaces instead of one.
function boxFaces(length, width, height) {
  const hl = length / 2
  const hw = width / 2
  const hh = height / 2
  const face = (fn) => grid([-1, 1], [-1, 1], fn)
  return [
    face((a, b) => [a * hl, b * hw, -hh]), // bottom
    face((a, b) => [a * hl, b * hw, hh]), // top
    face((a, b) => [a * hl, -hw, b * hh]), // front
    face((a, b) => [a * hl, hw, b * hh]), // back
    face((a, b) => [-hl, a * hw, b * hh]), // left
    face((a, b) => [hl, a * hw, b * hh]), // right
  ]
}

export function buildShapeSurface(shape, params = {}) {
  const us = linspace(0, 2 * Math.PI, STEPS)
  const unit = typeof params.unit === 'string' ? params.unit : ''

  if (shape === 'sphere') {
    const radius = numParam(params, ['radius', 'r'], 1)
    const vs = linspace(0, Math.PI, STEPS)
    return {
      surfaces: [grid(us, vs, (u, v) => [radius * Math.sin(v) * Math.cos(u), radius * Math.sin(v) * Math.sin(u), radius * Math.cos(v)])],
      labels: [{ x: radius * 1.15, y: 0, z: 0, text: labelText('r', radius, unit) }],
      summary: { radius },
    }
  }

  if (shape === 'cylinder') {
    const radius = numParam(params, ['radius', 'r'], 1)
    const height = numParam(params, ['height', 'h'], 2)
    const vs = linspace(-height / 2, height / 2, 2)
    return {
      surfaces: [grid(us, vs, (u, v) => [radius * Math.cos(u), radius * Math.sin(u), v])],
      // Both offsets are radius*1.15 so neither label ever sits inside the
      // cylinder's circular cross-section (radius*1.15 > radius at every
      // height) — placing a label near the central axis instead would put
      // it inside the opaque surface, where it's occluded from outside.
      labels: [
        { x: radius * 1.15, y: 0, z: 0, text: labelText('r', radius, unit) },
        { x: 0, y: radius * 1.15, z: height / 2, text: labelText('h', height, unit) },
      ],
      summary: { radius, height },
    }
  }

  if (shape === 'cone') {
    const radius = numParam(params, ['radius', 'r'], 1)
    const height = numParam(params, ['height', 'h'], 2)
    const vs = linspace(0, 1, STEPS)
    return {
      surfaces: [grid(us, vs, (u, t) => [radius * (1 - t) * Math.cos(u), radius * (1 - t) * Math.sin(u), t * height])],
      // Same reasoning as cylinder — offset radius*1.15 stays outside the
      // cone's surface at every height, since the cone only narrows as z
      // increases from its widest point (radius, at z=0).
      labels: [
        { x: radius * 1.15, y: 0, z: 0, text: labelText('r', radius, unit) },
        { x: 0, y: radius * 1.15, z: height / 2, text: labelText('h', height, unit) },
      ],
      summary: { radius, height },
    }
  }

  if (shape === 'cuboid') {
    const length = numParam(params, ['length', 'l'], 2)
    const width = numParam(params, ['width', 'w'], 2)
    const height = numParam(params, ['height', 'h'], 2)
    const pad = Math.max(length, width, height) * 0.12
    return {
      surfaces: boxFaces(length, width, height),
      labels: [
        { x: 0, y: -width / 2 - pad, z: -height / 2 - pad, text: labelText('l', length, unit) },
        { x: length / 2 + pad, y: 0, z: -height / 2 - pad, text: labelText('w', width, unit) },
        { x: length / 2 + pad, y: -width / 2 - pad, z: 0, text: labelText('h', height, unit) },
      ],
      summary: { length, width, height },
    }
  }

  return null
}

// Shared by Shape3DCard's inline preview and ThreeDView's fullscreen render
// so a surface + its labels always render the same way in both places.
export function buildPlotlyTraces(built, { colorscale = 'Blues', labelColor } = {}) {
  if (!built) return []
  const surfaceTraces = built.surfaces.map((s) => ({
    x: s.x,
    y: s.y,
    z: s.z,
    type: 'surface',
    showscale: false,
    colorscale,
  }))
  if (!built.labels?.length) return surfaceTraces
  return [
    ...surfaceTraces,
    {
      type: 'scatter3d',
      mode: 'text',
      x: built.labels.map((l) => l.x),
      y: built.labels.map((l) => l.y),
      z: built.labels.map((l) => l.z),
      text: built.labels.map((l) => l.text),
      textfont: { size: 13, color: labelColor },
      hoverinfo: 'skip',
      showlegend: false,
    },
  ]
}
