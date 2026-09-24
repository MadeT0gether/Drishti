import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { projectsApi } from '../../services/api'
import { formatDate, formatINR, formatPct } from '../../utils/format'
import CitizenReportModal from '../../components/public/CitizenReportModal'
import CitizenReportTrackerModal from '../../components/public/CitizenReportTrackerModal'

export default function PublicProjectDetail() {
  const { projectId } = useParams()
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [isTrackerModalOpen, setIsTrackerModalOpen] = useState(false)
  const [activeTrackingRefId, setActiveTrackingRefId] = useState('')

  const detail = useQuery({
    queryKey: ['public-project-detail', projectId],
    queryFn: () => projectsApi.detail(projectId),
  })

  if (detail.isPending) {
    return <div className="p-8 text-center text-slate-500 font-mono text-xs">Loading public project record…</div>
  }
  if (detail.isError) {
    return <div className="p-8 text-center text-red-600 font-mono text-xs">Unable to load project record.</div>
  }

  const p = detail.data

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Breadcrumb + access label */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
          <Link to="/public/projects" className="hover:text-blue-700">Project Explorer</Link>
          <span>/</span>
          <span className="text-slate-900 font-bold">{p.code}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold font-mono text-emerald-800 tracking-wider">
          PUBLIC INFORMATION · READ ONLY
        </span>
      </div>

      {/* ── 1. PROJECT HEADER CARD ──────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:p-8 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-mono text-xs">
            <span className="rounded bg-blue-50 border border-blue-200 text-blue-800 font-bold px-2.5 py-0.5">
              {p.code}
            </span>
            <span className="rounded bg-slate-100 text-slate-700 font-bold px-2 py-0.5">
              Sector: {p.category}
            </span>
            <span className="text-slate-400">FY {p.financial_year}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1 text-xs transition-colors shadow-2xs"
            >
              <span>Report Discrepancy</span>
              <span className="font-mono text-xs">→</span>
            </button>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold font-mono text-[10.5px] px-3 py-1">
              STATUS: {p.status?.toUpperCase() ?? 'ACTIVE'}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{p.title}</h1>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Location: <strong>{p.district}, {p.state}</strong>{p.agency ? <> · Implementing Agency: <strong>{p.agency}</strong></> : null}
          </p>
        </div>

        {/* ── 2. FINANCIAL SUMMARY STRIP ──────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-100 font-mono text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">SANCTIONED AMOUNT</span>
            <div className="text-xl font-black text-slate-900">
              {p.sanctioned_cost != null ? formatINR(p.sanctioned_cost) : '—'}
            </div>
            <div className="text-[10px] text-slate-500 font-sans">Approved budget allocation</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">REPORTED EXPENDITURE</span>
            <div className="text-xl font-black text-blue-700">
              {p.expenditure != null ? formatINR(p.expenditure) : '—'}
            </div>
            <div className="text-[10px] text-slate-500 font-sans">Disbursed to date</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">PHYSICAL PROGRESS</span>
            <div className="text-xl font-black text-emerald-700">
              {p.physical_progress_pct ?? 0}%
            </div>
            <div className="text-[10px] text-slate-500 font-sans">Reported physical completion</div>
          </div>
        </div>
      </div>

      {/* ── 3. TIMELINE & IMPLEMENTATION SUMMARY ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 cols: Timeline */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Project Timeline &amp; Milestones</h2>
          <div className="space-y-4 font-sans text-xs">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                ✓
              </div>
              <div>
                <div className="font-bold text-slate-900">Project Sanction &amp; Approval</div>
                <div className="text-slate-500 font-mono text-[11px]">Sanction Date: {p.sanction_date ? formatDate(p.sanction_date) : 'N/A'}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                ✓
              </div>
              <div>
                <div className="font-bold text-slate-900">Implementation Commencement</div>
                <div className="text-slate-500 font-mono text-[11px]">Start Date: {p.actual_start ? formatDate(p.actual_start) : p.planned_start ? `${formatDate(p.planned_start)} (planned)` : 'N/A'}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                ●
              </div>
              <div>
                <div className="font-bold text-slate-900">{p.actual_end ? 'Completed' : 'Expected Completion'}</div>
                <div className="text-slate-500 font-mono text-[11px]">{p.actual_end ? `Completed: ${formatDate(p.actual_end)}` : `Completion Target: ${p.planned_end ? formatDate(p.planned_end) : 'N/A'}`}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 cols: Source Metadata */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Public Data Provenance</h2>
          <div className="space-y-3 font-mono text-xs text-slate-600">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">DATA SOURCE</span>
              <span className="font-semibold text-slate-900">
                {p.data_source === 'csv_import' ? 'CSV Import (Prototype)' : 'Prototype Synthetic Dataset'}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">RECORD CREATED</span>
              <span className="font-semibold text-slate-900">{p.created_at ? formatDate(p.created_at) : '—'}</span>
            </div>

            <div className="pt-2 border-t border-slate-100 text-[11px] font-sans text-slate-500 leading-relaxed">
              Public information displayed on this page is published under national transparency guidelines. Internal oversight signals are reserved for authorized government officers.
            </div>
          </div>
        </div>
      </div>

      {/* Citizen Reporting Modals */}
      <CitizenReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        initialProjectId={p.id}
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
