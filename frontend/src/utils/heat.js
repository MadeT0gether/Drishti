/* Continuous heatmap color scales for choropleth maps.
   Interpolates between ramp stops so shading reads as intensity, not bins. */

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHex([r, g, b]) {
  const c = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Interpolate across an array of hex stops at t ∈ [0,1]. */
export function lerpColor(stops, t) {
  const x = Math.max(0, Math.min(1, t))
  const seg = Math.min(stops.length - 2, Math.floor(x * (stops.length - 1)))
  const local = x * (stops.length - 1) - seg
  const a = hexToRgb(stops[seg])
  const b = hexToRgb(stops[seg + 1])
  return rgbToHex(a.map((av, i) => av + (b[i] - av) * local))
}

/** Map a value in [min,max] onto the ramp. `sqrt` compresses skewed counts. */
export function heatColor(value, min, max, stops, { sqrt = false } = {}) {
  if (value == null || max == null || min == null || max <= min) return stops[0]
  let t = (value - min) / (max - min)
  if (sqrt) t = Math.sqrt(t)
  return lerpColor(stops, t)
}

/* Risk intensity: green (lower risk) → yellow → orange → red (higher risk);
   gray means "not assessed" and is handled by the caller. */
export const RISK_HEAT_STOPS = ['#15803d', '#84cc16', '#eab308', '#ea580c', '#b91c1c']

/* Activity/density intensity: light → deep blue. */
export const ACTIVITY_HEAT_STOPS = ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#172554']

export function cssGradient(stops) {
  return `linear-gradient(to right, ${stops.join(', ')})`
}
