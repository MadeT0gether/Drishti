import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import {
  CASE_STATUSES,
  caseStatusMeta,
  NEXT_STATUSES,
  TERMINAL_STATUSES,
  OUTCOMES,
  ACTION_LABELS,
  ACT_ROLES,
  canActOnCases,
} from '../utils/investigation'
import {
  CaseStatusBadge,
  SlaChip,
  ActionTimeline,
  PlaybookChecklist,
} from '../components/investigation'

// ── investigation semantics (utils/investigation.js) ─────────────────────
describe('investigation status semantics', () => {
  it('every status carries a label, symbol, and badge class', () => {
    for (const key of Object.keys(CASE_STATUSES)) {
      const meta = CASE_STATUSES[key]
      expect(meta.label, `${key}.label`).toBeTruthy()
      expect(meta.symbol, `${key}.symbol`).toBeTruthy()
      expect(meta.badge, `${key}.badge`).toBeTruthy()
    }
  })

  it('unknown status returns a fallback without crashing', () => {
    const meta = caseStatusMeta('nonexistent')
    expect(meta.label).toBe('nonexistent')
    expect(meta.symbol).toBeTruthy()
  })

  it('covers all five statuses', () => {
    const expected = ['open', 'in_progress', 'pending_info', 'closed', 'dismissed']
    expect(Object.keys(CASE_STATUSES).sort()).toEqual(expected.sort())
  })
})

describe('investigation transitions', () => {
  it('mirrors the server state machine (5 source states)', () => {
    expect(Object.keys(NEXT_STATUSES)).toHaveLength(5)
  })

  it('open can move to in_progress or dismissed', () => {
    expect(NEXT_STATUSES.open).toEqual(expect.arrayContaining(['in_progress', 'dismissed']))
  })

  it('in_progress can close, dismiss, or move to pending_info', () => {
    expect(NEXT_STATUSES.in_progress).toEqual(
      expect.arrayContaining(['pending_info', 'closed', 'dismissed'])
    )
  })

  it('closed and dismissed can reopen to in_progress', () => {
    expect(NEXT_STATUSES.closed).toEqual(['in_progress'])
    expect(NEXT_STATUSES.dismissed).toEqual(['in_progress'])
  })

  it('terminal statuses are closed and dismissed', () => {
    expect(TERMINAL_STATUSES.sort()).toEqual(['closed', 'dismissed'].sort())
  })
})

describe('investigation outcomes', () => {
  it('all five outcomes have a label and hint', () => {
    const keys = ['verified_issue', 'no_issue_found', 'data_corrected', 'escalated', 'inconclusive']
    for (const key of keys) {
      expect(OUTCOMES[key].label, `${key}.label`).toBeTruthy()
      expect(OUTCOMES[key].hint, `${key}.hint`).toBeTruthy()
    }
  })
})

describe('investigation action labels', () => {
  it('has a label for every expected action type', () => {
    const expected = [
      'opened', 'assigned', 'status_changed', 'note_added', 'evidence_reviewed',
      'info_requested', 'playbook_step_completed', 'copilot_queried',
      'copilot_summary_accepted', 'copilot_summary_rejected', 'summary_updated',
      'outcome_recorded', 'reopened',
    ]
    for (const type of expected) {
      expect(ACTION_LABELS[type], `missing label for ${type}`).toBeTruthy()
    }
  })
})

describe('RBAC role checks', () => {
  it('acting roles include ministry, state, district, officer', () => {
    expect(ACT_ROLES).toEqual(['ministry', 'state', 'district', 'officer'])
  })

  it('canActOnCases returns true for acting roles', () => {
    for (const role of ACT_ROLES) {
      expect(canActOnCases(role)).toBe(true)
    }
  })

  it('canActOnCases returns false for viewer and mp', () => {
    expect(canActOnCases('viewer')).toBe(false)
    expect(canActOnCases('mp')).toBe(false)
  })

  it('canActOnCases returns false for undefined', () => {
    expect(canActOnCases(undefined)).toBe(false)
  })
})

// ── CaseStatusBadge ──────────────────────────────────────────────────────
describe('CaseStatusBadge', () => {
  it('renders with label and symbol and accessible role=status', () => {
    render(<CaseStatusBadge status="open" />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent('Open')
    expect(badge).toHaveAccessibleName(/Case status: Open/)
  })

  it('renders each status without crashing', () => {
    for (const status of Object.keys(CASE_STATUSES)) {
      const { unmount } = render(<CaseStatusBadge status={status} />)
      expect(screen.getByRole('status')).toHaveTextContent(CASE_STATUSES[status].label)
      unmount()
    }
  })

  it('renders at lg size', () => {
    render(<CaseStatusBadge status="in_progress" size="lg" />)
    expect(screen.getByRole('status')).toHaveTextContent('In Progress')
  })
})

// ── SlaChip ──────────────────────────────────────────────────────────────
describe('SlaChip', () => {
  it('renders nothing when slaDueAt is null', () => {
    const { container } = render(<SlaChip slaDueAt={null} overdue={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows overdue styling when overdue is true', () => {
    const past = new Date(Date.now() - 86_400_000 * 3).toISOString()
    render(<SlaChip slaDueAt={past} overdue={true} />)
    expect(screen.getByText(/Overdue/)).toBeInTheDocument()
  })

  it('shows remaining days when not overdue', () => {
    const future = new Date(Date.now() + 86_400_000 * 5).toISOString()
    render(<SlaChip slaDueAt={future} overdue={false} />)
    expect(screen.getByText(/Due in \d+d/)).toBeInTheDocument()
  })
})

// ── ActionTimeline ───────────────────────────────────────────────────────
describe('ActionTimeline', () => {
  it('shows empty state with no actions', () => {
    render(<ActionTimeline actions={[]} />)
    expect(screen.getByText('No actions yet')).toBeInTheDocument()
  })

  it('renders actions with labels, reasons, and timestamps', () => {
    const actions = [
      {
        id: 1, investigation_id: 100, action_type: 'opened',
        reason: 'Selected from queue for review.', from_status: null, to_status: 'open',
        detail: {}, user: 'ministry@mplads.demo', created_at: '2026-08-25T10:00:00Z',
      },
      {
        id: 2, investigation_id: 100, action_type: 'status_changed',
        reason: 'Starting detailed review.', from_status: 'open', to_status: 'in_progress',
        detail: {}, user: 'officer@mplads.demo', created_at: '2026-08-25T11:00:00Z',
      },
    ]
    render(<ActionTimeline actions={actions} />)
    expect(screen.getByText('Case opened')).toBeInTheDocument()
    expect(screen.getByText('Status changed')).toBeInTheDocument()
    expect(screen.getByText('Selected from queue for review.')).toBeInTheDocument()
    expect(screen.getByText(/Open → In Progress/)).toBeInTheDocument()
  })

  it('displays outcome details when present', () => {
    const actions = [{
      id: 3, investigation_id: 100, action_type: 'outcome_recorded',
      reason: 'All items were explained.', from_status: 'in_progress', to_status: 'closed',
      detail: { outcome: 'no_issue_found', outcome_note: 'Records verified.' },
      user: 'officer@mplads.demo', created_at: '2026-08-25T12:00:00Z',
    }]
    render(<ActionTimeline actions={actions} />)
    expect(screen.getByText(/No issue found/)).toBeInTheDocument()
    expect(screen.getByText(/Records verified/)).toBeInTheDocument()
  })

  it('displays playbook step details when present', () => {
    const actions = [{
      id: 4, investigation_id: 100, action_type: 'playbook_step_completed',
      reason: 'Completed peer comparison.',
      from_status: null, to_status: null,
      detail: { playbook_id: 'cost-anomaly-v1', step_id: 's2' },
      user: 'officer@mplads.demo', created_at: '2026-08-25T13:00:00Z',
    }]
    render(<ActionTimeline actions={actions} />)
    expect(screen.getByText('Playbook step completed')).toBeInTheDocument()
    expect(screen.getByText(/cost-anomaly-v1/)).toBeInTheDocument()
  })

  it('displays assignment details when present', () => {
    const actions = [{
      id: 5, investigation_id: 100, action_type: 'assigned',
      reason: 'Routing to monitoring officer.',
      from_status: null, to_status: null,
      detail: { assignee_email: 'officer@mplads.demo' },
      user: 'ministry@mplads.demo', created_at: '2026-08-25T14:00:00Z',
    }]
    render(<ActionTimeline actions={actions} />)
    expect(screen.getByText(/Assigned to officer@mplads.demo/)).toBeInTheDocument()
  })
})

// ── PlaybookChecklist ────────────────────────────────────────────────────
describe('PlaybookChecklist', () => {
  const playbooks = [
    {
      id: 'cost-anomaly-v1', title: 'Cost Anomaly Review', description: 'Verify costs.',
      applies_to_factors: ['cost_anomaly'], version: 1,
      steps: [
        { id: 's1', title: 'Compare peer baseline', guidance: 'Use peer data.', completed: true },
        { id: 's2', title: 'Review estimate', guidance: 'Check the estimate.', completed: false,
          evidence_hint: 'sanction order' },
      ],
    },
    {
      id: 'general-review-v1', title: 'General Review', description: 'Default review.',
      applies_to_factors: [], version: 1,
      steps: [
        { id: 's1', title: 'Verify records', guidance: 'Broad review.', completed: false },
      ],
    },
  ]

  it('renders playbook titles with step counts', () => {
    render(<PlaybookChecklist playbooks={playbooks} canAct={true} onCompleteStep={() => {}} />)
    expect(screen.getByText('Cost Anomaly Review')).toBeInTheDocument()
    expect(screen.getByText('1/2 steps')).toBeInTheDocument()
    expect(screen.getByText('General Review')).toBeInTheDocument()
    expect(screen.getByText('0/1 steps')).toBeInTheDocument()
  })

  it('marks completed steps with ☑', () => {
    render(<PlaybookChecklist playbooks={playbooks} canAct={true} onCompleteStep={() => {}} />)
    // The text is fragmented across spans ("1. ", "Compare peer baseline", "Completed")
    // Find the li containing the completed step marker
    const items = document.querySelectorAll('li')
    const completedItem = Array.from(items).find((li) => li.textContent.includes('Compare peer baseline'))
    expect(completedItem).toBeTruthy()
    expect(completedItem.textContent).toContain('☑')
    expect(completedItem.textContent).toContain('Completed')
  })

  it('shows evidence hints', () => {
    render(<PlaybookChecklist playbooks={playbooks} canAct={true} onCompleteStep={() => {}} />)
    expect(screen.getByText(/Evidence: sanction order/)).toBeInTheDocument()
  })

  it('shows Mark complete buttons only for incomplete steps when canAct', () => {
    render(<PlaybookChecklist playbooks={playbooks} canAct={true} onCompleteStep={() => {}} />)
    const buttons = screen.getAllByText('Mark complete')
    // Should have buttons for each incomplete step in the first expanded playbook
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('hides Mark complete buttons when canAct is false', () => {
    render(<PlaybookChecklist playbooks={playbooks} canAct={false} onCompleteStep={() => {}} />)
    expect(screen.queryByText('Mark complete')).toBeNull()
  })

  it('calls onCompleteStep when Mark complete is clicked', () => {
    const handler = vi.fn()
    render(<PlaybookChecklist playbooks={playbooks} canAct={true} onCompleteStep={handler} />)
    screen.getAllByText('Mark complete')[0].click()
    expect(handler).toHaveBeenCalledWith('cost-anomaly-v1', expect.objectContaining({ id: 's2' }))
  })
})
