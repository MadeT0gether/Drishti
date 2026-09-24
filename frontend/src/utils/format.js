// Indian currency formatting: lakh (1e5) / crore (1e7)
export function formatINR(value) {
  if (value === null || value === undefined) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(abs >= 1e9 ? 0 : 2)} Cr`
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(1)} L`
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

export function formatNumber(value) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('en-IN')
}

export function formatPct(value, digits = 0) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(digits)}%`
}

export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function titleCase(s) {
  if (!s) return ''
  return s.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
