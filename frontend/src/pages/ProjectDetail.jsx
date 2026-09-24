import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { investigationsApi, projectsApi } from '../services/api'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ProgressBar,
  QueryBoundary,
  RiskBadge,
  SeverityBadge,
  Skeleton,
  StatCard,
  StatusBadge,
} from '../components/ui'
import RiskCard, { FactorEvidence } from '../components/risk/RiskCard'
import RelationshipGraph from '../components/charts/RelationshipGraph'
import { formatDate, formatDateTime, formatINR, formatPct, titleCase } from '../utils/format'

/** Links to the project's most recent investigation case, or to the smart
 *  queue (where a case can be opened) when none exists. */
function InvestigationEntry({ projectId }) {
  const cases = useQuery({
    queryKey: ['investigations', { project_id: projectId }],
    queryFn: () => investigationsApi.list({ project_id: projectId, page_size: 1, sort_by: 'created_at' }),
  })
  const latest = cases.data?.items?.[0]
  if (cases.isPending || cases.isError) return null
  return latest ? (
    <Link to={`/investigations/${latest.id}`}>
      <Button variant="primary" size="sm">
        Inspect Case {latest.case_number}
      </Button>
    </Link>
  ) : (
    <Link to="/investigations/queue">
      <Button variant="secondary" size="sm">
        Open Investigation Case
      </Button>
    </Link>
  )
}

function Section({ title, subtitle, children, action }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </Card>
  )
}

function Stat({ label, value, sub, tone }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-text-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-bold tabular-nums ${tone ?? 'text-text-primary'}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-text-secondary font-medium">{sub}</dd>}
    </div>
  )
}

export default function ProjectDetail() {
  const { projectId } = useParams()
  const detail = useQuery({ queryKey: ['project', projectId], queryFn: () => projectsApi.detail(projectId) })
  const risk = useQuery({ queryKey: ['risk', projectId], queryFn: () => projectsApi.risk(projectId), retry: false })
  const timeline = useQuery({ queryKey: ['timeline', projectId], queryFn: () => projectsApi.riskTimeline(projectId) })
  const anomalies = useQuery({ queryKey: ['anomalies', projectId], queryFn: () => projectsApi.anomalies(projectId) })
  const similar = useQuery({ queryKey: ['similar', projectId], queryFn: () => projectsApi.similar(projectId) })
  const relationships = useQuery({ queryKey: ['relationships', projectId], queryFn: () => projectsApi.relationships(projectId) })
  const reconciliation = useQuery({ queryKey: ['reconciliation', projectId], queryFn: () => projectsApi.reconciliation(projectId) })
  const predictions = useQuery({ queryKey: ['predictions', projectId], queryFn: () => projectsApi.predictions(projectId) })

  if (detail.isPending) {
    return <div className="mx-auto max-w-6xl space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
  }
  if (detail.isError) {
    return <div className="mx-auto max-w-6xl"><Card><ErrorState error={detail.error} onRetry={detail.refetch} /></Card></div>
  }
  const p = detail.data
  const remaining = p.sanctioned_cost != null ? p.sanctioned_cost - p.expenditure : null
  const noRisk = risk.isError && risk.error?.response?.status === 404

  return (
    <div className="mx-auto max-w-6xl space-y-6 select-none">
      {/* Dossier Header & Breadcrumb */}
      <div className="border-b border-border pb-4">
        <nav className="text-xs font-semibold text-text-muted mb-2" aria-label="Breadcrumb">
          <Link to="/projects" className="hover:text-accent">Project Directory</Link>
          <span className="mx-1.5">/</span>
          <span className="text-text-primary">{p.code}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={p.status} />
              <span className="font-mono text-xs font-bold text-text-muted">{p.code}</span>
              <span className="text-text-muted">·</span>
              <span className="text-xs font-semibold text-text-secondary">FY {p.financial_year}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary leading-snug">{p.title}</h1>
            <p className="mt-1 text-xs text-text-secondary">
              {p.district}, {p.state} · Sector: <strong>{p.category}</strong>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {risk.data && <RiskBadge level={risk.data.risk_level} score={risk.data.risk_score} size="lg" />}
            <InvestigationEntry projectId={p.id} />
          </div>
        </div>
      </div>

      {/* Primary Indicator Cards */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <span className="rounded bg-emerald-100 border border-emerald-300 text-emerald-950 px-2 py-0.5 text-[10px] font-bold font-mono uppercase">
          VERIFIABLE EVIDENCE
        </span>
        <span className="text-xs text-text-muted font-medium">Ground-truth audit data from financial registry</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Sanctioned Amount"
          value={formatINR(p.sanctioned_cost)}
          sub={p.sanction_no ? `Sanction #${p.sanction_no}` : undefined}
        />
        <StatCard
          label="Total Expenditure"
          value={formatINR(p.expenditure)}
          sub={`${formatPct(p.financial_progress_pct)} spent`}
        />
        <StatCard
          label="Physical Progress"
          value={formatPct(p.physical_progress_pct)}
          sub="On-site completion"
        />
        <StatCard
          label="Remaining Balance"
          value={formatINR(remaining)}
          tone={remaining != null && remaining < 0 ? 'danger' : 'default'}
          sub={remaining != null && remaining < 0 ? 'Expenditure exceeds sanction' : 'Unspent funds'}
        />
      </div>

      {/* Model Risk Output Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-100 border border-amber-300 text-amber-950 px-2 py-0.5 text-[10px] font-bold font-mono uppercase">
            MODEL SIGNAL
          </span>
          <span className="rounded bg-slate-100 border border-slate-300 text-slate-700 px-2 py-0.5 text-[10px] font-bold font-mono uppercase">
            OFFICER VERIFICATION REQUIRED
          </span>
        </div>
        {risk.isPending ? <Skeleton className="h-64" /> :
          noRisk ? (
            <Card><EmptyState title="No risk assessment"
              message="This project has not been assessed yet (recommended-stage projects are not scored)." /></Card>
          ) : risk.isError ? (
            <Card><ErrorState error={risk.error} onRetry={risk.refetch} /></Card>
          ) : (
            <RiskCard risk={risk.data} />
          )}
      </div>

      {/* Evidence */}
      {risk.data?.factors?.length > 0 && (
        <Section title="Factor Evidence & Audit Backing" subtitle="Stored evidence behind each contributing risk factor — strictly sourced from dataset records">
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {risk.data.factors.map((f) => <FactorEvidence key={f.factor_type} factor={f} />)}
          </div>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Financial Details */}
        <Section title="Financial Records" subtitle="Implementation funds & budget breakdown">
          <dl className="grid grid-cols-2 gap-4 p-5">
            <Stat label="Recommended Cost" value={formatINR(p.recommended_cost)}
                  sub={p.recommendation_date && `on ${formatDate(p.recommendation_date)}`} />
            <Stat label="Sanctioned Cost" value={formatINR(p.sanctioned_cost)}
                  sub={p.sanction_no && `${p.sanction_no} · ${formatDate(p.sanction_date)}`} />
            <Stat label="Total Expenditure" value={formatINR(p.expenditure)}
                  sub={p.financial_progress_pct != null && `${formatPct(p.financial_progress_pct)} utilization`} />
            <Stat label="Unspent Balance" value={formatINR(remaining)}
                  tone={remaining != null && remaining < 0 ? 'text-risk-critical' : undefined}
                  sub={remaining != null && remaining < 0 ? 'expenditure exceeds sanction' : undefined} />
            {p.revised_cost != null && (
              <Stat label="Revised Cost" value={formatINR(p.revised_cost)} tone="text-risk-high"
                    sub="revision above original sanction" />
            )}
          </dl>
        </Section>

        {/* Progress & Schedule */}
        <Section title="Progress & Schedule Tracking">
          <div className="space-y-4 p-5">
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span className="text-text-secondary">Physical Progress</span>
                <span className="tabular-nums text-text-primary">{formatPct(p.physical_progress_pct)}</span>
              </div>
              <ProgressBar value={p.physical_progress_pct} color="bg-accent" label="Physical progress" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span className="text-text-secondary">Financial Utilization</span>
                <span className="tabular-nums text-text-primary">{formatPct(p.financial_progress_pct)}</span>
              </div>
              <ProgressBar value={p.financial_progress_pct} color="bg-indigo-500" label="Financial utilization" />
              {p.financial_progress_pct != null && p.financial_progress_pct - p.physical_progress_pct >= 25 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800">
                  ⚠️ Financial utilization leads physical progress by {Math.round(p.financial_progress_pct - p.physical_progress_pct)} percentage points — review recommended.
                </div>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
              <div><dt className="text-text-muted font-medium">Planned Start</dt><dd className="font-semibold text-text-primary">{formatDate(p.planned_start)}</dd></div>
              <div><dt className="text-text-muted font-medium">Planned Completion</dt><dd className="font-semibold text-text-primary">{formatDate(p.planned_end)}</dd></div>
              <div><dt className="text-text-muted font-medium">Actual Start</dt><dd className="font-semibold text-text-primary">{formatDate(p.actual_start)}</dd></div>
              <div><dt className="text-text-muted font-medium">Actual Completion</dt><dd className="font-semibold text-text-primary">{formatDate(p.actual_end)}</dd></div>
            </dl>
          </div>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Risk timeline */}
        <Section title="Risk Assessment Timeline" subtitle="Historical risk scoring snapshots">
          <QueryBoundary query={timeline} skeleton={<Skeleton className="m-4 h-48" />}
                         empty={<EmptyState title="No assessment history" />}>
            {(points) => (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={points.map((pt) => ({
                    date: formatDate(pt.assessed_at), score: pt.risk_score }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#98a2b3' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#98a2b3' }} width={30} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2}
                          dot={{ r: 4 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="px-1 text-xs font-medium text-text-muted">
                  {points.length < 2
                    ? 'Single assessment snapshot available.'
                    : points.at(-1).risk_score > points[0].risk_score
                      ? 'Risk trend: increasing risk over time.'
                      : points.at(-1).risk_score < points[0].risk_score
                        ? 'Risk trend: decreasing risk over time.' : 'Risk trend: stable.'}
                </p>
              </div>
            )}
          </QueryBoundary>
        </Section>

        {/* Predictions */}
        <Section title="Model Predictions" subtitle="Schedule delay and cost overrun predictions">
          <QueryBoundary query={predictions} skeleton={<Skeleton className="m-4 h-40" />}>
            {(pr) => (
              <dl className="grid grid-cols-2 gap-4 p-5">
                <Stat label="Predicted Delay"
                      value={pr.predicted_delay_days != null ? `${Math.round(pr.predicted_delay_days)} days` : '—'}
                      tone={pr.delay_risk === 'high' ? 'text-risk-critical' : pr.delay_risk === 'medium' ? 'text-risk-high' : undefined}
                      sub={pr.predicted_delay_days != null ? `delay risk: ${pr.delay_risk} · ${pr.delay_model_version}` : 'applies to in-progress projects'} />
                <Stat label="Cost-Overrun Risk"
                      value={pr.overrun_risk ? titleCase(pr.overrun_risk) : '—'}
                      tone={pr.overrun_risk === 'high' ? 'text-risk-critical' : undefined}
                      sub={pr.overrun_risk && pr.overrun_model_version} />
                <div className="col-span-2 text-xs font-medium text-text-muted">
                  {pr.predicted_at ? `Predicted at ${formatDateTime(pr.predicted_at)}` : pr.note}
                </div>
              </dl>
            )}
          </QueryBoundary>
        </Section>
      </div>

      {/* Anomalies */}
      <Section title="Detected Anomalies" subtitle="Decision-support signals generated by anomaly detection models">
        <QueryBoundary query={anomalies} skeleton={<Skeleton className="m-4 h-32" />}
                       empty={<EmptyState title="No anomalies detected" message="No anomalies detected for this project." />}>
          {(items) => (
            <ul className="divide-y divide-border">
              {items.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <SeverityBadge severity={a.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-text-primary">{titleCase(a.detector)}</span>
                      <span className="text-text-muted">score {Math.round(a.score)} · {a.model_version}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary font-medium">{a.explanation}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>

      {/* Similar projects */}
      <Section title="Similar Projects & Duplicate Candidates"
               subtitle="Ranked candidates for human verification — requires manual review">
        <QueryBoundary query={similar} skeleton={<Skeleton className="m-4 h-32" />}
                       empty={<EmptyState title="No similar projects found" />}>
          {(items) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    {['Project', 'Classification', 'Composite', 'Title Match', 'Distance', 'Signals'].map((h) => (
                      <th key={h} className="px-4 py-3">{h}</th>))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((s) => (
                    <tr key={s.project_id} className="hover:bg-background transition-colors">
                      <td className="max-w-xs px-4 py-3">
                        <Link to={`/projects/${s.project_id}`} className="block">
                          <div className="truncate font-semibold text-text-primary hover:text-accent">{s.title}</div>
                          <div className="text-xs text-text-muted">{s.code} · {s.district}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-bold uppercase ${
                          s.classification === 'duplicate_candidate'
                            ? 'border-orange-200 bg-orange-50 text-orange-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                          {s.classification === 'duplicate_candidate' ? 'Duplicate Candidate' : 'Similar Project'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{Math.round(s.composite_score)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatPct(s.text_similarity * 100)}</td>
                      <td className="px-4 py-3 tabular-nums">{s.geo_distance_km != null ? `${s.geo_distance_km.toFixed(1)} km` : '—'}</td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {[s.same_agency && 'same agency', s.time_overlap && 'overlapping period',
                          s.cost_similarity > 0.85 && 'similar cost'].filter(Boolean).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryBoundary>
      </Section>

      {/* Relationship graph */}
      {relationships.data && (relationships.data.edges.length > 0) && (
        <Section title="Relationship Network Graph"
                 subtitle="Entity connection neighborhood and vendor pairing indicators">
          <RelationshipGraph relationships={relationships.data} similar={similar.data ?? []} />
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Relationships */}
        <Section title="Stakeholders & Connected Entities" subtitle="Agencies and vendors associated with this project">
          <QueryBoundary query={relationships} skeleton={<Skeleton className="m-4 h-40" />}>
            {(rel) => (
              <div className="space-y-3 p-5">
                {rel.edges.map((e) => (
                  <div key={`${e.entity_type}-${e.entity_id}`} className="rounded-lg border border-border p-3.5 bg-surface-subtle">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                        {e.relationship_type === 'implemented_by' ? 'Implementing Agency' : 'Vendor'}
                      </span>
                      <span className="text-xs text-text-muted font-medium">
                        {e.detail.agency_total_projects ?? e.detail.vendor_total_projects} total projects
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-bold text-text-primary">{e.entity_name}</div>
                    {e.detail.projects_with_same_agency != null && (
                      <div className="mt-0.5 text-xs text-text-secondary">
                        {e.detail.projects_with_same_agency} projects with this same agency–vendor pairing
                      </div>
                    )}
                  </div>
                ))}
                {rel.signals.length > 0 ? rel.signals.map((s, i) => (
                  <div key={i} className="rounded-lg border border-orange-200 bg-orange-50 p-3.5">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={s.severity} />
                      <span className="text-xs font-bold text-text-primary">{titleCase(s.signal_type)}</span>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary font-medium">
                      Unusual relationship pattern detected — review recommended.
                      {s.detail.vendor_share != null && ` Vendor holds ${formatPct(s.detail.vendor_share * 100)} of recent district projects.`}
                      {s.detail.cluster_cost_cv != null && ` ${s.detail.uniform_cluster_size} projects with near-identical costs (CV ${(s.detail.cluster_cost_cv * 100).toFixed(1)}%).`}
                    </p>
                  </div>
                )) : (
                  <p className="text-xs text-text-muted">No unusual relationship patterns detected for this project.</p>
                )}
              </div>
            )}
          </QueryBoundary>
        </Section>

        {/* Reconciliation */}
        <Section title="Cross-System PFMS Reconciliation" subtitle="Project records vs payment transactions">
          <QueryBoundary query={reconciliation} skeleton={<Skeleton className="m-4 h-40" />}>
            {(r) => {
              const groupTone = { RECONCILED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                                  PARTIAL: 'text-amber-700 bg-amber-50 border-amber-200',
                                  MISMATCH: 'text-orange-700 bg-orange-50 border-orange-200',
                                  MISSING: 'text-red-700 bg-red-50 border-red-200' }[r.status_group]
              return (
                <div className="space-y-4 p-5">
                  <span className={`inline-flex rounded-md border px-3 py-1 text-xs font-bold ${groupTone}`}>
                    {r.status_group}{r.status !== 'not_analyzed' && ` — ${titleCase(r.status)}`}
                  </span>
                  <dl className="grid grid-cols-2 gap-4">
                    <Stat label="Project Payments" value={formatINR(r.project_side_total)} />
                    <Stat label="Matched Transactions" value={formatINR(r.matched_total)} />
                    {r.mismatch_amount != null && Math.abs(r.mismatch_amount) > 0.5 && (
                      <Stat label="Unmatched Amount" value={formatINR(r.mismatch_amount)} tone="text-risk-critical" />
                    )}
                  </dl>
                  {r.detail?.n_payments != null && (
                    <p className="text-xs text-text-muted">
                      {r.detail.n_matched} of {r.detail.n_payments} payments matched to transactions.
                    </p>
                  )}
                </div>
              )
            }}
          </QueryBoundary>
        </Section>
      </div>
    </div>
  )
}

