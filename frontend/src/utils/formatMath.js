// Renders a plain number as a clean pi-fraction (e.g. 6.283185... -> "2π",
// 1.047197... -> "π/3") when it's close to one within floating-point
// tolerance, since periods/amplitudes computed from trig functions almost
// always are. Falls back to a plain rounded number otherwise.
export function formatPiMultiple(value, { maxDenominator = 12 } = {}) {
  if (value == null || !Number.isFinite(value)) return null
  const ratio = value / Math.PI
  for (let denom = 1; denom <= maxDenominator; denom++) {
    const numer = Math.round(ratio * denom)
    if (numer === 0) continue
    if (Math.abs(ratio - numer / denom) < 1e-6) {
      const sign = numer < 0 ? '-' : ''
      const n = Math.abs(numer)
      const core = n === 1 ? 'π' : `${n}π`
      return denom === 1 ? `${sign}${core}` : `${sign}${core}/${denom}`
    }
  }
  return null
}

export function formatNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null
  return Number(value.toFixed(digits)).toString()
}
