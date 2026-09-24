import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HEALTH_BANDS, healthMeta } from '../utils/health'
import { MAP_MODES, MapLegend } from '../components/maps/RiskMap'
import { Modal } from '../components/ui'
import EvaluationDashboard from '../components/charts/EvaluationDashboard'
import RelationshipGraph from '../components/charts/RelationshipGraph'

// ── health semantics ──────────────────────────────────────────────────────
describe('health semantics', () => {
  it('every band carries label and symbol (never color-only)', () => {
    for (const band of Object.keys(HEALTH_BANDS)) {
      const m = healthMeta(band)
      expect(m.label).toBeTruthy()
      expect(m.symbol).toBeTruthy()
    }
  })
  it('unknown band falls back to Not scored', () => {
    expect(healthMeta(null).label).toBe('Not scored')
  })
  it('band labels are neutral vocabulary', () => {
    const labels = Object.values(HEALTH_BANDS).map((b) => b.label.toLowerCase())
    for (const banned of ['fraud', 'corrupt', 'guilty']) {
      expect(labels.some((l) => l.includes(banned))).toBe(false)
    }
  })
})

// ── map modes ─────────────────────────────────────────────────────────────
describe('map modes', () => {
  it('exposes the four choropleth modes with legends', () => {
    expect(Object.keys(MAP_MODES)).toEqual(['risk', 'health', 'density', 'investigations'])
    for (const m of Object.values(MAP_MODES)) {
      expect(m.legend.length).toBeGreaterThanOrEqual(4)
      expect(m.note).toBeTruthy()
    }
  })
  it('renders the health legend with symbols', () => {
    render(<MapLegend mode="health" />)
    expect(screen.getByText(/● Steady/)).toBeInTheDocument()
    expect(screen.getByText(/▲ Needs attention/)).toBeInTheDocument()
  })
})

// ── modal accessibility ───────────────────────────────────────────────────
describe('Modal', () => {
  it('labels the dialog, focuses inside, closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal label="Test dialog" onClose={onClose}>
        <button>First</button>
        <button>Second</button>
      </Modal>
    )
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    expect(dialog).toBeInTheDocument()
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

// ── evaluation dashboard ──────────────────────────────────────────────────
const EVAL_FIXTURE = {
  dataset_version: 'demo-v2',
  dataset_seed: 42,
  n_projects_evaluable: 23352,
  methodology_notes: ['Ground truth = injected anomaly ledger; detectors never read the ledger.'],
  metrics: {
    risk_ranking: { precision_at_10: 1, precision_at_50: 1, precision_at_100: 1,
                    precision_at_250: 0.972, ground_truth_positive_projects: 4122 },
    duplicate_ranked_queue: { precision_at_100: 0.3, precision_at_200: 0.51,
                              precision_at_300: 0.413, precision_at_500: 0.332,
                              hard_negatives_in_top_100: 0, hard_negatives_in_top_200: 0,
                              hard_negatives_in_top_300: 1, hard_negatives_in_top_500: 1 },
    delay_model_heldout: { mae_days: 15.31, rmse_days: 23.39, test_rows: 4956,
                           feature_importance: { progress_gap: 0.47, progress: 0.29 },
                           delayed_gt_60d_classification: { f1: 0.917,
                             confusion: { tp: 1762, fp: 142, tn: 2877, fn: 175 } } },
    overrun_model_heldout: { f1: 0.994, precision: 1, recall: 0.988,
                             confusion: { tp: 791, fp: 0, tn: 5323, fn: 10 } },
    reconciliation: { precision: 0.887, recall: 0.978, f1: 0.93, tp: 400, fp: 51, fn: 9,
                      per_variant: { amount_mismatch: { total: 68, caught: 68, recall: 1 } } },
    cost_anomaly: { precision: 0.259, recall: 0.422, f1: 0.321, tp: 171, fp: 490, fn: 234 },
  },
}

describe('EvaluationDashboard', () => {
  it('renders stat tiles and all sections from real artifact shape', () => {
    render(<EvaluationDashboard evaluation={EVAL_FIXTURE} />)
    expect(screen.getByText('demo-v2')).toBeInTheDocument()
    expect(screen.getByText('15.31 days')).toBeInTheDocument()
    expect(screen.getByText(/Risk ranking — precision at K/)).toBeInTheDocument()
    expect(screen.getByText(/Delay >60 days — confusion matrix/)).toBeInTheDocument()
    expect(screen.getByText(/feature importance/)).toBeInTheDocument()
    expect(screen.getByText(/recall by mismatch variant/)).toBeInTheDocument()
    expect(screen.getByText(/Detector precision \/ recall \/ F1/)).toBeInTheDocument()
    expect(screen.getByText(/Methodology & limitations/)).toBeInTheDocument()
    // exact counts visible in the confusion grid
    expect(screen.getByText('1,762')).toBeInTheDocument()
  })
  it('omits sections whose data is absent instead of inventing them', () => {
    const noDelay = { ...EVAL_FIXTURE,
      metrics: { ...EVAL_FIXTURE.metrics, delay_model_heldout: undefined } }
    render(<EvaluationDashboard evaluation={noDelay} />)
    expect(screen.queryByText(/Delay >60 days — confusion matrix/)).not.toBeInTheDocument()
  })
})

// ── field feedback loop (stage 7) ─────────────────────────────────────────
const FEEDBACK_FIXTURE = {
  ...EVAL_FIXTURE,
  field_feedback: {
    closed_cases_with_outcome: 6,
    confirmed: 4,
    refuted: 1,
    inconclusive: 1,
    agreement_rate: 0.8,
    by_signal: {
      cost_anomaly: { confirmed: 3, refuted: 1, inconclusive: 0, agreement_rate: 0.75 },
      payment_anomaly: { confirmed: 2, refuted: 0, inconclusive: 1, agreement_rate: 1 },
    },
    note: 'Advisory calibration signal from closed-case outcomes.',
  },
}

describe('FieldFeedback', () => {
  it('renders agreement stats and per-signal rows when feedback exists', () => {
    render(<EvaluationDashboard evaluation={FEEDBACK_FIXTURE} />)
    expect(screen.getByText(/Field feedback — outcome agreement by signal/)).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('Cost Anomaly')).toBeInTheDocument()
    expect(screen.getByText(/Advisory calibration signal/)).toBeInTheDocument()
  })
  it('omits the section when no closed-case feedback exists yet', () => {
    render(<EvaluationDashboard evaluation={EVAL_FIXTURE} />)
    expect(screen.queryByText(/Field feedback — outcome agreement by signal/)).not.toBeInTheDocument()
  })
})
const REL_FIXTURE = {
  project_id: 56,
  edges: [
    { relationship_type: 'implemented_by', entity_type: 'agency', entity_id: 9,
      entity_name: 'Pune Zilla Parishad', detail: { agency_total_projects: 120, agency_type: 'panchayat' } },
    { relationship_type: 'contracted_to', entity_type: 'vendor', entity_id: 22,
      entity_name: 'Shree Constructions', detail: { vendor_total_projects: 40, projects_with_same_agency: 15 } },
  ],
  signals: [{ signal_type: 'agency_vendor_repeat', score: 70, severity: 'high',
              detail: { pair_projects: 15 } }],
  related_projects: [
    { project_id: 77, code: 'MPL-2025-000077', title: 'Road works', shared: 'agency_vendor' },
  ],
}

describe('RelationshipGraph', () => {
  it('renders nodes, edges, legend filters and neutral vocabulary', () => {
    const { container } = render(
      <MemoryRouter><RelationshipGraph relationships={REL_FIXTURE} similar={[]} /></MemoryRouter>)
    expect(container.querySelectorAll('g[role="button"]').length).toBe(4) // project, agency, vendor, related
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('Shared vendor')).toBeInTheDocument()
    expect(screen.getByText(/never findings of collusion/)).toBeInTheDocument()
    expect(screen.queryByText(/collusion confirmed/i)).not.toBeInTheDocument()
  })
  it('node selection shows edge explanations', () => {
    const { container } = render(
      <MemoryRouter><RelationshipGraph relationships={REL_FIXTURE} similar={[]} /></MemoryRouter>)
    const vendorNode = [...container.querySelectorAll('g[role="button"]')]
      .find((g) => g.getAttribute('aria-label')?.includes('Vendor'))
    fireEvent.click(vendorNode)
    expect(screen.getByText(/Contracted to Shree Constructions/)).toBeInTheDocument()
  })
})
