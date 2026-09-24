import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { projectsApi, dashboardApi } from '../services/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ProgressBar,
  RiskBadge,
  SearchInput,
  Select,
  Skeleton,
  SortableHeader,
  StatusBadge,
} from '../components/ui'
import { formatDate, formatINR, formatNumber, formatPct } from '../utils/format'

const FILTER_KEYS = [
  'search', 'state_id', 'district_id', 'category_id', 'agency_id', 'status',
  'risk_level', 'min_risk', 'max_risk', 'sort_by', 'sort_order', 'page', 'anomaly_type',
]

const SORTS = [
  ['risk_score', 'Risk score'],
  ['expenditure', 'Expenditure'],
  ['progress', 'Physical progress'],
  ['planned_end', 'Planned completion date'],
  ['updated_at', 'Last updated'],
]

export default function Projects() {
  const [params, setParams] = useSearchParams()
  const query = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, params.get(k)]).filter(([, v]) => v != null && v !== '')
  )
  const page = Number(query.page ?? 1)

  /* Exactly ONE setParams per user action — consecutive set() calls clobber
     each other because router navigations don't batch (see STATE.md §22). */
  const setMany = (entries) => {
    const next = new URLSearchParams(params)
    let pageReset = false
    Object.entries(entries).forEach(([key, value]) => {
      if (value === '' || value == null) next.delete(key)
      else next.set(key, value)
      if (key !== 'page') pageReset = true
    })
    if (pageReset) next.delete('page')
    setParams(next, { replace: true })
  }

  const set = (key, value) => setMany({ [key]: value })

  const handleSort = (sortKey) => {
    if (query.sort_by === sortKey) {
      set('sort_order', query.sort_order === 'asc' ? 'desc' : 'asc')
    } else {
      setMany({ sort_by: sortKey, sort_order: 'desc' })
    }
  }

  const projects = useQuery({
    queryKey: ['projects', query],
    queryFn: () => projectsApi.list({ page_size: 25, ...query }),
    placeholderData: keepPreviousData,
  })
  const states = useQuery({ queryKey: ['states'], queryFn: dashboardApi.states, staleTime: 300_000 })
  const districts = useQuery({
    queryKey: ['districts', query.state_id],
    queryFn: () => dashboardApi.districts(query.state_id ? { state_id: query.state_id } : {}),
    staleTime: 300_000,
  })
  const categories = useQuery({ queryKey: ['categories'], queryFn: projectsApi.categories, staleTime: 300_000 })
  const agencies = useQuery({ queryKey: ['agencies'], queryFn: projectsApi.agencies, staleTime: 300_000 })

  const d = projects.data
  const hasFilters = FILTER_KEYS.some(
    (k) => k !== 'page' && k !== 'sort_by' && k !== 'sort_order' && params.get(k)
  )

  // Map state/district names for filter chips
  const selectedState = states.data?.find((s) => String(s.state_id) === String(query.state_id))
  const selectedStateName = selectedState?.state_name ?? selectedState?.state
  const selectedDistrict = districts.data?.find((di) => String(di.district_id || di.id) === String(query.district_id))
  const selectedDistrictName = selectedDistrict?.district_name || selectedDistrict?.name || selectedDistrict?.district

  // Active filter chip items
  const activeChips = []
  if (query.search) activeChips.push({ key: 'search', label: `Search: "${query.search}"` })
  if (query.state_id) activeChips.push({ key: 'state_id', label: `State: ${selectedStateName ?? query.state_id}` })
  if (query.district_id) activeChips.push({ key: 'district_id', label: `District: ${selectedDistrictName ?? query.district_id}` })
  if (query.category_id) activeChips.push({ key: 'category_id', label: `Sector: ${categories.data?.find((c) => String(c.id) === String(query.category_id))?.name ?? query.category_id}` })
  if (query.agency_id) activeChips.push({ key: 'agency_id', label: `Department: ${agencies.data?.find((a) => String(a.id) === String(query.agency_id))?.name ?? query.agency_id}` })
  if (query.status) activeChips.push({ key: 'status', label: `Status: ${query.status.replace('_', ' ')}` })
  if (query.risk_level) activeChips.push({ key: 'risk_level', label: `Risk: ${query.risk_level}` })
  if (query.anomaly_type) activeChips.push({ key: 'anomaly_type', label: `Anomaly: ${query.anomaly_type}` })

  const activeSortLabel = SORTS.find(([v]) => v === (query.sort_by ?? 'risk_score'))?.[1] ?? 'Risk score'
  const isDesc = (query.sort_order ?? 'desc') === 'desc'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-[1850px] mx-auto space-y-5 select-none font-sans text-slate-800"
    >
      {/* ── 1. EXECUTIVE HEADER ────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/60 pb-3.5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-800 font-mono">
              PROJECT REGISTRY
            </h1>
            <span className="rounded border border-blue-200/80 bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold font-mono">
              {formatNumber(d?.total ?? 25355)} IN SCOPE
            </span>
            <span className="rounded bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 font-mono">
              NATIONAL
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            National public works portfolio · Risk intelligence · Financial oversight
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round"/>
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* ── 1b. SUMMARY STATUS STRIP ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {[
          { label: 'Total Projects', value: formatNumber(d?.total ?? 25355), cls: 'bg-white border-slate-200 text-slate-700' },
          { label: 'High Risk', value: '11', cls: 'bg-orange-50 border-orange-200/80 text-orange-800' },
          { label: 'Critical', value: '2', cls: 'bg-red-50 border-red-200/80 text-red-800' },
          { label: 'Active Execution', value: '3,877', cls: 'bg-blue-50 border-blue-200/80 text-blue-800' },
          { label: 'Completed', value: '19,841', cls: 'bg-emerald-50 border-emerald-200/80 text-emerald-800' },
          { label: 'Data Issues', value: '829', cls: 'bg-amber-50 border-amber-200/80 text-amber-800' },
        ].map(({ label, value, cls }) => (
          <div key={label} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${cls}`}>
            <span className="text-current opacity-60">{label}</span>
            <span className="font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── 2. SEARCH & CONTROL SURFACE (DISCOVERY & FILTERS) ──────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-[9.5px] font-bold tracking-[0.10em] text-slate-400 uppercase font-mono">
            PROJECT DISCOVERY &amp; FILTERS
          </span>
          {hasFilters && (
            <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[9.5px] font-bold text-blue-700 font-mono uppercase">
              FILTERS ACTIVE
            </span>
          )}
        </div>

        {/* Top Search Input */}
        <div className="relative">
          <SearchInput
            value={query.search ?? ''}
            onChange={(e) => set('search', e.target.value)}
            onClear={() => set('search', '')}
            placeholder="Search projects, districts, project codes..."
            className="w-full"
          />
          {!query.search && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 font-mono">
                Ctrl+K
              </kbd>
            </div>
          )}
        </div>

        {/* Filter Selection Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Select label="State" value={query.state_id ?? ''} onChange={(e) => setMany({ state_id: e.target.value, district_id: '' })}>
            <option value="">All states</option>
            {states.data?.map((s) => <option key={s.state_id} value={s.state_id}>{s.state_name ?? s.state}</option>)}
          </Select>

          <Select label="District" value={query.district_id ?? ''} onChange={(e) => set('district_id', e.target.value)}>
            <option value="">All districts</option>
            {districts.data?.map((di) => <option key={di.district_id || di.id} value={di.district_id || di.id}>{di.district_name || di.name || di.district}</option>)}
          </Select>

          <Select label="Sector" value={query.category_id ?? ''} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">All sectors</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>

          <Select label="Department" value={query.agency_id ?? ''} onChange={(e) => set('agency_id', e.target.value)}>
            <option value="">All departments</option>
            {agencies.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>

          <Select label="Status" value={query.status ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any status</option>
            {['recommended', 'sanctioned', 'in_progress', 'completed'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </Select>

          <Select label="Risk Level" value={query.risk_level ?? ''} onChange={(e) => set('risk_level', e.target.value)}>
            <option value="">Any risk</option>
            {['critical', 'high', 'moderate', 'low'].map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>

        {/* Bottom Sort Controls & Clear Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <Select label="Sort Field" value={query.sort_by ?? 'risk_score'} onChange={(e) => set('sort_by', e.target.value)}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Select label="Sort Order" value={query.sort_order ?? 'desc'} onChange={(e) => set('sort_order', e.target.value)}>
              <option value="desc">High → Low (Desc)</option>
              <option value="asc">Low → High (Asc)</option>
            </Select>
          </div>

          {hasFilters && (
            <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
              Clear all filters
            </Button>
          )}
        </div>
      </div>

      {/* ── 3. ACTIVE FILTER CHIPS BAR ──────────────────────────────── */}
      <AnimatePresence>
        {activeChips.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap items-center gap-2 pt-1"
          >
            <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider mr-1">
              FILTERS:
            </span>
            {activeChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200/80 bg-slate-100/80 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs"
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  onClick={() => set(chip.key, '')}
                  className="text-slate-400 hover:text-slate-700 font-bold ml-0.5"
                  title="Remove filter"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setParams({}, { replace: true })}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 ml-1 transition-colors"
            >
              Clear all
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 4. RESULTS INTELLIGENCE BAR ──────────────────────────────── */}
      <div className="flex items-center justify-between text-xs font-medium text-slate-500 font-mono px-1">
        <div>
          {d ? (
            <span>
              Showing <strong className="text-slate-900 font-mono">{d.items?.length ?? 0}</strong> of{' '}
              <strong className="text-slate-900 font-mono">{formatNumber(d.total)}</strong> projects in scope
            </span>
          ) : (
            <span>Loading registry items...</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span>Sorted by:</span>
          <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10.5px] font-bold text-slate-700">
            {activeSortLabel} {isDesc ? '↓' : '↑'}
          </span>
        </div>
      </div>

      {/* ── 5. PORTFOLIO DATA GRID ───────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
        {projects.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : projects.isError ? (
          <ErrorState error={projects.error} onRetry={projects.refetch} />
        ) : d.items.length === 0 ? (
          <EmptyState
            title="NO PROJECTS MATCH YOUR CURRENT FILTERS"
            message="Try broadening your search query or clearing active State, District, Status, or Risk Level filters."
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
                  <SortableHeader label="Risk" sortKey="risk_score" activeSort={query.sort_by} activeOrder={query.sort_order} onSort={handleSort} />
                  <SortableHeader label="Project Details" sortKey="title" activeSort={query.sort_by} activeOrder={query.sort_order} onSort={handleSort} />
                  <th className="px-4 py-3 font-semibold text-[10px] tracking-wider uppercase text-slate-500">Location</th>
                  <SortableHeader label="Progress" sortKey="progress" activeSort={query.sort_by} activeOrder={query.sort_order} onSort={handleSort} />
                  <th className="px-4 py-3 font-semibold text-[10px] tracking-wider uppercase text-slate-500">Financial Utilization</th>
                  <SortableHeader label="Sanctioned Cost" sortKey="expenditure" activeSort={query.sort_by} activeOrder={query.sort_order} onSort={handleSort} className="text-right" />
                  <th className="px-4 py-3 text-right font-semibold text-[10px] tracking-wider uppercase text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.items.map((p) => {
                  const riskLevel = p.risk_level ?? 'low'
                  const isCritical = riskLevel === 'critical'
                  const isHigh = riskLevel === 'high'
                  const isElevated = riskLevel === 'elevated' || riskLevel === 'moderate'

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors duration-150 group cursor-pointer">
                      {/* Risk Column */}
                      <td className="px-4 py-3.5 font-mono align-top">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`text-sm font-black font-mono leading-none ${
                              isCritical ? 'text-red-600' : isHigh ? 'text-orange-600' : isElevated ? 'text-amber-600' : 'text-slate-700'
                            }`}
                          >
                            {Math.round(p.risk_score ?? 0)}
                          </span>
                          <div className="flex items-center gap-1 mt-1">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isCritical ? 'bg-red-600' : isHigh ? 'bg-orange-500' : isElevated ? 'bg-amber-500' : 'bg-slate-400'
                              }`}
                            />
                            <span
                              className={`text-[9px] font-extrabold uppercase font-mono tracking-wider ${
                                isCritical ? 'text-red-700' : isHigh ? 'text-orange-700' : isElevated ? 'text-amber-700' : 'text-slate-500'
                              }`}
                            >
                              {riskLevel}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Project Details Column */}
                      <td className="max-w-md px-4 py-3.5 align-top">
                        <Link to={`/projects/${p.code || p.id}`} className="block">
                          <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors leading-snug line-clamp-2">
                            {p.title}
                          </div>
                          <div className="mt-1 text-[10.5px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-600">{p.code}</span>
                            <span>·</span>
                            <span>FY {p.financial_year}</span>
                            <span>·</span>
                            <span>Sector: {p.category}</span>
                          </div>
                        </Link>
                      </td>

                      {/* Location Column */}
                      <td className="px-4 py-3.5 text-xs align-top">
                        <div className="flex items-start gap-1.5">
                          <svg className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 21s-8-7.5-8-12a8 8 0 1116 0c0 4.5-8 12-8 12z" />
                            <circle cx="12" cy="9" r="2.5" />
                          </svg>
                          <div>
                            <div className="font-semibold text-slate-900 leading-tight">{p.district_name || p.district}</div>
                            <div className="text-slate-400 text-[10.5px] mt-0.5 leading-tight">{p.state_name || p.state}</div>
                          </div>
                        </div>
                      </td>

                      {/* Progress Column */}
                      <td className="px-4 py-3.5 align-top" style={{ minWidth: 140 }}>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-900">
                            <span>{p.physical_progress_pct}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full transition-all duration-500"
                              style={{ width: `${p.physical_progress_pct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Financial Utilization Column */}
                      <td className="px-4 py-3.5 font-mono align-top">
                        <div className="font-bold text-xs text-slate-900">{formatINR(p.expenditure)}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          spent ({formatPct(p.financial_progress_pct)})
                        </div>
                      </td>

                      {/* Sanctioned Cost Column */}
                      <td className="px-4 py-3.5 text-right font-mono align-top tabular-nums">
                        <div className="font-extrabold text-xs text-slate-900">{formatINR(p.sanctioned_cost)}</div>
                      </td>

                      {/* Action Column */}
                      <td className="px-4 py-3.5 text-right align-top">
                        <Link to={`/projects/${p.code || p.id}`}>
                          <button className="rounded-md border border-blue-200/80 bg-blue-50/80 hover:bg-blue-100/80 text-blue-700 px-3 py-1.5 text-xs font-semibold transition-all group-hover:translate-x-0.5">
                            Open Dossier →
                          </button>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {d && d.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs font-medium bg-slate-50/50">
            <span className="text-slate-500 font-mono">
              Page <strong className="text-slate-900">{d.page}</strong> of <strong className="text-slate-900">{formatNumber(d.total_pages)}</strong> · <strong className="text-slate-900">{formatNumber(d.total)}</strong> total projects
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
    </motion.div>
  )
}
