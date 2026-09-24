import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { dashboardApi, projectsApi } from '../../services/api'
import { formatINR, formatNumber } from '../../utils/format'

export default function PublicProjects() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(
    ['state_id', 'district_id', 'status', 'category_id', 'agency_id', 'search', 'page', 'sort_by']
      .map((k) => [k, params.get(k)]).filter(([, v]) => v)
  )
  const page = Number(filters.page ?? 1)
  // Public listing defaults to recency, never the internal risk ranking.
  const sortBy = filters.sort_by ?? 'updated_at'

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (!value) next.delete(key)
    else next.set(key, value)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const projects = useQuery({
    queryKey: ['public-projects', filters],
    queryFn: () => projectsApi.list({ page_size: 20, ...filters, sort_by: sortBy, sort_order: 'desc' }),
    placeholderData: keepPreviousData,
  })

  const states = useQuery({ queryKey: ['states'], queryFn: dashboardApi.states, staleTime: 300_000 })
  const categories = useQuery({ queryKey: ['categories'], queryFn: projectsApi.categories, staleTime: 300_000 })
  const agencies = useQuery({ queryKey: ['agencies'], queryFn: projectsApi.agencies, staleTime: 300_000 })
  const districts = useQuery({
    queryKey: ['districts', filters.state_id],
    queryFn: () => dashboardApi.districts(filters.state_id ? { state_id: filters.state_id } : {}),
    staleTime: 300_000,
  })

  const d = projects.data

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* ── 1. HEADER & SEARCH BAR ─────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Project Explorer</h1>
            <span className="rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold font-mono px-2 py-0.5">
              {formatNumber(d?.total ?? 0)} PUBLIC RECORDS
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Browse approved public records on national infrastructure projects, reported progress, and locations.
          </p>
        </div>
      </div>

      {/* ── 2. FILTER TOOLBAR ─────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        {/* Search Input — prominent, full width */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
            SEARCH PUBLIC WORKS
          </label>
          <input
            type="text"
            value={filters.search ?? ''}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search by project name, reference code, sector, or location…"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 focus:outline-none shadow-2xs"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">

          {/* State Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
              STATE / UT
            </label>
            <select
              value={filters.state_id ?? ''}
              onChange={(e) => set('state_id', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-700 focus:bg-white focus:outline-none shadow-2xs"
            >
              <option value="">All States</option>
              {(states.data ?? []).map((s) => (
                <option key={s.state_id} value={s.state_id}>{s.state}</option>
              ))}
            </select>
          </div>

          {/* District Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
              DISTRICT
            </label>
            <select
              value={filters.district_id ?? ''}
              onChange={(e) => set('district_id', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-700 focus:bg-white focus:outline-none shadow-2xs"
            >
              <option value="">All Districts</option>
              {(districts.data ?? []).map((dist) => (
                <option key={dist.district_id} value={dist.district_id}>{dist.district}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
              EXECUTION STATUS
            </label>
            <select
              value={filters.status ?? ''}
              onChange={(e) => set('status', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-700 focus:bg-white focus:outline-none shadow-2xs"
            >
              <option value="">All Statuses</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="sanctioned">Sanctioned</option>
              <option value="recommended">Recommended</option>
            </select>
          </div>

          {/* Sector Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
              SECTOR
            </label>
            <select
              value={filters.category_id ?? ''}
              onChange={(e) => set('category_id', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-700 focus:bg-white focus:outline-none shadow-2xs"
            >
              <option value="">All Sectors</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Implementing Department Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
              DEPARTMENT
            </label>
            <select
              value={filters.agency_id ?? ''}
              onChange={(e) => set('agency_id', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-700 focus:bg-white focus:outline-none shadow-2xs"
            >
              <option value="">All Departments</option>
              {(agencies.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Sort Control */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
              SORT BY
            </label>
            <select
              value={sortBy}
              onChange={(e) => set('sort_by', e.target.value === 'updated_at' ? '' : e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-700 focus:bg-white focus:outline-none shadow-2xs"
            >
              <option value="updated_at">Recently Updated</option>
              <option value="progress">Progress</option>
              <option value="sanctioned_cost">Amount</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 3. PUBLIC PROJECTS TABLE ───────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <table className="w-full text-left text-xs border-collapse font-sans">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono font-bold text-[10px] uppercase">
            <tr>
              <th className="px-4 py-3">Reference Code</th>
              <th className="px-4 py-3">Project Title &amp; Sector</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Physical Progress</th>
              <th className="px-4 py-3 text-right">Sanctioned Amount</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(d?.items ?? []).map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-4 py-3.5 font-mono font-bold text-slate-700">{p.code}</td>
                <td className="px-4 py-3.5 max-w-md">
                  <Link to={`/public/projects/${p.id}`} className="font-bold text-slate-900 hover:text-blue-700 transition-colors text-sm">
                    {p.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5 font-mono text-[10.5px] text-slate-500">
                    <span>Sector: <strong>{p.category}</strong></span>
                    <span>·</span>
                    <span>FY {p.financial_year}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-slate-700 font-semibold">{p.district}, {p.state}</td>
                <td className="px-4 py-3.5 font-mono">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-900 mb-1">
                    <span>{p.physical_progress_pct ?? 0}%</span>
                    <span className="text-[10px] text-slate-400 font-normal">Reported</span>
                  </div>
                  <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-700 rounded-full" style={{ width: `${p.physical_progress_pct ?? 0}%` }} />
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                  {p.sanctioned_cost != null ? formatINR(p.sanctioned_cost) : '—'}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <Link to={`/public/projects/${p.id}`}>
                    <button className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold shadow-2xs">
                      Public Record →
                    </button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {d && d.total_pages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs font-mono">
          <span className="text-slate-500">Page {page} of {d.total_pages} ({d.total} projects)</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => set('page', page - 1)}
              className="rounded border border-slate-200 bg-white px-3 py-1 text-slate-700 disabled:opacity-50 font-bold"
            >
              ← Prev
            </button>
            <button
              disabled={page >= d.total_pages}
              onClick={() => set('page', page + 1)}
              className="rounded border border-slate-200 bg-white px-3 py-1 text-slate-700 disabled:opacity-50 font-bold"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
