// Investigation semantics: like risk levels, every status/outcome carries a
// label and symbol — never color alone.

export const CASE_STATUSES = {
  open: {
    label: 'Open', symbol: '○',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  in_progress: {
    label: 'In Progress', symbol: '◐',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  pending_info: {
    label: 'Pending Info', symbol: '◍',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  closed: {
    label: 'Closed', symbol: '●',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  dismissed: {
    label: 'Dismissed', symbol: '◌',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
  },
}

export const caseStatusMeta = (status) => CASE_STATUSES[status] ?? {
  label: status, symbol: '·', badge: 'bg-slate-100 text-slate-600 border-slate-200',
}

// Mirrors VALID_TRANSITIONS on the server (the server remains authoritative).
export const NEXT_STATUSES = {
  open: ['in_progress', 'dismissed'],
  in_progress: ['pending_info', 'closed', 'dismissed'],
  pending_info: ['in_progress', 'closed'],
  closed: ['in_progress'],
  dismissed: ['in_progress'],
}

export const TERMINAL_STATUSES = ['closed', 'dismissed']

export const OUTCOMES = {
  verified_issue: { label: 'Verified issue', hint: 'A reviewable issue was confirmed from records.' },
  no_issue_found: { label: 'No issue found', hint: 'Flagged indicators were explained by verified records.' },
  data_corrected: { label: 'Data corrected', hint: 'The signals traced to record errors, now corrected.' },
  escalated: { label: 'Escalated', hint: 'Referred to the competent authority with documented evidence.' },
  inconclusive: { label: 'Inconclusive', hint: 'Required information could not be obtained.' },
}

export const ACTION_LABELS = {
  opened: 'Case opened',
  assigned: 'Assigned',
  status_changed: 'Status changed',
  note_added: 'Note',
  evidence_reviewed: 'Evidence reviewed',
  info_requested: 'Information requested',
  playbook_step_completed: 'Playbook step completed',
  copilot_queried: 'Copilot consulted',
  copilot_summary_accepted: 'AI summary accepted',
  copilot_summary_rejected: 'AI summary rejected',
  summary_updated: 'Summary updated',
  outcome_recorded: 'Outcome recorded',
  reopened: 'Case reopened',
}

export const ACT_ROLES = ['ministry', 'state', 'district', 'officer']
export const canActOnCases = (role) => ACT_ROLES.includes(role)

/* "See broadly, act narrowly" (mirrors the server, which stays authoritative):
   a monitoring officer reads nationally but may act only on cases assigned to
   them — except taking ownership of an unassigned case — and never records
   final decisions (close/dismiss). */
export const canActOnCase = (user, c) =>
  canActOnCases(user?.role) &&
  (user?.role !== 'officer' || c?.assigned_to === user?.email)

export const canDecideCase = (role) =>
  canActOnCases(role) && role !== 'officer'
