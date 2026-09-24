import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { alertsApi, dashboardApi, projectsApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Skeleton } from '../components/ui'
import RiskMap from '../components/maps/RiskMap'
import GlobalIntelligenceDrawer from '../components/ui/GlobalIntelligenceDrawer'
import ExecSummaryModal from '../components/ui/ExecSummaryModal'
import { formatINR } from '../utils/format'

/* ─── Sparkline ──────────────────────────────────────────────── */
function Sparkline({ data = [10, 15, 12, 18, 20, 25, 22, 28], color = '#1a56db', className = '' }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 56
    const y = 18 - ((v - min) / (max - min || 1)) * 14
    return `${x},${y}`
  }).join(' ')
  return (
    <svg className={`h-5 w-14 shrink-0 ${className}`} viewBox="0 0 56 20" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" points={pts}/>
    </svg>
  )
}

/* ─── Mini Bar ───────────────────────────────────────────────── */
function MiniBar({ value, max = 100, color = '#1a56db' }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex-1">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}

/* ─── KPI Card ───────────────────────────────────────────────── */
function KpiCard({ label, value, context, delta, trend, trendUp = true, sparkData, sparkColor = '#1a56db', accent, tooltip }) {
  const [showTip, setShowTip] = useState(false)
  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15 }}
      className="relative rounded-lg border bg-white p-4 flex flex-col justify-between"
      style={{
        borderColor: accent?.border ?? 'var(--color-border)',
        background: accent?.bg ?? '#fff',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Label row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-500"
              style={{ fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
        {tooltip && (
          <div className="relative" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
            <svg className="h-3.5 w-3.5 text-slate-400 cursor-help" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <AnimatePresence>
              {showTip && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 2 }}
                  className="absolute right-0 top-5 z-20 w-48 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg text-[10.5px] text-slate-700 leading-relaxed"
                >
                  {tooltip}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Value */}
      <div className="text-[22px] font-extrabold leading-none tabular-nums"
           style={{ color: accent?.text ?? 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
        {value}
      </div>

      {/* Context */}
      {context && (
        <div className="text-[10.5px] font-medium text-slate-500 mt-1 leading-snug">{context}</div>
      )}

      {/* Delta + Sparkline */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t" style={{ borderColor: accent?.border ?? 'var(--color-border-muted)' }}>
        {delta && (
          <span className={`text-[10px] font-bold tabular-nums ${trendUp ? 'text-red-600' : 'text-emerald-700'}`}
                style={{ fontFamily: 'var(--font-mono)' }}>
            {trendUp ? '↑' : '↓'} {delta}
          </span>
        )}
        {sparkData && <Sparkline data={sparkData} color={sparkColor} />}
      </div>
    </motion.div>
  )
}

/* ─── Risk Level Badge ────────────────────────────────────────── */
const RISK_META = {
  critical: { dot: '#dc2626', text: '#7f1d1d', bg: '#fef2f2', border: '#fca5a5', label: 'CRITICAL' },
  high:     { dot: '#ea580c', text: '#7c2d12', bg: '#fff3e0', border: '#fb923c', label: 'HIGH' },
  elevated: { dot: '#f97316', text: '#7c2d12', bg: '#fff7ed', border: '#fdba74', label: 'ELEVATED' },
  moderate: { dot: '#f59e0b', text: '#92400e', bg: '#fffbeb', border: '#fcd34d', label: 'MODERATE' },
  low:      { dot: '#64849a', text: '#3d5470', bg: '#f0f4f8', border: '#b8ccde', label: 'LOW' },
}

function RiskLevelBadge({ level, score }) {
  const m = RISK_META[level?.toLowerCase()] ?? RISK_META.low
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-col items-center justify-center" style={{ lineHeight: 1 }}>
        <span className="text-[16px] font-extrabold tabular-nums leading-none" style={{ color: m.dot, fontFamily: 'var(--font-mono)' }}>
          {Math.round(score)}
        </span>
      </div>
      <div>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: m.dot }} />
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: m.dot, fontFamily: 'var(--font-mono)' }}>
            {m.label}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─── Section Header ─────────────────────────────────────────── */
function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-slate-200/80 mb-3">
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800"
            style={{ fontFamily: 'var(--font-mono)' }}>
          {title}
        </h3>
        {subtitle && <p className="text-[10.5px] font-medium text-slate-400 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/* ─── Command Center ─────────────────────────────────────────── */
export default function CommandCenter() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mapMode, setMapMode] = useState('risk')
  const [selectedDistrict, setSelectedDistrict] = useState({
    id: 12, name: 'Bikaner', state_name: 'Rajasthan',
    risk_score: 72, risk_level: 'high',
    active_projects: 186, total_sanctioned: 247000000,
    utilization_pct: 64, high_risk_count: 9,
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerProject, setDrawerProject] = useState(null)

  /* ── Executive Summary state ────────────────────────────────── */
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryData, setSummaryData] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(null)

  /* ── Export menu state ──────────────────────────────────────── */
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const exportMenuRef = useRef(null)

  /* Close export menu on outside click */
  useEffect(() => {
    if (!exportMenuOpen) return
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportMenuOpen])

  /* Fetch executive summary */
  const handleExecSummary = useCallback(async () => {
    setSummaryOpen(true)
    setSummaryData(null)
    setSummaryError(null)
    setSummaryLoading(true)
    try {
      const data = await dashboardApi.executiveSummary()
      setSummaryData(data)
    } catch (err) {
      setSummaryError(err)
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  /* Download dashboard CSV */
  const handleExportCsv = useCallback(async () => {
    if (exportLoading) return
    setExportLoading(true)
    setExportMenuOpen(false)
    try {
      const blob = await dashboardApi.exportCsv()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'dashboard_data.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export failed:', err)
    } finally {
      setExportLoading(false)
    }
  }, [exportLoading])

  /* Download Executive Summary as a real ReportLab PDF from backend */
  const handlePdfDownload = useCallback(async () => {
    setExportMenuOpen(false)
    setExportLoading(true)
    try {
      const blob = await dashboardApi.exportPdf()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'DRISHTI_Executive_Summary.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExportLoading(false)
    }
  }, [])

  const overview = useQuery({ queryKey: ['overview'], queryFn: dashboardApi.overview })
  const priorityProjects = useQuery({
    queryKey: ['priority-queue'],
    queryFn: () => projectsApi.list({ sort_by: 'risk_score', page_size: 5 }),
  })
  const alerts = useQuery({
    queryKey: ['alerts', 'live-stream'],
    queryFn: () => alertsApi.list({ status: 'open', page_size: 3 }),
  })
  const mapData = useQuery({ queryKey: ['map', 'preview'], queryFn: () => dashboardApi.map() })
  const mapBoundaries = useQuery({ queryKey: ['map', 'boundaries'], queryFn: () => dashboardApi.mapBoundaries() })
  const states = useQuery({ queryKey: ['states'], queryFn: dashboardApi.states })

  const o = overview.data
  const totalSanctioned = o?.total_sanctioned ?? 32590000000
  const totalExpended = o?.total_expenditure ?? 25220000000
  const utilizationPct = totalSanctioned > 0 ? Math.round((totalExpended / totalSanctioned) * 100) : 77

  const queueItems = priorityProjects.data?.items?.length
    ? priorityProjects.data.items.slice(0, 5)
    : [
        { id: 1, code: 'MPL-2025-025001', title: 'Construction of open gym and sports ground', district_name: 'Tiruchirappalli', state_name: 'Tamil Nadu', risk_score: 81, risk_level: 'critical', sanctioned_cost: 3320000, confidence: '91%' },
        { id: 2, code: 'MPL-2025-025003', title: 'Drinking water facility near Krishnakara', district_name: 'Kozhikode', state_name: 'Kerala', risk_score: 74, risk_level: 'high', sanctioned_cost: 2800000, confidence: '87%' },
        { id: 3, code: 'MPL-2025-025004', title: 'Drainage line in Rajkhera, near Market Yard', district_name: 'Bikaner', state_name: 'Rajasthan', risk_score: 73, risk_level: 'high', sanctioned_cost: 2770000, confidence: '85%' },
        { id: 4, code: 'MPL-2025-025007', title: 'Anganwadi centre building at Anandhalli', district_name: 'Belagavi', state_name: 'Karnataka', risk_score: 72, risk_level: 'high', sanctioned_cost: 3170000, confidence: '84%' },
        { id: 5, code: 'MPL-2025-025006', title: 'Cement concrete road at Rajpalli, near Gram', district_name: 'Coimbatore', state_name: 'Tamil Nadu', risk_score: 72, risk_level: 'high', sanctioned_cost: 3680000, confidence: '83%' },
      ]

  const leaderboard = states.data?.length
    ? states.data.slice(0, 5)
    : [
        { state_id: 1, state_name: 'Tamil Nadu', utilization_pct: 77, avg_risk_score: 52, critical_count: 1 },
        { state_id: 2, state_name: 'Gujarat', utilization_pct: 72, avg_risk_score: 48, critical_count: 0 },
        { state_id: 3, state_name: 'Maharashtra', utilization_pct: 69, avg_risk_score: 46, critical_count: 0 },
        { state_id: 4, state_name: 'Karnataka', utilization_pct: 65, avg_risk_score: 50, critical_count: 2 },
        { state_id: 5, state_name: 'Rajasthan', utilization_pct: 63, avg_risk_score: 53, critical_count: 1 },
      ]

  const liveAlerts = alerts.data?.items?.length ? alerts.data.items.slice(0, 3) : [
    { id: 1, code: 'MPL-2025-025001', title: 'High cost deviation detected', severity: 'critical', risk_score: 81, district_name: 'Tiruchirappalli', state_name: 'Tamil Nadu', detected_at: '2m ago' },
    { id: 2, code: 'MPL-2025-025003', title: 'Payment mismatch anomaly', severity: 'high', risk_score: 74, district_name: 'Kozhikode', state_name: 'Kerala', detected_at: '7m ago' },
    { id: 3, code: 'MPL-2025-025004', title: 'Irregular vendor concentration', severity: 'high', risk_score: 73, district_name: 'Bikaner', state_name: 'Rajasthan', detected_at: '12m ago' },
  ]

  const openDrawer = useCallback((item) => {
    setDrawerProject(item)
    setDrawerOpen(true)
  }, [])

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-6">
      {/* ══ 1. HEADER ══════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse-live" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"
                style={{ fontFamily: 'var(--font-mono)' }}>
              NATIONAL INTELLIGENCE PULSE
            </h2>
          </div>
          <p className="text-[11px] font-medium text-slate-400 ml-4.5">
            Executive snapshot of programme execution and emerging risks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Executive Summary button */}
          <button
            onClick={handleExecSummary}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            Executive Summary
          </button>

          {/* Export Dashboard button + dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={exportLoading}
              className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-all shadow-sm disabled:opacity-60"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round"/>
              </svg>
              {exportLoading ? 'Exporting…' : 'Export Dashboard'}
              <svg className="h-3 w-3 ml-0.5 opacity-70" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Dropdown menu */}
            <AnimatePresence>
              {exportMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="absolute right-0 top-full mt-1.5 w-52 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden z-50"
                  style={{ boxShadow: '0 8px 24px -4px rgba(13,27,46,0.12), 0 3px 6px -2px rgba(13,27,46,0.06)' }}
                >
                  <div className="px-3 py-2 border-b border-slate-100">
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400"
                          style={{ fontFamily: 'var(--font-mono)' }}>
                      Export Options
                    </span>
                  </div>
                  {[
                    {
                      label: 'Dashboard Data (CSV)',
                      sub: 'All projects with risk scores',
                      icon: 'M9 17H7a4 4 0 01-4-4V5h18v8a4 4 0 01-4 4h-2M12 12v9M9 18l3 3 3-3',
                      onClick: handleExportCsv,
                    },
                    {
                      label: 'Executive Summary (PDF)',
                      sub: 'Structured ReportLab document',
                      icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
                      onClick: handlePdfDownload,
                    },
                  ].map(({ label, sub, icon, onClick }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2.5 transition-colors border-b border-slate-100 last:border-0"
                    >
                      <svg className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                        <path d={icon} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <div>
                        <div className="text-[11.5px] font-semibold text-slate-800">{label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ══ 2. KPI STRIP ══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="National Risk Index"
          value="68/100"
          context="Elevated Monitoring"
          delta="8 pts vs last month"
          trendUp={true}
          sparkData={[58, 60, 62, 58, 63, 65, 66, 68]}
          sparkColor="#dc2626"
          accent={{ bg: '#fff7f7', border: '#fecaca', text: '#991b1b' }}
          tooltip="Composite risk index aggregated from all active project assessments. Weighted by financial exposure and evidence strength."
        />
        <KpiCard
          label="Total Projects"
          value="25,355"
          context="3,877 active in execution"
          delta="142 new this month"
          trendUp={false}
          sparkData={[24800, 24900, 25000, 25100, 25200, 25280, 25320, 25355]}
          sparkColor="#1a56db"
          tooltip="Total projects in national scope across both Lok Sabha and Rajya Sabha constituencies."
        />
        <KpiCard
          label="Fund Allocated"
          value="₹3,259 Cr"
          context="Total sanctioned amount"
          sparkData={[3100, 3150, 3180, 3200, 3220, 3240, 3250, 3259]}
          sparkColor="#1a56db"
          tooltip="Total sanctioned cost across all active MPLADS projects in current financial year."
        />
        <KpiCard
          label="Fund Utilized"
          value={`₹2,522 Cr`}
          context={`${utilizationPct}% utilization rate`}
          delta="4.2 pts vs prev. quarter"
          trendUp={false}
          sparkData={[70, 72, 73, 74, 75, 76, 77, utilizationPct]}
          sparkColor="#047857"
          accent={{ bg: '#f0fdf4', border: '#bbf7d0', text: '#065f46' }}
          tooltip="Total funds released and expended. Higher utilization reflects better programme execution."
        />
        <KpiCard
          label="High Risk Projects"
          value="11"
          context="Require immediate review"
          delta="3 new this week"
          trendUp={true}
          sparkData={[5, 6, 7, 8, 7, 9, 10, 11]}
          sparkColor="#ea580c"
          accent={{ bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' }}
          tooltip="Projects with risk score above 60. Includes payment anomalies, cost outliers, and GPS issues."
        />
        <KpiCard
          label="Critical Projects"
          value="2"
          context="Action required urgently"
          sparkData={[0, 0, 1, 1, 1, 2, 2, 2]}
          sparkColor="#dc2626"
          accent={{ bg: '#fff1f2', border: '#fecdd3', text: '#881337' }}
          tooltip="Projects with risk score above 80 and multiple independent evidence signals. Immediate investigation recommended."
        />
      </div>

      {/* ══ 3. MAP + PRIORITY QUEUE ═══════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* National Risk Map (7 cols) */}
        <div className="lg:col-span-7 rounded-lg border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60 bg-white">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                NATIONAL RISK MAP
              </h3>
              <p className="text-[10.5px] font-medium text-slate-400 mt-0.5">
                District-level risk intensity — click district for intelligence
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-slate-500">Layer:</span>
              <select
                value={mapMode}
                onChange={e => setMapMode(e.target.value)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <option value="risk">Risk Score</option>
                <option value="health">Health Index</option>
                <option value="density">Project Density</option>
                <option value="investigations">Investigations</option>
              </select>
              <Link to="/map" className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 transition-colors ml-1">
                Expand →
              </Link>
            </div>
          </div>

          <div className="h-[420px] w-full relative" style={{ background: '#f8fafb' }}>
            <RiskMap
              data={mapData.data}
              districts={mapData.data?.districts ?? []}
              boundaries={mapBoundaries.data}
              mode={mapMode}
              selectedDistrictId={selectedDistrict?.id}
              onDistrictClick={d => {
                if (!d) return
                setSelectedDistrict({
                  id: d.district_id || d.id,
                  name: d.district || d.name,
                  state_name: d.state || d.state_name,
                  risk_score: d.avg_risk ?? d.risk_score ?? 68,
                  risk_level: (d.avg_risk ?? 0) > 80 ? 'critical' : (d.avg_risk ?? 0) > 60 ? 'high' : (d.avg_risk ?? 0) > 40 ? 'elevated' : (d.avg_risk ?? 0) > 20 ? 'moderate' : 'low',
                  active_projects: d.project_count ?? d.active_projects ?? 0,
                  total_sanctioned: d.expenditure ? d.expenditure * 1.3 : (d.total_sanctioned ?? 0),
                  utilization_pct: d.utilization_pct ?? 75,
                  high_risk_count: d.high_risk_count ?? 0,
                })
              }}
            />

            {/* Map Legend */}
            <div className="absolute bottom-3 left-3 bg-white/96 border border-slate-200/80 rounded-md px-3 py-2 shadow-sm z-10 space-y-1">
              <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 mb-1.5"
                   style={{ fontFamily: 'var(--font-mono)' }}>
                RISK SCORE
              </div>
              {[
                ['#3b7c3b', '0–20', 'Low'],
                ['#d4a017', '21–40', 'Moderate'],
                ['#d97706', '41–60', 'Elevated'],
                ['#ea580c', '61–80', 'High'],
                ['#dc2626', '81–100', 'Critical'],
              ].map(([color, range, label]) => (
                <div key={label} className="flex items-center gap-2 text-[10.5px] text-slate-700">
                  <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: color }} />
                  <span className="font-medium">{range}</span>
                  <span className="text-slate-400">{label}</span>
                </div>
              ))}
            </div>

            {/* District Intelligence Overlay */}
            <AnimatePresence>
              {selectedDistrict && (
                <motion.div
                  key={selectedDistrict.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-3 right-3 bg-white border border-slate-200/80 rounded-lg p-3.5 shadow-lg z-10 w-52"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[12px] font-bold text-slate-900 leading-tight">
                        {selectedDistrict.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">{selectedDistrict.state_name}</div>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            background: RISK_META[selectedDistrict.risk_level]?.bg ?? '#f0f4f8',
                            borderColor: RISK_META[selectedDistrict.risk_level]?.border ?? '#b8ccde',
                            color: RISK_META[selectedDistrict.risk_level]?.text ?? '#3d5470',
                          }}>
                      {(selectedDistrict.risk_level ?? 'low').toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      ['Risk Score', `${selectedDistrict.risk_score}/100`],
                      ['Active Projects', selectedDistrict.active_projects],
                      ['Fund Exposure', `₹${(selectedDistrict.total_sanctioned / 1e7).toFixed(1)} Cr`],
                      ['Utilization', `${selectedDistrict.utilization_pct}%`],
                      ['High Risk', selectedDistrict.high_risk_count],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">{k}</span>
                        <span className="font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => navigate(`/map?district_id=${selectedDistrict.id}`)}
                    className="mt-2.5 w-full text-center text-[10.5px] font-bold text-blue-700 hover:text-blue-900 transition-colors pt-2 border-t border-slate-100 block"
                  >
                    District Intelligence →
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Priority Review Queue (5 cols) */}
        <div className="lg:col-span-5 rounded-lg border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                PRIORITY REVIEW QUEUE
              </h3>
              <p className="text-[10.5px] font-medium text-slate-400 mt-0.5">
                Top projects requiring immediate attention
              </p>
            </div>
            <Link to="/projects" className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 transition-colors">
              View All →
            </Link>
          </div>

          <div className="overflow-hidden">
            <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="border-b border-slate-100" style={{ background: '#f8fafc' }}>
                  {['RISK', 'PROJECT', 'LOCATION', 'EXPOSURE', ''].map((h, i) => (
                    <th key={i} className="py-2 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 whitespace-nowrap"
                        style={{ fontFamily: 'var(--font-mono)', textAlign: i === 4 ? 'right' : 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queueItems.map((item, idx) => {
                  const m = RISK_META[item.risk_level?.toLowerCase()] ?? RISK_META.low
                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05, duration: 0.2 }}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 cursor-pointer transition-colors"
                      onClick={() => openDrawer(item)}
                    >
                      {/* Risk */}
                      <td className="py-3 px-3 align-middle">
                        <RiskLevelBadge level={item.risk_level} score={item.risk_score} />
                      </td>
                      {/* Project */}
                      <td className="py-3 px-3 align-middle max-w-[160px]">
                        <div className="text-[11.5px] font-semibold text-slate-900 truncate leading-snug">{item.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{item.code}</div>
                      </td>
                      {/* Location */}
                      <td className="py-3 px-3 align-middle">
                        <div className="text-[11.5px] font-semibold text-slate-700 whitespace-nowrap">{item.district_name}</div>
                        <div className="text-[10px] text-slate-400 whitespace-nowrap">{item.state_name}</div>
                      </td>
                      {/* Exposure */}
                      <td className="py-3 px-3 align-middle text-right">
                        <div className="text-[12px] font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                          ₹{item.sanctioned_cost ? (item.sanctioned_cost / 100000).toFixed(1) : '33.2'} L
                        </div>
                        <div className="text-[10px] text-slate-400">{item.confidence ?? '91%'} conf.</div>
                      </td>
                      {/* Action */}
                      <td className="py-3 px-3 align-middle text-right">
                        <button
                          onClick={e => { e.stopPropagation(); openDrawer(item) }}
                          className="rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 text-[10.5px] font-semibold transition-colors"
                        >
                          Review
                        </button>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>

            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Ranked by Risk × Financial Exposure × Evidence</span>
              <Link to="/investigations/queue" className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                Open Investigation Queue →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ══ 4. SECONDARY INTELLIGENCE ════════════════════════════ */}
      <div className="border-t border-slate-200/60 pt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700"
                style={{ fontFamily: 'var(--font-mono)' }}>
              SECONDARY INTELLIGENCE
            </h2>
            <p className="text-[10.5px] text-slate-400 font-medium mt-0.5">
              Supporting analytical signals for national programme risk assessment
            </p>
          </div>
        </div>

        {/* AI Risk Intelligence */}
        <div className="rounded-lg border border-slate-200/80 bg-white shadow-sm mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                AI RISK INTELLIGENCE
              </h3>
              <p className="text-[10.5px] font-medium text-slate-400 mt-0.5">
                Anomaly signals detected by automated ML pipeline · Assessment, not verdict
              </p>
            </div>
            <Link to="/projects?has_anomaly=true" className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 transition-colors">
              View All Signals →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
            {[
              { label: 'Cost Padding / Outliers', count: 242, conf: 94, color: '#1a56db', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
              { label: 'Progress–Payment Mismatch', count: 693, conf: 89, color: '#d97706', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
              { label: 'Payment Velocity Irregularity', count: 376, conf: 86, color: '#047857', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
              { label: 'Duplicate Title / Location', count: 82, conf: 92, color: '#dc2626', icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' },
            ].map(({ label, count, conf, color, icon }) => (
              <div key={label} className="px-4 py-4">
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="h-6 w-6 flex items-center justify-center rounded-md border border-slate-200 shrink-0 mt-0.5"
                       style={{ background: `${color}12` }}>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
                      <path d={icon} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 leading-snug">{label}</span>
                </div>
                <div className="text-[22px] font-extrabold leading-none tabular-nums text-slate-900 mb-1"
                     style={{ fontFamily: 'var(--font-mono)' }}>
                  {count.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-slate-400 font-medium mb-2">
                  Projects Affected · {conf}% confidence
                </div>
                <div className="flex items-center gap-2">
                  <MiniBar value={conf} max={100} color={color} />
                  <span className="text-[10px] font-bold tabular-nums" style={{ color, fontFamily: 'var(--font-mono)' }}>{conf}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial + State Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Financial Exposure */}
          <div className="rounded-lg border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                  FINANCIAL EXPOSURE OVERVIEW
                </h3>
                <p className="text-[10.5px] font-medium text-slate-400 mt-0.5">
                  Sanctioned vs Expenditure — FY 2024–25
                </p>
              </div>
              <span className="text-[9.5px] font-bold rounded border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-0.5"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                +4.8% vs prev. period
              </span>
            </div>
            <div className="px-4 py-4 space-y-4">
              {[
                { label: 'Total Sanctioned', value: '₹3,259 Cr', pct: 100, color: '#1a56db' },
                { label: 'Expenditure Released', value: '₹2,522 Cr', pct: utilizationPct, color: '#047857' },
                { label: 'Unspent Balance', value: '₹738 Cr', pct: 100 - utilizationPct, color: '#94a3b8' },
              ].map(({ label, value, pct, color }) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="font-semibold text-slate-700">{label}</span>
                    </div>
                    <span className="font-bold text-slate-900 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                      {value}
                    </span>
                  </div>
                  <MiniBar value={pct} max={100} color={color} />
                </div>
              ))}
              <div className="pt-2 text-center border-t border-slate-100">
                <Link to="/projects" className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                  Detailed Financial View →
                </Link>
              </div>
            </div>
          </div>

          {/* State Performance Leaderboard */}
          <div className="rounded-lg border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                  STATE PERFORMANCE
                </h3>
                <p className="text-[10.5px] font-medium text-slate-400 mt-0.5">
                  By risk-adjusted utilization — Top 5 States
                </p>
              </div>
              <Link to="/map" className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                Map View →
              </Link>
            </div>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }} className="border-b border-slate-100">
                  {['#', 'STATE', 'UTILIZATION', 'RISK', 'CRITICAL'].map((h, i) => (
                    <th key={h} className="py-2 px-3 text-[9px] font-bold uppercase tracking-[0.10em] text-slate-400"
                        style={{ fontFamily: 'var(--font-mono)', textAlign: i >= 2 ? 'right' : 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((st, idx) => (
                  <tr
                    key={st.state_id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/projects?state_id=${st.state_id}`)}
                  >
                    <td className="py-2.5 px-3 text-[10.5px] font-bold text-slate-400 tabular-nums"
                        style={{ fontFamily: 'var(--font-mono)' }}>
                      {String(idx + 1).padStart(2, '0')}
                    </td>
                    <td className="py-2.5 px-3 text-[11.5px] font-semibold text-slate-900">{st.state_name}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${st.utilization_pct}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 tabular-nums w-8 text-right"
                              style={{ fontFamily: 'var(--font-mono)' }}>
                          {st.utilization_pct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-[11px] font-bold text-slate-700 tabular-nums"
                            style={{ fontFamily: 'var(--font-mono)' }}>
                        {st.avg_risk_score}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-[11px] font-bold tabular-nums ${st.critical_count > 0 ? 'text-red-700' : 'text-slate-400'}`}
                            style={{ fontFamily: 'var(--font-mono)' }}>
                        {st.critical_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Risk Stream */}
        <div className="mt-4 rounded-lg border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                  LIVE RISK STREAM
                </h3>
                <p className="text-[10.5px] font-medium text-slate-400 mt-0.5">
                  Real-time anomaly notifications from the ML risk pipeline
                </p>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-live" />
                <span className="text-[9.5px] font-bold text-emerald-700" style={{ fontFamily: 'var(--font-mono)' }}>LIVE</span>
              </div>
            </div>
            <Link to="/alerts" className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 transition-colors">
              Alert Console →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-slate-100">
            {liveAlerts.map((alert, idx) => {
              const m = RISK_META[alert.severity?.toLowerCase()] ?? RISK_META.low
              return (
                <div key={alert.id ?? idx} className="px-4 py-4 hover:bg-slate-50/60 transition-colors cursor-pointer"
                     onClick={() => navigate('/alerts')}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: m.dot }} />
                      <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: m.dot, fontFamily: 'var(--font-mono)' }}>
                        {m.label}
                      </span>
                      <span className="text-[9.5px] text-slate-400 font-medium ml-1" style={{ fontFamily: 'var(--font-mono)' }}>
                        {alert.detected_at ?? `${(idx + 1) * 5}m ago`}
                      </span>
                    </div>
                    <span className="text-[11px] font-extrabold tabular-nums rounded px-1.5 py-0.5"
                          style={{ fontFamily: 'var(--font-mono)', background: m.bg, color: m.dot }}>
                      {Math.round(alert.risk_score)}/100
                    </span>
                  </div>
                  <div className="text-[12px] font-bold text-slate-900 leading-snug mb-1">
                    {alert.title ?? alert.trigger_description ?? 'Risk signal detected'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium" style={{ fontFamily: 'var(--font-mono)' }}>
                    {alert.code ?? alert.project_code} · {[alert.district_name, alert.state_name].filter(Boolean).join(', ')}
                  </div>
                  <div className="flex items-center justify-end mt-2">
                    <button className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                      Inspect →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ══ Intelligence Drawer ═══════════════════════════════════ */}
      <GlobalIntelligenceDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        type="project"
        data={drawerProject}
      />

      {/* ══ Executive Summary Modal ═══════════════════════════════ */}
      <ExecSummaryModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        data={summaryData}
        loading={summaryLoading}
        error={summaryError}
      />
    </div>
  )
}
