import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { dashboardApi, projectsApi } from '../../services/api'
import { formatINR, formatNumber } from '../../utils/format'
import CitizenReportModal from '../../components/public/CitizenReportModal'
import CitizenReportTrackerModal from '../../components/public/CitizenReportTrackerModal'

const STATUS_META = [
  { key: 'completed', label: 'COMPLETED', dot: 'bg-emerald-600', bar: 'bg-emerald-600' },
  { key: 'in_progress', label: 'IN PROGRESS', dot: 'bg-blue-600', bar: 'bg-blue-600' },
  { key: 'sanctioned', label: 'SANCTIONED', dot: 'bg-amber-500', bar: 'bg-amber-500' },
  { key: 'recommended', label: 'RECOMMENDED', dot: 'bg-slate-400', bar: 'bg-slate-400' },
]

const EXPLORE_CARDS = [
  {
    to: '/public/projects',
    title: 'Projects',
    desc: 'Search and browse public project records: sector, location, sanctioned amount, and reported progress.',
    cta: 'Explore Projects',
  },
  {
    to: '/public/map',
    title: 'Geography',
    desc: 'Explore programme activity by state and district — work counts, funding, and reported utilization.',
    cta: 'Explore Geography',
  },
  {
    to: '/public/reports',
    title: 'Reports',
    desc: 'Published programme information products and the schedule they follow.',
    cta: 'View Reports',
  },
]

const METHOD_ITEMS = [
  { id: 'sources', label: 'Sources', desc: 'Where published records come from' },
  { id: 'updates', label: 'Updates', desc: 'How often data is refreshed' },
  { id: 'progress', label: 'Definitions', desc: 'What "reported progress" means' },
  { id: 'limitations', label: 'Limitations', desc: 'Known gaps and caveats' },
]

export default function PublicOverview() {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [isTrackerModalOpen, setIsTrackerModalOpen] = useState(false)
  const [activeTrackingRefId, setActiveTrackingRefId] = useState('')

  const summary = useQuery({
    queryKey: ['public-summary'],
    queryFn: dashboardApi.overview,
  })
  const states = useQuery({
    queryKey: ['states'],
    queryFn: dashboardApi.states,
    staleTime: 300_000,
  })
  const districts = useQuery({
    queryKey: ['districts', null],
    queryFn: () => dashboardApi.districts({}),
    staleTime: 300_000,
  })
  const projects = useQuery({
    queryKey: ['public-projects-sample'],
    queryFn: () => projectsApi.list({ page_size: 5, sort_by: 'updated_at', sort_order: 'desc' }),
  })

  const data = summary.data
  const statusCounts = data?.status_counts ?? {}
  const totalProjects = data?.total_projects
  const statusRows = STATUS_META.map((m) => {
    const count = statusCounts[m.key] ?? 0
    const pct = totalProjects ? (count / totalProjects) * 100 : 0
    return { ...m, count, pct }
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-8"
    >
      {/* ── 1. HERO ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 lg:p-12 shadow-sm space-y-5 text-center">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold font-mono text-blue-700 uppercase tracking-widest">
          <span>DRISHTI</span>
          <span className="text-slate-300">·</span>
          <span>PUBLIC TRANSPARENCY PORTAL</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight max-w-3xl mx-auto">
          Public Programme Information &amp; Transparency
        </h1>
        <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-2xl mx-auto">
          Explore public information on government programme records, project progress,
          locations, and published reports.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link to="/public/projects">
            <button className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 text-xs font-bold transition-all shadow-sm">
              <span>Explore Projects</span>
              <span className="font-mono text-xs">→</span>
            </button>
          </Link>
          <Link to="/public/map">
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-5 py-2.5 text-xs font-bold transition-all shadow-2xs">
              <span>Explore Geography</span>
              <span className="font-mono text-xs">→</span>
            </button>
          </Link>
          <Link to="/public/reports">
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-5 py-2.5 text-xs font-bold transition-all shadow-2xs">
              <span>View Reports</span>
              <span className="font-mono text-xs">→</span>
            </button>
          </Link>
        </div>

        {/* ── 2. PUBLIC-DATA SUMMARY STRIP ────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-7 border-t border-slate-100 font-mono max-w-4xl mx-auto">
          <div className="space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {totalProjects != null ? formatNumber(totalProjects) : '—'}
            </div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Public Project Records</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {states.data ? formatNumber(states.data.length) : '—'}
            </div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">States Covered</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {districts.data ? formatNumber(districts.data.length) : '—'}
            </div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Districts Covered</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-amber-600">SYNTHETIC</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prototype Dataset</div>
          </div>
        </div>
      </div>

      {/* ── 3. WHAT YOU CAN EXPLORE ──────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">What You Can Explore</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {EXPLORE_CARDS.map((c) => (
            <Link key={c.to} to={c.to} className="group">
              <div className="h-full p-5 rounded-2xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all space-y-2 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{c.title}</div>
                  <p className="text-xs text-slate-600 leading-relaxed">{c.desc}</p>
                </div>
                <div className="text-xs font-bold text-blue-700 font-mono flex items-center gap-1 group-hover:translate-x-1 transition-transform pt-2">
                  <span>{c.cta}</span>
                  <span>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── 3B. CITIZEN ISSUE REPORTING & PUBLIC OVERSIGHT ──────────── */}
      <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/20 p-6 lg:p-8 shadow-sm space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-100/60 px-2.5 py-0.5 text-[10px] font-bold font-mono text-blue-800 tracking-wider uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse-live" />
              Citizen Feedback &amp; Ground Observations
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Report a Project Issue or Discrepancy
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Observed a stalled project, incorrect signboard, or progress discrepancy on the ground? Submit a factual observation report with photo evidence and GPS verification to aid official oversight.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-5 py-3 text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <span>Report an Issue</span>
              <span className="font-mono text-xs">→</span>
            </button>
            <button
              onClick={() => setIsTrackerModalOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-4 py-3 text-xs font-bold transition-all shadow-2xs"
            >
              <span>Track Report</span>
              <span className="font-mono text-xs">🔍</span>
            </button>
          </div>
        </div>

        {/* Feature summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-blue-100/60">
          <div className="p-4 rounded-xl bg-white/90 border border-slate-200/80 space-y-1 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <span className="text-blue-600 font-bold">📍</span>
              Geo-Tag &amp; Photo Evidence
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Capture or upload photos with automatic EXIF GPS extraction and map-pin verification.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/90 border border-slate-200/80 space-y-1 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <span className="text-emerald-600 font-bold">🛡️</span>
              Privacy Protected
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Contact details are restricted for official review follow-up and are never published publicly.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/90 border border-slate-200/80 space-y-1 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <span className="text-indigo-600 font-bold">📋</span>
              Auditable Tracking
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Receive a unique DRISHTI Reference ID to track review progress through official channels.
            </p>
          </div>
        </div>
      </div>

      {/* ── 4. PROJECT ACTIVITY ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Project Activity</h2>
            <p className="text-xs text-slate-500 font-medium">Portfolio by execution status, and the most recently updated public records</p>
          </div>
          <span className="text-[10.5px] font-mono text-slate-400">Prototype Dataset · Synthetic Data</span>
        </div>

        {/* status distribution — derived from live status counts */}
        <div className="space-y-3">
          <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            {statusRows.map((s) => (
              <div key={s.key} className={`h-full ${s.bar}`} style={{ width: `${s.pct}%` }} title={`${s.label}: ${s.pct.toFixed(1)}%`} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px]">
            {statusRows.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-slate-700">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <span className="font-bold">{s.label}</span>
                <span className="text-slate-500">
                  {totalProjects != null ? `${formatNumber(s.count)} (${s.pct.toFixed(0)}%)` : '—'}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* recently updated records */}
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {(projects.data?.items ?? []).map((p) => (
            <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">{p.code}</span>
                  <span className="rounded bg-slate-100 text-slate-700 text-[9.5px] font-bold font-mono px-1.5 py-0.5">
                    {p.category}
                  </span>
                </div>
                <Link to={`/public/projects/${p.id}`} className="font-bold text-slate-900 hover:text-blue-700 transition-colors text-sm">
                  {p.title}
                </Link>
                <div className="text-xs text-slate-500 font-medium">
                  {p.district}, {p.state}
                </div>
              </div>

              <div className="flex items-center gap-6 font-mono text-xs text-right">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Sanctioned</div>
                  <div className="font-bold text-slate-900">{p.sanctioned_cost != null ? formatINR(p.sanctioned_cost) : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Progress</div>
                  <div className="font-bold text-blue-700">{p.physical_progress_pct ?? 0}%</div>
                </div>
                <Link to={`/public/projects/${p.id}`}>
                  <button className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-semibold shadow-2xs">
                    View Record →
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="text-right">
          <Link to="/public/projects" className="text-xs font-bold text-blue-700 hover:underline font-mono">
            Explore all projects →
          </Link>
        </div>
      </div>

      {/* ── 5. DATA & METHODOLOGY STRIP ──────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Data &amp; Methodology</h2>
          <Link to="/public/methodology" className="text-xs font-bold text-blue-700 hover:underline font-mono">
            Read the full methodology →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {METHOD_ITEMS.map((m) => (
            <Link key={m.id} to={`/public/methodology#${m.id}`} className="group">
              <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-400 transition-colors space-y-1">
                <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{m.label}</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{m.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── 6. CITIZEN REPORTING MODALS ──────────────────────────────── */}
      <CitizenReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onOpenTracker={(refId) => {
          setActiveTrackingRefId(refId)
          setIsTrackerModalOpen(true)
        }}
      />

      <CitizenReportTrackerModal
        isOpen={isTrackerModalOpen}
        onClose={() => setIsTrackerModalOpen(false)}
        initialRefId={activeTrackingRefId}
      />
    </motion.div>
  )
}
