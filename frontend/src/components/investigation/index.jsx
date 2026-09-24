import { useState } from 'react'
import { ACTION_LABELS, NEXT_STATUSES, OUTCOMES, TERMINAL_STATUSES, caseStatusMeta } from '../../utils/investigation'
import { formatDateTime, titleCase } from '../../utils/format'
import { EmptyState, Modal } from '../ui'

export function CaseStatusBadge({ status, size = 'sm' }) {
  const meta = caseStatusMeta(status)
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span role="status" aria-label={`Case status: ${meta.label}`}
          className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${meta.badge} ${pad}`}>
      <span aria-hidden="true" className="text-[0.7em] leading-none">{meta.symbol}</span>
      {meta.label}
    </span>
  )
}

export function SlaChip({ slaDueAt, overdue }) {
  if (!slaDueAt) return null
  const due = new Date(slaDueAt)
  const days = Math.ceil((due - Date.now()) / 86_400_000)
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
      overdue ? 'border-red-200 bg-red-50 text-red-700' : 'border-border bg-background text-text-secondary'}`}>
      {overdue ? `Overdue — due ${due.toLocaleDateString()}` : `Due in ${days}d`}
    </span>
  )
}

export function ActionTimeline({ actions }) {
  if (!actions?.length) {
    return <EmptyState title="No actions yet" message="Every step taken on this case will be recorded here." />
  }
  return (
    <ol className="divide-y divide-border">
      {actions.map((a) => (
        <li key={a.id} className="px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="font-semibold text-text-primary">
              {ACTION_LABELS[a.action_type] ?? titleCase(a.action_type)}
            </span>
            {a.from_status && a.to_status && (
              <span>{titleCase(a.from_status)} → {titleCase(a.to_status)}</span>
            )}
            <span className="ml-auto">{a.user} · {formatDateTime(a.created_at)}</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{a.reason}</p>
          {a.detail?.outcome && (
            <p className="mt-1 text-xs text-text-muted">
              Outcome: <strong>{OUTCOMES[a.detail.outcome]?.label ?? a.detail.outcome}</strong>
              {a.detail.outcome_note ? ` — ${a.detail.outcome_note}` : ''}
            </p>
          )}
          {a.detail?.playbook_id && (
            <p className="mt-1 text-xs text-text-muted">
              Playbook: {a.detail.playbook_id} · step {a.detail.step_id}
            </p>
          )}
          {a.detail?.assignee_email && (
            <p className="mt-1 text-xs text-text-muted">Assigned to {a.detail.assignee_email}</p>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Modal for state-machine transitions. Reason always required; closing
 *  statuses additionally require an outcome + note. The server re-validates. */
export function TransitionDialog({ currentStatus, onSubmit, onClose, pending, error, allowTerminal = true }) {
  /* Monitoring officers cannot record final decisions — closing statuses are
     filtered out for them (the server enforces the same rule). */
  const options = (NEXT_STATUSES[currentStatus] ?? [])
    .filter((s) => allowTerminal || !TERMINAL_STATUSES.includes(s))
  const [toStatus, setToStatus] = useState(options[0] ?? '')
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState('')
  const [outcomeNote, setOutcomeNote] = useState('')
  const closing = TERMINAL_STATUSES.includes(toStatus)
  const valid = toStatus && reason.trim().length >= 10 &&
    (!closing || (outcome && outcomeNote.trim().length > 0))

  return (
    <Modal label="Change case status" onClose={onClose}>
        <h3 className="text-sm font-semibold text-text-primary">Change case status</h3>
        <p className="mt-0.5 text-xs text-text-muted">
          This is a human decision and will be permanently recorded with your reason.
        </p>
        <div className="mt-4 space-y-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            New status
            <select value={toStatus} onChange={(e) => setToStatus(e.target.value)}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              {options.map((s) => (
                <option key={s} value={s}>{caseStatusMeta(s).label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            Reason (required, min 10 characters)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                      placeholder="Why are you making this change?" />
          </label>
          {closing && (
            <>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
                Outcome (required to close)
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)}
                        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                  <option value="">Select an outcome…</option>
                  {Object.entries(OUTCOMES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </label>
              {outcome && <p className="text-xs text-text-muted">{OUTCOMES[outcome]?.hint}</p>}
              <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
                Outcome note (required)
                <textarea value={outcomeNote} onChange={(e) => setOutcomeNote(e.target.value)} rows={3}
                          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                          placeholder="What did the review establish, based on which records?" />
              </label>
            </>
          )}
          {error && (
            <p className="text-xs font-medium text-danger" role="alert">
              {error.response?.data?.detail ?? 'The transition was rejected.'}
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary">
            Cancel
          </button>
          <button disabled={!valid || pending}
                  onClick={() => onSubmit({ to_status: toStatus, reason: reason.trim(),
                                            ...(closing ? { outcome, outcome_note: outcomeNote.trim() } : {}) })}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
            {pending ? 'Saving…' : 'Confirm'}
          </button>
        </div>
    </Modal>
  )
}

export function PlaybookChecklist({ playbooks, canAct, onCompleteStep, pendingStep }) {
  const [openId, setOpenId] = useState(playbooks[0]?.id)
  if (!playbooks?.length) return null
  return (
    <div className="divide-y divide-border">
      {playbooks.map((pb) => {
        const done = pb.steps.filter((s) => s.completed).length
        const expanded = openId === pb.id
        return (
          <div key={pb.id}>
            <button onClick={() => setOpenId(expanded ? null : pb.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-2 px-5 py-3 text-left hover:bg-background">
              <span className="text-sm font-semibold text-text-primary">{pb.title}</span>
              <span className="ml-auto text-xs tabular-nums text-text-muted">
                {done}/{pb.steps.length} steps
              </span>
              <span aria-hidden="true" className="text-text-muted">{expanded ? '−' : '+'}</span>
            </button>
            {expanded && (
              <ol className="space-y-2 px-5 pb-4">
                <p className="text-xs text-text-muted">{pb.description}</p>
                {pb.steps.map((s, i) => (
                  <li key={s.id} className="rounded-md border border-border p-3">
                    <div className="flex items-start gap-2">
                      <span aria-hidden="true"
                            className={`mt-0.5 text-sm ${s.completed ? 'text-emerald-600' : 'text-text-muted'}`}>
                        {s.completed ? '☑' : '☐'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary">
                          {i + 1}. {s.title}
                          {s.completed && <span className="ml-2 text-xs font-normal text-emerald-700">Completed</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-text-secondary">{s.guidance}</p>
                        {s.evidence_hint && (
                          <p className="mt-0.5 text-xs italic text-text-muted">Evidence: {s.evidence_hint}</p>
                        )}
                      </div>
                      {canAct && !s.completed && (
                        <button disabled={pendingStep === `${pb.id}:${s.id}`}
                                onClick={() => onCompleteStep(pb.id, s)}
                                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:border-border-strong hover:text-text-primary disabled:opacity-40">
                          Mark complete
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}
