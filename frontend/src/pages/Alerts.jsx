import { useState, useCallback } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { alertsApi, projectsApi } from '../services/api'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Modal,
  SearchInput,
  Select,
  SeverityBadge,
  Skeleton,
} from '../components/ui'
import GlobalIntelligenceDrawer from '../components/ui/GlobalIntelligenceDrawer'
import { formatDateTime, formatNumber, titleCase } from '../utils/format'

export default function Alerts() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(
    ['severity', 'status', 'state_id', 'district_id', 'search', 'page']
      .map((k) => [k, params.get(k)]).filter(([, v]) => v)
  )
  const page = Number(filters.page ?? 1)
  const [expandedAlertId, setExpandedAlertId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerAlert, setDrawerAlert] = useState(null)
  const [showRules, setShowRules] = useState(false)

  const openDrawer = useCallback((alert) => {
    setDrawerAlert({
      ...alert,
      title: alert.reason ?? alert.trigger_description ?? 'Risk signal detected',
      name: alert.project_code,
      code: alert.project_code,
      risk_score: alert.curr_score,
      risk_level: alert.severity,
      district_name: alert.district,
      state_name: alert.state,
    })
    setDrawerOpen(true)
  }, [])

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (!value) next.delete(key)
    else next.set(key, value)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const alerts = useQuery({
    queryKey: ['alerts', filters],
    queryFn: () => alertsApi.list({ page_size: 25, ...filters }),
    placeholderData: keepPreviousData,
  })
  const d = alerts.data
  const hasFilters = Object.keys(filters).some((k) => k !== 'page')

  // Scoped summary for the header tiles — a state/district user's tiles
  // describe THEIR scope, matching the queue below them.
  const statsQ = useQuery({ queryKey: ['alert-stats'], queryFn: alertsApi.stats, staleTime: 60_000 })
  const stats = statsQ.data
  const sev = stats?.by_severity ?? {}
  const active = stats?.active ?? 0
  const sevPct = (k) => (active ? Math.round(((sev[k] ?? 0) / active) * 100) : 0)

  const toggleExpand = (id) => {
    setExpandedAlertId(expandedAlertId === id ? null : id)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-[1850px] mx-auto space-y-6 select-none font-sans text-slate-800"
    >
      {/* ── 1. COMMAND HEADER ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/60 pb-3.5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
              RISK &amp; ALERTS COMMAND
            </h1>
            <span className="rounded border border-red-200/80 bg-red-50 text-red-700 px-2 py-0.5 text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatNumber(active)} Active
            </span>
            <div className="flex items-center gap-1.5 ml-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-live" />
              <span className="text-[9.5px] font-bold text-emerald-700" style={{ fontFamily: 'var(--font-mono)' }}>LIVE</span>
            </div>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            Real-time anomaly &amp; risk notifications from automated ML risk pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => alerts.refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition-all"
          >
            Alert Rules
          </button>
        </div>
      </div>

      {/* ── 2. COMPACT RISK SUMMARY STRIP & PRIORITY BAR ───────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">ACTIVE ALERTS</span>
            <div className="text-xl font-extrabold font-mono text-slate-900">{formatNumber(active)}</div>
          </div>

          <div className="p-3 rounded-lg bg-red-50/50 border border-red-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-red-800 font-mono">CRITICAL SEVERITY</span>
            <div className="text-xl font-extrabold font-mono text-red-950">{formatNumber(sev.critical ?? 0)}</div>
          </div>

          <div className="p-3 rounded-lg bg-orange-50/50 border border-orange-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-orange-800 font-mono">HIGH SEVERITY</span>
            <div className="text-xl font-extrabold font-mono text-orange-950">{formatNumber(sev.high ?? 0)}</div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-800 font-mono">MEDIUM SEVERITY</span>
            <div className="text-xl font-extrabold font-mono text-amber-950">{formatNumber(sev.medium ?? 0)}</div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-200/80 space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-blue-800 font-mono">MULTI-SIGNAL (5+)</span>
            <div className="text-xl font-extrabold font-mono text-blue-950">{formatNumber(stats?.multi_signal ?? 0)}</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900 text-white space-y-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">HIGHEST RISK SCORE</span>
            <div className="text-xl font-extrabold font-mono text-white">
              {stats?.highest_score != null ? `${Math.round(stats.highest_score)} / 100` : '—'}
            </div>
          </div>
        </div>

        {/* Severity Distribution Bar — computed from the scoped stats */}
        {active > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <div className="flex justify-between text-[10.5px] font-mono font-bold text-slate-500">
              <span>SEVERITY LOAD DISTRIBUTION</span>
              <span>
                {sevPct('critical')}% Critical · {sevPct('high')}% High · {sevPct('medium')}% Medium
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div className="bg-red-600 h-full" style={{ width: `${sevPct('critical')}%` }} title={`Critical: ${sevPct('critical')}%`} />
              <div className="bg-orange-500 h-full" style={{ width: `${sevPct('high')}%` }} title={`High: ${sevPct('high')}%`} />
              <div className="bg-amber-500 h-full" style={{ width: `${sevPct('medium')}%` }} title={`Medium: ${sevPct('medium')}%`} />
            </div>
          </div>
        )}
      </div>

      {/* ── 3. COMMAND FILTER BAR ──────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-[9.5px] font-bold tracking-[0.10em] text-slate-400 uppercase font-mono">
            OPERATIONAL CONTROLS &amp; FILTERS
          </span>
          {hasFilters && (
            <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[9.5px] font-bold text-blue-700 font-mono uppercase">
              ACTIVE FILTERS
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div className="col-span-2">
            <SearchInput
              value={filters.search ?? ''}
              onChange={(e) => set('search', e.target.value)}
              onClear={() => set('search', '')}
              placeholder="Search alert, project code, district..."
              className="w-full"
            />
          </div>

          <Select label="Severity Filter" value={filters.severity ?? ''} onChange={(e) => set('severity', e.target.value)}>
            <option value="">All Severities</option>
            {['critical', 'high', 'medium', 'low'].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </Select>

          <Select label="Alert Status" value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">All Statuses</option>
            {['open', 'acknowledged', 'closed'].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </Select>

          <Select label="Assigned Team" value={filters.assigned ?? ''} onChange={(e) => set('assigned', e.target.value)}>
            <option value="">All Teams</option>
            <option value="district">District</option>
            <option value="state">State</option>
            <option value="ministry">Ministry</option>
          </Select>

          {hasFilters && (
            <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* ── 4. PRIORITY ALERT QUEUE ────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs space-y-0">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
              PRIORITY ALERT QUEUE
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Alerts ranked by risk severity, signal confidence, and operational urgency
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">
            {formatNumber(d?.total ?? 13)} alerts · Updated moments ago
          </span>
        </div>

        {alerts.isPending ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : alerts.isError ? (
          <ErrorState error={alerts.error} onRetry={alerts.refetch} />
        ) : d.items.length === 0 ? (
          <EmptyState
            title="No alerts match the current operational filters"
            message="There are no active risk alerts matching your current scope, search query, or severity filter."
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
                  Reset All Filters
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {d.items.map((a) => {
              const severity = a.severity ?? 'high'
              const isCritical = severity === 'critical'
              const isHigh = severity === 'high'
              const isExpanded = expandedAlertId === a.id

              return (
                <motion.div
                  key={a.id}
                  layout
                  className={`group relative transition-all duration-150 border-l-4 ${
                    isCritical
                      ? 'border-l-red-600 bg-white hover:bg-red-50/20'
                      : isHigh
                      ? 'border-l-orange-500 bg-white hover:bg-orange-50/20'
                      : 'border-l-amber-500 bg-white hover:bg-amber-50/20'
                  }`}
                >
                  <div className="p-4 space-y-3">
                    {/* Top Row: Severity + Score + Actions */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      {/* Left Block: Severity pill + Score + Project Details */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Score Badge */}
                        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 border border-slate-200/80 shrink-0 text-center min-w-[64px]">
                          <span className={`text-base font-black font-mono leading-none ${
                            isCritical ? 'text-red-600' : isHigh ? 'text-orange-600' : 'text-amber-600'
                          }`}>
                            {Math.round(a.curr_score)}
                          </span>
                          <span className="text-[9px] font-extrabold uppercase font-mono text-slate-400 mt-1">/ 100</span>
                        </div>

                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold font-mono uppercase tracking-wider ${
                              isCritical
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : isHigh
                                ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              ● {severity}
                            </span>
                            <span className="font-mono font-bold text-xs text-slate-900">{a.project_code}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs font-semibold text-slate-700">{a.district}, {a.state}</span>
                          </div>

                          <h3 className="text-xs font-bold text-slate-900 leading-snug">{a.reason}</h3>

                          <div className="flex items-center gap-2 text-[10.5px] text-slate-500 font-mono flex-wrap pt-0.5">
                            {a.signal_count != null && (
                              <>
                                <span className="rounded bg-blue-50 text-blue-700 font-semibold px-2 py-0.2 border border-blue-100">
                                  {a.signal_count} independent signal{a.signal_count === 1 ? '' : 's'}
                                </span>
                                <span>·</span>
                              </>
                            )}
                            {a.evidence_strength && (
                              <>
                                <span>Evidence: <strong className="text-slate-900 font-bold uppercase">{a.evidence_strength}</strong></span>
                                <span>·</span>
                              </>
                            )}
                            <span>{formatDateTime(a.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Block: Status & Actions */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right text-xs font-mono space-y-0.5 hidden sm:block">
                          <div className="font-bold text-slate-900 uppercase">
                            STATUS: <span className="text-blue-700">{titleCase(a.status)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            ASSIGNED: <span className="font-semibold text-slate-700">{titleCase(a.assigned_role ?? 'District')}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link to={`/projects/${a.project_id}`}>
                            <Button variant="primary" size="xs">
                              Open Dossier →
                            </Button>
                          </Link>
                          <Link to="/investigations/queue">
                            <Button variant="secondary" size="xs">
                              Smart Queue
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Explanatory Toggle Bar */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => toggleExpand(a.id)}
                        className="text-blue-700 hover:text-blue-800 font-semibold flex items-center gap-1 transition-colors"
                      >
                        <span>{isExpanded ? 'Hide signals & details ▲' : 'Why this alert? View signal breakdown →'}</span>
                      </button>

                      {a.evidence_strength && (
                        <div className="text-slate-400 font-mono text-[10px] hidden md:block uppercase">
                          Evidence Strength: {a.evidence_strength}
                        </div>
                      )}
                    </div>

                    {/* Expandable Mini Intelligence Panel */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.15 }}
                          className="pt-2 border-t border-slate-100"
                        >
                          <AlertSignalPanel alert={a} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )
            })}
          </div>
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

      {/* ── Intelligence Drawer ═══════════════════════════════════ */}
      <GlobalIntelligenceDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        type="alert"
        data={drawerAlert}
      />

      {showRules && <AlertRulesModal onClose={() => setShowRules(false)} />}
    </motion.div>
  )
}

/* Expanded signal breakdown — the project's REAL risk factors from
   /projects/{id}/risk, fetched on expand. No invented signals. */
function AlertSignalPanel({ alert }) {
  const risk = useQuery({
    queryKey: ['risk', String(alert.project_id)],
    queryFn: () => projectsApi.risk(alert.project_id),
    staleTime: 300_000,
    retry: false,
  })
  const factors = risk.data?.factors ?? []
  const dotCls = (sev) =>
    sev === 'critical' || sev === 'high' ? 'bg-red-600'
    : sev === 'medium' ? 'bg-amber-600' : 'bg-slate-400'
  return (
    <div className="p-3 rounded-lg bg-slate-50/90 border border-slate-200/80 space-y-2 text-xs">
      <div className="flex items-center justify-between font-mono font-bold text-[10.5px] uppercase text-slate-500">
        <span>
          DETECTED SIGNALS{alert.signal_count != null ? ` (${alert.signal_count})` : ''}
        </span>
        {alert.evidence_strength && <span>EVIDENCE: {alert.evidence_strength.toUpperCase()}</span>}
      </div>
      {risk.isPending ? (
        <Skeleton className="h-10" />
      ) : factors.length ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 text-[11px] font-medium">
          {factors.map((f, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${dotCls(f.severity)}`} />
              <span>{f.explanation ?? titleCase(f.factor_type?.replace(/_/g, ' ') ?? '')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500 font-medium">
          The full factor breakdown, with evidence for each signal, is on the project dossier.
        </p>
      )}
      <div className="pt-1.5 text-[10.5px] text-slate-500 font-mono border-t border-slate-200/60">
        Signals are AI decision-support indicators, not findings — verify on the project dossier.
      </div>
    </div>
  )
}

/* Read-only view of the REAL alerting rules, served from the pipeline's own
   config (/alerts/rules) — never hand-maintained copy that could drift. */
function AlertRulesModal({ onClose }) {
  const rules = useQuery({ queryKey: ['alert-rules'], queryFn: alertsApi.rules, staleTime: 300_000 })
  const r = rules.data
  return (
    <Modal label="Alert rules" onClose={onClose} maxWidth="max-w-lg">
      <h3 className="text-sm font-bold text-slate-900">Alert Rules</h3>
      <p className="mt-0.5 text-[11px] text-slate-500">{r?.source ?? 'Loading rule configuration…'}</p>

      {rules.isError && (
        <p className="mt-3 text-xs text-red-600 font-medium">Unable to load the rule configuration.</p>
      )}

      {r && (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            {r.rules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">{rule.name}</span>
                  <SeverityBadge severity={rule.severity} />
                </div>
                <p className="mt-1 text-[11px] text-slate-600">{rule.trigger}</p>
                <p className="mt-1 text-[10px] font-mono text-slate-400">
                  Created as: {rule.created_as} · Routed to: {rule.routed_to} team
                </p>
              </div>
            ))}
          </div>

          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-1.5">
              Risk score levels
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {r.risk_levels.map((l) => (
                <div key={l.level} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-center">
                  <div className="text-[10px] font-bold uppercase text-slate-700">{l.level}</div>
                  <div className="text-[10px] font-mono text-slate-500">{l.min_score}–{l.max_score}</div>
                </div>
              ))}
            </div>
          </div>

          <ul className="space-y-1 border-t border-slate-100 pt-3">
            {r.notes.map((n, i) => (
              <li key={i} className="text-[10.5px] text-slate-500 leading-relaxed">· {n}</li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
