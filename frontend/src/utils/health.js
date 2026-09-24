// District Health semantics — like risk levels, label + symbol always
// accompany color (never color alone).

export const HEALTH_BANDS = {
  steady: {
    label: 'Steady', symbol: '●',
    text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',
    chart: '#059669',
  },
  watch: {
    label: 'Watch', symbol: '◆',
    text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200',
    chart: '#d97706',
  },
  needs_attention: {
    label: 'Needs attention', symbol: '▲',
    text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200',
    chart: '#dc2626',
  },
}

export const healthMeta = (band) => HEALTH_BANDS[band] ?? {
  label: 'Not scored', symbol: '○',
  text: 'text-text-muted', bg: 'bg-surface', border: 'border-border', chart: '#98a2b3',
}

export const HEALTH_COMPONENT_LABELS = {
  delivery: 'Delivery (completion)',
  timeliness: 'Timeliness (on-time completion)',
  risk_exposure: 'Risk exposure',
  signal_load: 'Signal load (anomalies)',
  financial_discipline: 'Financial discipline (utilization)',
}
