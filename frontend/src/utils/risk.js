// Single source of risk semantics for the UI. Never color-only:
// every level carries a label and a symbol for accessibility.
export const RISK_LEVELS = {
  low: {
    label: 'Low', symbol: '●',
    text: 'text-risk-low', bg: 'bg-slate-100', border: 'border-slate-200',
    chart: '#64748b',
  },
  moderate: {
    label: 'Moderate', symbol: '◆',
    text: 'text-risk-moderate', bg: 'bg-amber-50', border: 'border-amber-200',
    chart: '#d97706',
  },
  high: {
    label: 'High', symbol: '▲',
    text: 'text-risk-high', bg: 'bg-orange-50', border: 'border-orange-200',
    chart: '#ea580c',
  },
  critical: {
    label: 'Critical', symbol: '■',
    text: 'text-risk-critical', bg: 'bg-red-50', border: 'border-red-200',
    chart: '#dc2626',
  },
}

export const riskMeta = (level) => RISK_LEVELS[level] ?? {
  label: 'Not assessed', symbol: '○',
  text: 'text-text-muted', bg: 'bg-surface', border: 'border-border', chart: '#98a2b3',
}

export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export const AI_DISCLAIMER =
  'AI-generated indicators are decision-support signals and do not constitute ' +
  'findings of fraud or misconduct. Final decisions remain with authorized officials.'
