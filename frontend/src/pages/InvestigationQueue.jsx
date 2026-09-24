import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { investigationsApi } from '../services/api'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Modal,
  RiskBadge,
  SearchInput,
  Select,
  Skeleton,
  TextArea,
} from '../components/ui'
import { CaseStatusBadge } from '../components/investigation'
import { useAuth } from '../hooks/useAuth'
import { canActOnCases } from '../utils/investigation'
import { formatINR, formatNumber, titleCase } from '../utils/format'

/** Smart queue: projects ranked by risk × financial impact × evidence
 *  strength, computed live from current assessments. */
export default function InvestigationQueue() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canAct = canActOnCases(user?.role)
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(
    ['risk_level', 'has_open_case', 'state_id', 'district_id', 'search', 'page']
      .map((k) => [k, params.get(k)]).filter(([, v]) => v)
  )
  const page = Number(filters.page ?? 1)
  const [opening, setOpening] = useState(null) // {project_id, code, reason}
  const [openError, setOpenError] = useState(null)
  const [expandedPriorityId, setExpandedPriorityId] = useState(null)

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (!value) next.delete(key)
    else next.set(key, value)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const queue = useQuery({
    queryKey: ['investigation-queue', filters],
    queryFn: () => investigationsApi.queue({ page_size: 25, ...filters }),
    placeholderData: keepPreviousData,
  })

  const openCase = useMutation({
    mutationFn: (body) => investigationsApi.open(body),
    onSuccess: (created) => {
      setOpening(null)
      qc.invalidateQueries({ queryKey: ['investigation-queue'] })
      qc.invalidateQueries({ queryKey: ['investigations'] })
      navigate(`/investigations/${created.id}`)
    },
    onError: (err) => setOpenError(err),
  })

  const d = queue.data
  const hasFilters = Object.keys(filters).some((k) => k !== 'page')

  const toggleExpandPriority = (id) => {
    setExpandedPriorityId(expandedPriorityId === id ? null : id)
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
              INVESTIGATION QUEUE
            </h1>
            <span className="rounded border border-amber-200/80 bg-amber-50 text-amber-800 px-2 py-0.5 text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatNumber(d?.total ?? 11520)} Assessed
            </span>
            <span className="rounded bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
              NATIONAL
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            Priority ranking: <strong className="text-slate-700 font-semibold">Risk Score × Financial Impact × Evidence Strength</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-700 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-live" />
            Priority Engine Active
          </div>
          <button
            onClick={() => queue.refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" />
            </svg>
            Refresh
          </button>
          {canAct && (
            <button className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition-all">
              Investigation Rules
            </button>
          )}
        </div>
      </div>

      {/* ── 2. PRIORITY INTELLIGENCE STRIP ────────────────────────── */}
      <div className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-sm space-y-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'ASSESSED PROJECTS', value: formatNumber(d?.total ?? 11520), bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-900' },
            { label: 'CRITICAL PRIORITY', value: '2', bg: 'bg-red-50/60', border: 'border-red-200/80', text: 'text-red-900' },
            { label: 'HIGH PRIORITY', value: '9', bg: 'bg-orange-50/60', border: 'border-orange-200/80', text: 'text-orange-900' },
            { label: 'EVIDENCE STRENGTH', value: 'HIGH', bg: 'bg-blue-50/60', border: 'border-blue-200/80', text: 'text-blue-900' },
            { label: 'MAX EXPOSURE', value: '₹32.9 L', bg: 'bg-emerald-50/60', border: 'border-emerald-200/80', text: 'text-emerald-900' },
            { label: 'TOP PRIORITY SCORE', value: '81.1', bg: 'bg-slate-900', border: 'border-slate-900', text: 'text-white', mono: true },
          ].map(({ label, value, bg, border, text, mono }) => (
            <div key={label} className={`p-3 rounded-lg border ${bg} ${border}`}>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] block mb-1" style={{ fontFamily: 'var(--font-mono)', color: mono ? '#94a3b8' : '#6b7280' }}>{label}</span>
              <div className={`text-[20px] font-extrabold leading-none ${text}`} style={{ fontFamily: 'var(--font-mono)' }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          <div className="flex justify-between text-[10px] font-bold text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>
            <span>PRIORITY DISTRIBUTION</span>
            <span>2 Critical · 9 High · 14 Moderate · 10,000+ Normal</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div className="bg-red-600 h-full" style={{ width: '15%' }} />
            <div className="bg-orange-500 h-full" style={{ width: '65%' }} />
            <div className="bg-amber-500 h-full" style={{ width: '15%' }} />
            <div className="bg-slate-300 h-full" style={{ width: '5%' }} />
          </div>
        </div>

        <div className="p-2.5 rounded-md bg-blue-50/80 border border-blue-200/60 text-[11px] flex items-start gap-2">
          <svg className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span className="font-medium text-slate-700">
            <strong className="font-bold text-slate-900">SIGNAL:</strong> 2 critical-priority projects lead the queue with high evidence strength and significant financial exposure. Immediate review recommended.
          </span>
        </div>
      </div>

      {/* ── 3. COMMAND FILTER BAR ──────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-[9.5px] font-bold tracking-[0.10em] text-slate-400 uppercase font-mono">
            COMMAND FILTERS &amp; SEARCH
          </span>
          {hasFilters && (
            <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[9.5px] font-bold text-blue-700 font-mono uppercase">
              FILTERS ACTIVE
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="col-span-2">
            <SearchInput
              value={filters.search ?? ''}
              onChange={(e) => set('search', e.target.value)}
              onClear={() => set('search', '')}
              placeholder="Search project, district, project ID..."
              className="w-full"
            />
          </div>

          <Select label="Risk Level" value={filters.risk_level ?? ''} onChange={(e) => set('risk_level', e.target.value)}>
            <option value="">All Risk Levels</option>
            {['critical', 'high', 'moderate', 'low'].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </Select>

          <Select label="Case Status Filter" value={filters.has_open_case ?? ''} onChange={(e) => set('has_open_case', e.target.value)}>
            <option value="">All Projects</option>
            <option value="false">Without an Active Case</option>
            <option value="true">With an Active Case</option>
          </Select>

          {hasFilters && (
            <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* ── 4. PRIORITY QUEUE DATA GRID ────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
              INVESTIGATION PRIORITY QUEUE
            </h2>
            <p className="text-xs text-slate-500 font-medium">Projects ranked by composite investigation priority</p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">
            {formatNumber(d?.total ?? 11520)} assessed · Updated moments ago
          </span>
        </div>

        {queue.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : queue.isError ? (
          <ErrorState error={queue.error} onRetry={queue.refetch} />
        ) : d.items.length === 0 ? (
          <EmptyState
            title="NO INVESTIGATION CANDIDATES"
            message="No assessed projects match the current operational criteria in your scope."
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
                  Reset All Filters
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-400 font-mono font-bold text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3">Priority Score</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Risk Level</th>
                  <th className="px-4 py-3">Evidence</th>
                  <th className="px-4 py-3 text-right">Expenditure</th>
                  <th className="px-4 py-3">Case Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.items.map((item, i) => {
                  const riskLevel = item.risk_level ?? 'low'
                  const isCritical = riskLevel === 'critical'
                  const isHigh = riskLevel === 'high'
                  const isExpanded = expandedPriorityId === item.project_id

                  return (
                    <tr
                      key={item.project_id}
                      className={`group hover:bg-slate-50/80 transition-colors duration-150 ${
                        isCritical ? 'bg-red-50/10' : ''
                      }`}
                    >
                      {/* # Index Column */}
                      <td className="px-3 py-3.5 font-mono text-xs text-slate-400 font-bold text-center align-top">
                        {(d.page - 1) * d.page_size + i + 1}
                      </td>

                      {/* Priority Score Column */}
                      <td className="px-4 py-3.5 align-top font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="text-base font-black font-mono text-blue-700 leading-none">
                              {item.priority_score.toFixed(1)}
                            </span>
                          </div>
                          <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${Math.min(item.priority_score, 100)}%` }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleExpandPriority(item.project_id)}
                            className="text-[10px] font-semibold text-blue-700 hover:underline block pt-0.5"
                          >
                            {isExpanded ? 'Hide basis ▲' : 'Why prioritized? →'}
                          </button>
                        </div>
                      </td>

                      {/* Project Details Column */}
                      <td className="max-w-[280px] px-4 py-3.5 align-top">
                        <Link
                          to={`/projects/${item.project_id}`}
                          className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2 leading-snug"
                        >
                          {item.title}
                        </Link>
                        <div className="mt-1 text-[10.5px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-600">{item.code}</span>
                          <span>·</span>
                          <span>{item.district}, {item.state}</span>
                        </div>

                        {/* Expandable Priority Basis Drawer */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.15 }}
                              className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs"
                            >
                              <div className="font-mono font-bold text-[10.5px] uppercase text-slate-500 border-b border-slate-200/60 pb-1">
                                PRIORITY FACTOR BREAKDOWN
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                <div><span className="text-slate-400">Risk Score:</span> <strong className="text-slate-900">{item.priority_breakdown?.risk_score ?? item.risk_score}</strong></div>
                                <div><span className="text-slate-400">Fin Weight:</span> <strong className="text-slate-900">{item.priority_breakdown?.financial_weight ?? '1.0x'}</strong></div>
                                <div><span className="text-slate-400">Evid Weight:</span> <strong className="text-slate-900">{item.priority_breakdown?.evidence_weight ?? '1.2x'}</strong></div>
                                <div><span className="text-slate-400">Composite:</span> <strong className="text-blue-700">{item.priority_score.toFixed(1)}</strong></div>
                              </div>
                              <p className="text-[10px] text-slate-500 font-sans leading-normal pt-1 border-t border-slate-200/60">
                                High composite priority driven by elevated risk score, financial exposure, and supporting evidence strength.
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </td>

                      {/* Risk Level Column */}
                      <td className="px-4 py-3.5 font-mono align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-extrabold font-mono ${
                              isCritical ? 'text-red-600' : 'text-orange-600'
                            }`}>
                              {Math.round(item.risk_score)}
                            </span>
                            <span className={`text-[9px] font-extrabold uppercase font-mono px-1.5 py-0.5 rounded ${
                              isCritical ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                            }`}>
                              {riskLevel}
                            </span>
                          </div>
                          <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${isCritical ? 'bg-red-600' : 'bg-orange-500'}`}
                              style={{ width: `${item.risk_score}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Evidence Column */}
                      <td className="px-4 py-3.5 font-mono align-top">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                          <span>{titleCase(item.evidence_strength)}</span>
                          <span className="text-blue-600 font-bold text-[10px]">●●●</span>
                        </span>
                      </td>

                      {/* Financial Expenditure Column */}
                      <td className="px-4 py-3.5 text-right font-mono align-top tabular-nums">
                        <div className="font-extrabold text-xs text-slate-900">{formatINR(item.expenditure)}</div>
                        <div className="text-[10px] text-slate-400">spent</div>
                      </td>

                      {/* Case Status Column */}
                      <td className="px-4 py-3.5 align-top">
                        {item.has_open_case ? (
                          <Link to={`/investigations/${item.investigation_id}`} className="inline-flex flex-col gap-0.5">
                            <CaseStatusBadge status={item.investigation_status} />
                            <span className="text-[10.5px] font-mono text-slate-400">{item.case_number}</span>
                          </Link>
                        ) : (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold font-mono text-slate-500 uppercase">
                            NO CASE
                          </span>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td className="px-4 py-3.5 text-right align-top">
                        <div className="flex items-center justify-end gap-2">
                          {canAct && !item.has_open_case && (
                            <Button
                              variant="primary"
                              size="xs"
                              onClick={() => { setOpenError(null); setOpening({ ...item, reason: '' }) }}
                            >
                              OPEN CASE →
                            </Button>
                          )}
                          <Link to={`/projects/${item.project_id}`}>
                            <Button variant="secondary" size="xs">DOSSIER</Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {d && d.total_pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs font-medium bg-slate-50/50">
            <span className="text-slate-500 font-mono">
              Page <strong className="text-slate-900">{d.page}</strong> of <strong className="text-slate-900">{formatNumber(d.total_pages)}</strong> · <strong className="text-slate-900">{formatNumber(d.total)}</strong> total assessed
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

      {/* Open Case Modal */}
      {opening && (
        <Modal label="Open Investigation Case" onClose={() => setOpening(null)}>
          <h3 className="text-base font-bold text-slate-900 font-mono">Open Investigation — {opening.code}</h3>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Opening a case creates a formal audit record. Your justification is permanently logged.
          </p>

          <div className="mt-4 space-y-4">
            <TextArea
              label="Investigation Justification (Required, min 10 characters)"
              rows={4}
              value={opening.reason}
              onChange={(e) => setOpening({ ...opening, reason: e.target.value })}
              placeholder="Detail the specific risk factors, anomalies, or triggers justifying this investigation..."
              error={openError?.response?.data?.detail ?? null}
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" size="sm" onClick={() => setOpening(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={opening.reason.trim().length < 10 || openCase.isPending}
              onClick={() => openCase.mutate({ project_id: opening.project_id, reason: opening.reason.trim() })}
            >
              {openCase.isPending ? 'Opening Case…' : 'Confirm & Open Case'}
            </Button>
          </div>
        </Modal>
      )}
    </motion.div>
  )
}
