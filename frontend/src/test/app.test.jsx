import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { formatINR, formatPct, titleCase } from '../utils/format'
import { riskMeta, AI_DISCLAIMER } from '../utils/risk'
import { ProgressBar, RiskBadge, StatusBadge, EmptyState, ErrorState } from '../components/ui'
import RiskCard from '../components/risk/RiskCard'

// ── formatters ────────────────────────────────────────────────────────────
describe('formatters', () => {
  it('formats crore and lakh amounts', () => {
    expect(formatINR(32_593_111_480)).toBe('₹3259 Cr')
    expect(formatINR(25_000_000)).toBe('₹2.50 Cr')
    expect(formatINR(3_315_147)).toBe('₹33.2 L')
    expect(formatINR(21_928)).toBe('₹21,928')
  })
  it('handles null values without crashing', () => {
    expect(formatINR(null)).toBe('—')
    expect(formatPct(undefined)).toBe('—')
  })
  it('title-cases snake case', () => {
    expect(titleCase('progress_payment_mismatch')).toBe('Progress Payment Mismatch')
  })
})

// ── risk semantics ────────────────────────────────────────────────────────
describe('risk semantics', () => {
  it('maps every level with label and symbol (never color-only)', () => {
    for (const level of ['low', 'moderate', 'high', 'critical']) {
      const m = riskMeta(level)
      expect(m.label).toBeTruthy()
      expect(m.symbol).toBeTruthy()
    }
  })
  it('unknown level falls back to not-assessed', () => {
    expect(riskMeta(null).label).toBe('Not assessed')
  })
  it('disclaimer uses responsible-AI language', () => {
    expect(AI_DISCLAIMER).toMatch(/decision-support signals/)
    expect(AI_DISCLAIMER).toMatch(/do not constitute findings/)
  })
})

// ── components ────────────────────────────────────────────────────────────
describe('RiskBadge', () => {
  it('renders score, label, and accessible status role', () => {
    render(<RiskBadge level="critical" score={81.15} />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent('81')
    expect(badge).toHaveTextContent('Critical')
    expect(badge).toHaveAccessibleName(/Risk level: Critical, score 81/)
  })
})

describe('StatusBadge', () => {
  it('humanizes status values', () => {
    render(<StatusBadge status="in_progress" />)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('exposes progressbar semantics and clamps values', () => {
    render(<ProgressBar value={120} label="Physical progress" />)
    const bar = screen.getByRole('progressbar', { name: 'Physical progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
  })
})

describe('states', () => {
  it('empty state is not styled as an error', () => {
    render(<EmptyState title="No alerts" message="No active alerts within your current scope." />)
    expect(screen.getByText('No alerts')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('error state offers retry for server errors', () => {
    const retry = vi.fn()
    render(<ErrorState error={{ response: { status: 500 } }} onRetry={retry} />)
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(retry).toHaveBeenCalled()
  })
  it('403 shows access-denied without retry', () => {
    render(<ErrorState error={{ response: { status: 403 } }} onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/not authorized/)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

// ── Risk Card renders real API shape ──────────────────────────────────────
const RISK_FIXTURE = {
  project_id: 25001, risk_score: 81.15, risk_level: 'critical',
  evidence_strength: 'high', data_completeness_pct: 100, signal_count: 5,
  model_version: 'risk-v0.1', assessed_at: '2026-08-24T18:47:19',
  factors: [
    { factor_type: 'cost_anomaly', contribution: 22.52, severity: 'high',
      evidence: { deviation_pct: 164.3, peer_n: 68, peer_median: 1254397, sanctioned_cost: 3315147, robust_z: 3.86 },
      explanation: 'Sanctioned cost above peers.' },
    { factor_type: 'delay_risk', contribution: 14.2, severity: 'high',
      evidence: { predicted_delay_days: 141 }, explanation: 'Predicted delay.' },
  ],
}

describe('RiskCard', () => {
  it('renders score, level, evidence strength, model version and factors from API data', () => {
    render(<RiskCard risk={RISK_FIXTURE} />)
    expect(screen.getByText('81')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText(/Evidence strength/)).toHaveTextContent(/high/i)
    expect(screen.getByText(/Model risk-v0.1/)).toBeInTheDocument()
    expect(screen.getByText('Cost Anomaly')).toBeInTheDocument()
    expect(screen.getByText('164% above peer median (68 peers)')).toBeInTheDocument()
    expect(screen.getByText('Predicted 141 days behind schedule')).toBeInTheDocument()
  })
  it('always shows the responsible-AI disclaimer', () => {
    render(<RiskCard risk={RISK_FIXTURE} />)
    expect(screen.getByText(/decision-support signals/)).toBeInTheDocument()
  })
})

// ── protected routing ─────────────────────────────────────────────────────
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}))

describe('protected routing', () => {
  it('redirects unauthenticated users to login', async () => {
    const { default: App } = await import('../App')
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Routes><Route path="*" element={<App />} /></Routes>
      </MemoryRouter>
    )
    // App renders its own Routes; unauthenticated -> Login page content
    expect(await screen.findByText(/Secure authentication for authorized government officers/, {}, { timeout: 8000 })).toBeInTheDocument()
  }, 15000)
})
