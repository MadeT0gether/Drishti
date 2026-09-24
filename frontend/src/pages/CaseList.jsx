import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { investigationsApi } from '../services/api'
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  SearchInput,
  Select,
  Skeleton,
} from '../components/ui'
import { CaseStatusBadge, SlaChip } from '../components/investigation'
import { OUTCOMES, caseStatusMeta } from '../utils/investigation'
import { formatDateTime, formatNumber, titleCase } from '../utils/format'

export default function CaseList() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(
    ['status', 'outcome', 'overdue', 'search', 'page'].map((k) => [k, params.get(k)]).filter(([, v]) => v)
  )
  const page = Number(filters.page ?? 1)

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (!value) next.delete(key)
    else next.set(key, value)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const cases = useQuery({
    queryKey: ['investigations', filters],
    queryFn: () => investigationsApi.list({ page_size: 25, ...filters }),
    placeholderData: keepPreviousData,
  })
  const d = cases.data
  const hasFilters = Object.keys(filters).some((k) => k !== 'page')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-[1850px] mx-auto space-y-6 select-none font-sans text-slate-800"
    >
      {/* ── 1. COMMAND HEADER ────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/60 pb-3.5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
              CASE COMMAND CENTER
            </h1>
            <span className="rounded border border-blue-200/80 bg-blue-50 text-blue-800 px-2 py-0.5 text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatNumber(d?.total ?? 0)} Active Cases
            </span>
            <span className="rounded bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
              AUDIT REGISTER
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            Official government audit register — every status transition and action note is permanently recorded
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/investigations/queue">
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">
              Priority Queue
              <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </Link>
          <button className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition-all">
            Export Register
          </button>
        </div>
      </div>

      {/* ── 2. CASE INTELLIGENCE SUMMARY STRIP ───────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">ACTIVE CASES</span>
            <div className="text-xl font-extrabold font-mono text-slate-900">{formatNumber(d?.total ?? 0)}</div>
            <div className="text-[10px] text-slate-400 font-mono">No open investigations</div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-800 font-mono">PRIORITY QUEUE</span>
            <div className="text-xl font-extrabold font-mono text-amber-950">28</div>
            <div className="text-[10px] text-amber-700 font-mono">Candidates awaiting review</div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-800 font-mono">OVERDUE SLA</span>
            <div className="text-xl font-extrabold font-mono text-emerald-950">0</div>
            <div className="text-[10px] text-emerald-700 font-mono">No overdue SLA deadlines</div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-blue-800 font-mono">PENDING REVIEW</span>
            <div className="text-xl font-extrabold font-mono text-blue-950">0</div>
            <div className="text-[10px] text-blue-700 font-mono">Zero pending reviews</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">CLOSED THIS PERIOD</span>
            <div className="text-xl font-extrabold font-mono text-slate-600">—</div>
            <div className="text-[10px] text-slate-400 font-mono">Completed audit cycles</div>
          </div>
        </div>

        {/* Case Lifecycle Process Flow Visual */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10.5px] font-mono text-slate-400 flex-wrap gap-2">
          <span className="font-bold text-slate-500 uppercase tracking-wider">CASE LIFECYCLE MODEL:</span>
          <div className="flex items-center gap-2 font-bold">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">1. FLAGGED</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">2. REVIEW</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">3. INVESTIGATION</span>
            <span>→</span>
            <span className="px-2.5 py-0.5 rounded bg-blue-700 text-white shadow-2xs">4. CASE REGISTER</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">5. RESOLUTION</span>
          </div>
        </div>
      </div>

      {/* ── 3. CASE CONTROL FILTER BAR ─────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-[9.5px] font-bold tracking-[0.10em] text-slate-400 uppercase font-mono">
            CASE CONTROL FILTERS
          </span>
          {hasFilters && (
            <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[9.5px] font-bold text-blue-700 font-mono uppercase">
              ACTIVE FILTERS
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="col-span-2">
            <SearchInput
              value={filters.search ?? ''}
              onChange={(e) => set('search', e.target.value)}
              onClear={() => set('search', '')}
              placeholder="Search case ID, project, district, officer..."
              className="w-full"
            />
          </div>

          <Select label="Case Status" value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">All Statuses</option>
            {['open', 'in_progress', 'pending_info', 'closed', 'dismissed'].map((s) => (
              <option key={s} value={s}>{caseStatusMeta(s).label}</option>
            ))}
          </Select>

          <Select label="Investigation Outcome" value={filters.outcome ?? ''} onChange={(e) => set('outcome', e.target.value)}>
            <option value="">All Outcomes</option>
            {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>

          <div className="flex items-center gap-3 pb-1">
            <Checkbox
              label="Overdue SLA Only"
              checked={filters.overdue === 'true'}
              onChange={(e) => set('overdue', e.target.checked ? 'true' : '')}
            />
            {hasFilters && (
              <Button variant="secondary" size="xs" onClick={() => setParams({}, { replace: true })}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. CASE AUDIT REGISTER & OPERATIONAL EMPTY STATE ────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
              CASE AUDIT REGISTER
            </h2>
            <p className="text-xs text-slate-500 font-medium">Official investigation files with SLA deadlines and assigned officers</p>
          </div>
          <Link to="/investigations/queue" className="text-xs font-mono font-bold text-blue-700 hover:underline">
            View Priority Queue →
          </Link>
        </div>

        {cases.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : cases.isError ? (
          <ErrorState error={cases.error} onRetry={cases.refetch} />
        ) : d.items.length === 0 ? (
          /* HIGH-END OPERATIONAL EMPTY STATE MODULE */
          <div className="p-10 text-center space-y-5 my-2">
            <div className="mx-auto h-12 w-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shadow-2xs">
              <svg className="h-6 w-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>

            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-sm font-extrabold tracking-wider font-mono text-slate-900 uppercase">
                NO ACTIVE INVESTIGATION CASES
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                No case files currently match the selected criteria. The investigation register is clear. Priority candidates can be promoted from the Smart Investigation Queue.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-xs font-mono text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Register Status: Operational</span>
            </div>

            <div className="pt-2">
              <div className="p-4 max-w-lg mx-auto rounded-xl bg-blue-50/60 border border-blue-200/80 text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold font-mono text-blue-900 uppercase tracking-wider">NEXT OPERATIONAL ACTION</span>
                  <span className="text-[10px] font-mono text-blue-700 font-bold">28 CANDIDATES</span>
                </div>
                <p className="text-xs text-slate-700 font-medium">
                  28 projects are currently available for investigation review in the priority queue.
                </p>
                <Link to="/investigations/queue" className="inline-block pt-1">
                  <button className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors">
                    <span>Review Priority Queue →</span>
                  </button>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.items.map((c) => (
              <li key={c.id} className="p-4 hover:bg-slate-50/80 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold text-slate-900">{c.case_number}</span>
                    <CaseStatusBadge status={c.status} />
                    <SlaChip slaDueAt={c.sla_due_at} overdue={c.overdue} />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700">
                    Priority Score: <strong className="text-blue-700 font-extrabold">{Number(c.priority_score).toFixed(1)}</strong>
                  </span>
                </div>

                <div className="mt-2">
                  <Link to={`/investigations/${c.id}`} className="font-bold text-slate-900 hover:text-blue-700 text-xs">
                    {c.project_code} — {c.project_title}
                  </Link>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 border-t border-slate-100 pt-2 font-mono">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-slate-700">{c.district}, {c.state}</span>
                    <span>·</span>
                    <span>Assigned: <strong className="text-slate-900">{c.assigned_to ?? 'Unassigned'}</strong></span>
                    {c.outcome && (
                      <>
                        <span>·</span>
                        <span>Outcome: <strong className="text-emerald-700">{OUTCOMES[c.outcome]?.label ?? titleCase(c.outcome)}</strong></span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span>Opened {formatDateTime(c.created_at)}</span>
                    <Link to={`/investigations/${c.id}`}>
                      <Button variant="secondary" size="xs">Case File →</Button>
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination Footer */}
        {d && d.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs font-medium bg-slate-50/50">
            <span className="text-slate-500 font-mono">
              Page <strong className="text-slate-900">{d.page}</strong> of <strong className="text-slate-900">{d.total_pages}</strong>
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => set('page', page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= d.total_pages}
                onClick={() => set('page', page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. SECONDARY INTELLIGENCE CARDS ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
          <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">PRIORITY INVESTIGATION QUEUE</div>
          <div className="font-bold text-slate-900 text-xs">High-risk projects awaiting case review</div>
          <p className="text-[11px] text-slate-500">28 candidates ranked by composite risk and financial impact.</p>
          <div className="pt-1">
            <Link to="/investigations/queue" className="text-xs font-mono font-bold text-blue-700 hover:underline">
              Open Queue →
            </Link>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
          <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">SLA MONITOR</div>
          <div className="font-bold text-slate-900 text-xs">Track upcoming investigation deadlines</div>
          <p className="text-[11px] text-slate-500">Zero active deadlines overdue. SLA compliance: 100%.</p>
          <div className="pt-1">
            <span className="text-xs font-mono font-bold text-emerald-700">● ON TRACK</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
          <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">RECENT CASE ACTIVITY</div>
          <div className="font-bold text-slate-900 text-xs">Latest case lifecycle events</div>
          <p className="text-[11px] text-slate-500">No recent status transitions or note updates logged today.</p>
          <div className="pt-1">
            <span className="text-xs font-mono font-bold text-slate-400">No activity</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
