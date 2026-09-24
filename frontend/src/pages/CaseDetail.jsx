import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { investigationsApi } from '../services/api'
import { Button, Card, CardHeader, EmptyState, ErrorState, Modal, RiskBadge, Skeleton } from '../components/ui'
import {
  ActionTimeline,
  CaseStatusBadge,
  PlaybookChecklist,
  SlaChip,
  TransitionDialog,
} from '../components/investigation'
import CopilotPanel from '../components/investigation/CopilotPanel'
import { useAuth } from '../hooks/useAuth'
import { OUTCOMES, TERMINAL_STATUSES, canActOnCase, canActOnCases, canDecideCase } from '../utils/investigation'
import { AI_DISCLAIMER } from '../utils/risk'
import { formatDateTime, titleCase } from '../utils/format'

export default function CaseDetail() {
  const { investigationId } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const actingRole = canActOnCases(user?.role)
  const [showTransition, setShowTransition] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [prompt, setPrompt] = useState(null) // {title, placeholder, onSubmit}
  const [pendingStep, setPendingStep] = useState(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['investigation', investigationId] })
    qc.invalidateQueries({ queryKey: ['investigation-actions', investigationId] })
    qc.invalidateQueries({ queryKey: ['investigations'] })
    qc.invalidateQueries({ queryKey: ['investigation-queue'] })
  }

  const caseQ = useQuery({
    queryKey: ['investigation', investigationId],
    queryFn: () => investigationsApi.detail(investigationId),
  })
  const actionsQ = useQuery({
    queryKey: ['investigation-actions', investigationId],
    queryFn: () => investigationsApi.actions(investigationId, { page_size: 200 }),
  })

  const transition = useMutation({
    mutationFn: (body) => investigationsApi.transition(investigationId, body),
    onSuccess: () => { setShowTransition(false); invalidate() },
  })
  const addAction = useMutation({
    mutationFn: (body) => investigationsApi.addAction(investigationId, body),
    onSuccess: () => { setPrompt(null); setPendingStep(null); invalidate() },
    onError: () => setPendingStep(null),
  })
  const assignToMe = useMutation({
    mutationFn: () => investigationsApi.assign(investigationId, {
      assignee_id: user.id, reason: 'Taking ownership of this case.' }),
    onSuccess: invalidate,
  })
  const assignCase = useMutation({
    mutationFn: (body) => investigationsApi.assign(investigationId, body),
    onSuccess: () => { setShowAssign(false); invalidate() },
  })
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    qc.invalidateQueries({ queryKey: ['investigation-actions', investigationId] })
  }
  const exportReport = useMutation({
    mutationFn: () => investigationsApi.exportReport(investigationId),
    onSuccess: (blob) => downloadBlob(blob, `${caseQ.data?.case_number ?? 'investigation'}.pdf`),
  })
  const exportXlsx = useMutation({
    mutationFn: () => investigationsApi.exportReportXlsx(investigationId),
    onSuccess: (blob) => downloadBlob(blob, `${caseQ.data?.case_number ?? 'investigation'}.xlsx`),
  })

  if (caseQ.isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-24" /><Skeleton className="h-48" /><Skeleton className="h-64" />
      </div>
    )
  }
  if (caseQ.isError) return <ErrorState error={caseQ.error} onRetry={caseQ.refetch} />
  const c = caseQ.data
  const terminal = TERMINAL_STATUSES.includes(c.status)
  // See broadly, act narrowly: an officer acts only on cases assigned to them
  // (the server re-checks); reopening a closed case stays an oversight power.
  const canAct = terminal ? canActOnCases(user?.role) : canActOnCase(user, c)
  const canSelfAssign = actingRole && !c.assigned_to && !terminal

  const completeStep = (playbookId, step) => {
    setPrompt({
      title: `Complete step: ${step.title}`,
      placeholder: 'What did you verify, based on which records?',
      onSubmit: (reason) => {
        setPendingStep(`${playbookId}:${step.id}`)
        addAction.mutate({
          action_type: 'playbook_step_completed', reason,
          detail: { playbook_id: playbookId, step_id: step.id },
        })
      },
    })
  }

  return (
    <div className="w-full max-w-[1850px] mx-auto space-y-5 select-none font-sans text-slate-800">
      {/* Case Dossier Header */}
      <div className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">
          <Link to="/investigations" className="hover:text-slate-600 transition-colors">Cases</Link>
          <span>/</span>
          <span className="text-slate-700">{c.case_number}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-black font-mono tracking-tight text-slate-900">{c.case_number}</h1>
              <CaseStatusBadge status={c.status} size="lg" />
              <SlaChip slaDueAt={c.sla_due_at} overdue={c.overdue} />
            </div>
            <p className="mt-1 text-[12px] font-medium text-slate-500 max-w-xl leading-relaxed">
              {c.reason ?? c.trigger_description ?? 'Risk-flagged investigation case requiring review and official determination.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canDecideCase(user?.role) && !terminal && (
              <Button variant="secondary" size="sm" onClick={() => { assignCase.reset(); setShowAssign(true) }}>
                {c.assigned_to ? 'Reassign' : 'Assign Officer'}
              </Button>
            )}
            {user?.role === 'officer' && canSelfAssign && (
              <Button variant="secondary" size="sm" onClick={() => assignToMe.mutate()} disabled={assignToMe.isPending}>
                Assign to Me
              </Button>
            )}
            {canAct && !terminal && (
              <Button variant="secondary" size="sm" onClick={() => setPrompt({
                        title: 'Add a case note', placeholder: 'Note text (recorded permanently)…',
                        onSubmit: (reason) => addAction.mutate({ action_type: 'note_added', reason }),
                      })}>
                Add Note
              </Button>
            )}
            {actingRole && (
              <Button variant="secondary" size="sm" onClick={() => exportReport.mutate()} disabled={exportReport.isPending}>
                {exportReport.isPending ? 'Exporting…' : 'Export Package (PDF)'}
              </Button>
            )}
            {actingRole && (
              <Button variant="secondary" size="sm" onClick={() => exportXlsx.mutate()} disabled={exportXlsx.isPending}>
                {exportXlsx.isPending ? '…' : 'Export XLSX'}
              </Button>
            )}
            {canAct && (
              <Button variant="primary" size="sm" onClick={() => { transition.reset(); setShowTransition(true) }}>
                Change Status
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <Link to={`/projects/${c.project_id}`} className="font-bold text-accent hover:underline">
            {c.project_code} — {c.project_title}
          </Link>
          <span className="text-text-muted">·</span>
          <span className="font-semibold text-text-secondary">{c.district}, {c.state}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4 border-t border-border pt-4">
          <div>
            <dt className="text-text-muted font-semibold uppercase tracking-wider text-[10px]">Priority Score</dt>
            <dd className="mt-1 font-extrabold tabular-nums text-text-primary text-base">
              {Number(c.priority_score).toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted font-semibold uppercase tracking-wider text-[10px]">Risk Snapshot</dt>
            <dd className="mt-1">
              {c.risk_snapshot
                ? <RiskBadge level={c.risk_snapshot.risk_level} score={c.risk_snapshot.risk_score} />
                : <span className="text-text-muted">Not assessed</span>}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted font-semibold uppercase tracking-wider text-[10px]">Opened By</dt>
            <dd className="mt-1 font-bold text-text-primary">{c.opened_by}</dd>
          </div>
          <div>
            <dt className="text-text-muted font-semibold uppercase tracking-wider text-[10px]">Assigned Officer</dt>
            <dd className="mt-1 font-bold text-text-primary">{c.assigned_to ?? 'Unassigned'}</dd>
          </div>
        </dl>
        {c.priority_breakdown?.formula && (
          <p className="mt-3 border-t border-border/50 pt-2 text-[11px] text-text-muted font-medium">
            Priority = {c.priority_breakdown.risk_score} (risk) ×{' '}
            {c.priority_breakdown.financial_weight} (financial) ×{' '}
            {c.priority_breakdown.evidence_weight} (evidence) ={' '}
            <strong className="tabular-nums text-accent">{c.priority_breakdown.priority}</strong>
            {' '}· Frozen at case creation
          </p>
        )}
      </div>

      {/* monitoring-capacity notice: officer viewing a case not assigned to them */}
      {actingRole && !canAct && !terminal && (
        <Card className="border-blue-200 bg-blue-50/40 p-4">
          <p className="text-sm font-semibold text-slate-800">
            Viewing in national monitoring capacity
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            This case is {c.assigned_to ? `assigned to ${c.assigned_to}` : 'unassigned'}.
            Monitoring officers can review all cases nationally but act only on
            investigations assigned to them.
          </p>
        </Card>
      )}

      {/* outcome banner for closed cases */}
      {c.outcome && (
        <Card className="border-emerald-200 bg-emerald-50/40 p-4">
          <p className="text-sm font-semibold text-text-primary">
            Outcome: {OUTCOMES[c.outcome]?.label ?? titleCase(c.outcome)}
            <span className="ml-2 text-xs font-normal text-text-muted">
              recorded {formatDateTime(c.closed_at)}
            </span>
          </p>
          <p className="mt-1 text-sm text-text-secondary">{c.outcome_note}</p>
        </Card>
      )}

      {/* summary */}
      <Card>
        <CardHeader title="Case summary"
                    subtitle="Written or explicitly accepted by the responsible officer" />
        <div className="p-5">
          {c.summary
            ? <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary">{c.summary}</pre>
            : <p className="text-sm text-text-muted">No summary yet. Write one from your findings, or draft one with the Copilot and accept it.</p>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <CopilotPanel investigationId={c.id} canAct={canAct && !terminal}
                        factorTypes={(c.playbooks ?? []).flatMap((pb) => pb.applies_to_factors)} />
          <Card>
            <CardHeader title="Evidence"
                        subtitle="Full risk factors, anomalies, reconciliation and duplicates" />
            <div className="p-5 text-sm">
              <Link to={`/projects/${c.project_id}`} className="font-medium text-accent hover:underline">
                Open the complete project evidence page →
              </Link>
              <p className="mt-2 text-xs text-text-muted">{AI_DISCLAIMER}</p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Playbooks"
                        subtitle="Structured review steps for this case's risk factors" />
            {c.playbooks?.length
              ? <PlaybookChecklist playbooks={c.playbooks} canAct={canAct && !terminal}
                                   onCompleteStep={completeStep} pendingStep={pendingStep} />
              : <EmptyState title="No playbooks" message="No playbooks apply to this case." />}
          </Card>
        </div>
      </div>

      {/* timeline */}
      <Card>
        <CardHeader title="Action timeline"
                    subtitle={`${c.action_count} recorded actions — append-only, every entry carries who, when and why`} />
        {actionsQ.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : actionsQ.isError ? (
          <ErrorState error={actionsQ.error} onRetry={actionsQ.refetch} />
        ) : (
          <ActionTimeline actions={actionsQ.data.items} />
        )}
      </Card>

      {showTransition && (
        <TransitionDialog currentStatus={c.status} pending={transition.isPending}
                          error={transition.error}
                          allowTerminal={canDecideCase(user?.role)}
                          onSubmit={(body) => transition.mutate(body)}
                          onClose={() => setShowTransition(false)} />
      )}

      {prompt && (
        <ReasonPrompt {...prompt} pending={addAction.isPending} error={addAction.error}
                      onClose={() => { setPrompt(null); addAction.reset() }} />
      )}

      {showAssign && (
        <AssignDialog
          investigationId={investigationId}
          currentAssignee={c.assigned_to}
          pending={assignCase.isPending}
          error={assignCase.error}
          onSubmit={(body) => assignCase.mutate(body)}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  )
}

/* Assign/reassign the case to an eligible officer. The list comes from
   /investigations/{id}/assignees — active acting-role users whose own scope
   covers this case's project (the server re-checks on submit). */
function AssignDialog({ investigationId, currentAssignee, onSubmit, onClose, pending, error }) {
  const assignees = useQuery({
    queryKey: ['assignees', investigationId],
    queryFn: () => investigationsApi.assignees(investigationId),
  })
  const [assigneeId, setAssigneeId] = useState('')
  const [reason, setReason] = useState('')
  const options = assignees.data ?? []
  const valid = assigneeId && reason.trim().length >= 10

  return (
    <Modal label="Assign case" onClose={onClose}>
      <h3 className="text-sm font-semibold text-text-primary">
        {currentAssignee ? 'Reassign case' : 'Assign case to an officer'}
      </h3>
      <p className="mt-0.5 text-xs text-text-muted">
        {currentAssignee
          ? `Currently assigned to ${currentAssignee}. The change is permanently recorded with your reason.`
          : 'The assignment is permanently recorded with your reason.'}
      </p>
      <div className="mt-4 space-y-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
          Officer
          {assignees.isPending ? (
            <Skeleton className="h-8" />
          ) : (
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option value="">Select an officer…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id} disabled={o.is_current_assignee}>
                  {o.full_name} — {titleCase(o.role)}{o.is_current_assignee ? ' (current)' : ''}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
          Reason (required, min 10 characters)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                    placeholder="Why is this officer being assigned?" />
        </label>
        {error && (
          <p className="text-xs text-red-600 font-medium">
            {error.response?.data?.detail ?? 'Assignment failed — please retry.'}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!valid || pending}
                  onClick={() => onSubmit({ assignee_id: Number(assigneeId), reason: reason.trim() })}>
            {pending ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ReasonPrompt({ title, placeholder, onSubmit, onClose, pending, error }) {
  const [text, setText] = useState('')
  return (
    <Modal label={title} onClose={onClose}>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-text-secondary">
          Reason / note (required)
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                    placeholder={placeholder} />
        </label>
        {error && (
          <p className="mt-2 text-xs font-medium text-danger" role="alert">
            {error.response?.data?.detail ?? 'The action was rejected.'}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary">
            Cancel
          </button>
          <button disabled={text.trim().length < 5 || pending}
                  onClick={() => onSubmit(text.trim())}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
    </Modal>
  )
}
