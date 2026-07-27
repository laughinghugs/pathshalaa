// Mirrors backend/app/commands.py — every AI command returned from
// /api/recognize is validated here too (defense in depth) before it's ever
// rendered, since the frontend shouldn't blindly trust the network even
// though the backend already validated it.

const VALIDATORS = {
  latex: (cmd) => typeof cmd.content === 'string',
  graph: (cmd) =>
    typeof cmd.function === 'string' &&
    Array.isArray(cmd.domain) &&
    cmd.domain.length === 2 &&
    cmd.domain.every((v) => typeof v === 'number'),
  shape3d: (cmd) =>
    ['cone', 'sphere', 'cylinder'].includes(cmd.shape) &&
    isPlainObject(cmd.params) &&
    // Params must stay declarative numeric fields (radius, height, etc.)
    // — NEVER a code/script field. Never eval/exec anything derived from
    // an AI command; a future 3D renderer must only ever read these as
    // plain numbers to size a shape.
    Object.values(cmd.params).every((v) => typeof v === 'number'),
  solve_equation: (cmd) =>
    typeof cmd.content === 'string' &&
    (cmd.range_min === undefined || cmd.range_min === null || typeof cmd.range_min === 'string') &&
    (cmd.range_max === undefined || cmd.range_max === null || typeof cmd.range_max === 'string'),
  shape_mensuration: (cmd) =>
    ['cone', 'sphere', 'cylinder', 'cuboid'].includes(cmd.shape) &&
    isPlainObject(cmd.dimensions) &&
    // Missing dimensions are expected here (the teacher fills them in on
    // the draft card) — only reject if a *present* one isn't a number.
    Object.values(cmd.dimensions).every((v) => v === null || v === undefined || typeof v === 'number') &&
    (cmd.unit === undefined || cmd.unit === null || typeof cmd.unit === 'string'),
  solution_steps: (cmd) => Array.isArray(cmd.steps) && cmd.steps.every((s) => typeof s === 'string'),
  translation: (cmd) => typeof cmd.text === 'string' && typeof cmd.language === 'string',
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateCommand(cmd) {
  if (!isPlainObject(cmd) || typeof cmd.type !== 'string') {
    return { valid: false, error: 'Command is missing a type' }
  }
  const validator = VALIDATORS[cmd.type]
  if (!validator) {
    return { valid: false, error: `Unrecognized command type: ${cmd.type}` }
  }
  if (!validator(cmd)) {
    return { valid: false, error: `Malformed ${cmd.type} command` }
  }
  return { valid: true, error: null }
}

export function validateCommands(commands) {
  if (!Array.isArray(commands)) return []
  return commands.filter((cmd) => validateCommand(cmd).valid)
}
