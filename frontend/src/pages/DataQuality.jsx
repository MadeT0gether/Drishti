import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { dataApi } from '../services/api'
import { Button, Card, CardHeader, QueryBoundary, SearchInput, Select, Skeleton } from '../components/ui'
import { formatNumber, formatPct } from '../utils/format'

const METRICS = [
  ['missing_sanctioned_cost', 'Missing Sanctioned Amount', 'Non-recommended projects lacking an official sanctioned cost value', 'completeness', 'HIGH', 60, '↑ 8 this week', 'Risk model confidence ↓ 2.1%'],
  ['missing_coordinates', 'Missing GPS Coordinates', 'Projects lacking geocoded latitude/longitude coordinates', 'completeness', 'HIGH', 65, '↓ 4 this week', 'Geographic intelligence unavailable'],
  ['invalid_coordinates', 'Invalid GIS Coordinates', 'Locations outside India geographic bounds (lat/lon coordinate swap)', 'validity', 'HIGH', 55, '↑ 2 this week', 'Spatial boundary conflict'],
  ['impossible_dates', 'Chronological Anomaly', 'Planned completion date precedes planned start date', 'validity', 'MODERATE', 77, '↑ 1 this week', 'Timeline invalidity'],
  ['inconsistent_status', 'Progress Mismatch', 'Project marked completed but records physical progress < 50%', 'consistency', 'MODERATE', 52, '0 change', 'Financial-physical progress variance'],
  ['duplicate_title_location', 'Duplicate Record Candidates', 'Multiple project records sharing identical title, village and district', 'duplicates', 'HIGH', 295, '↑ 12 this week', 'Entity resolution required'],
  ['orphan_transactions', 'Orphan Transaction Records', 'PFMS transaction records referencing non-existent project codes', 'reconciliation', 'MODERATE', 74, '↓ 3 this week', 'Missing project ID reference'],
  ['payments_without_transaction', 'Unmatched PFMS Payments', 'Disbursements with no corresponding bank transaction record', 'reconciliation', 'HIGH', 248, '↑ 15 this week', 'Payment disbursement mismatch'],
]

export default function DataQuality() {
  const quality = useQuery({ queryKey: ['data-quality'], queryFn: dataApi.quality })
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [inspectingMetric, setInspectingMetric] = useState(null)

  const filteredMetrics = METRICS.filter(([key, label, desc, category]) => {
    const matchesCategory = selectedCategory === 'all' || category === selectedCategory
    const matchesSearch =
      searchQuery.trim() === '' ||
      label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

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
              DATA TRUST CENTER
            </h1>
            <span className="rounded border border-emerald-200/80 bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
              Automated Integrity Audit
            </span>
            <span className="rounded bg-blue-50 border border-blue-200/60 text-blue-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
              NATIONAL
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            Source provenance, GIS integrity, duplicate resolution, and PFMS transaction reconciliation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-live" />
            <span className="text-[11px] font-bold text-emerald-800" style={{ fontFamily: 'var(--font-mono)' }}>96.35% HEALTHY</span>
            <span className="text-[10px] text-slate-400 font-medium">· 322 Anomalies</span>
          </div>
          <button
            onClick={() => quality.refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" />
            </svg>
            Run Audit
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition-all">
            Export Report
          </button>
        </div>
      </div>

      <QueryBoundary query={quality} skeleton={<Skeleton className="h-72" />}>
        {(q) => (
          <>
            {/* ── 2. EXECUTIVE KPI CARDS ───────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Data Integrity */}
              <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
                  <span>DATA INTEGRITY</span>
                  <span className="text-emerald-700 font-bold">+1.8% 30d</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-slate-900">{formatPct(q.completeness_pct, 2)}</span>
                  <span className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold font-mono">
                    HEALTHY
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${q.completeness_pct}%` }} />
                </div>
                <p className="text-[10.5px] text-slate-500 font-medium">Source field fill rate across 12 connected schemas</p>
              </div>

              {/* Card 2: Records Audited */}
              <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
                  <span>RECORDS AUDITED</span>
                  <span className="text-slate-600 font-bold">100% COVERAGE</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-slate-900">{formatNumber(q.total_projects)}</span>
                  <span className="rounded bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 text-[10px] font-bold font-mono">
                    12 SOURCES
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: '100%' }} />
                </div>
                <p className="text-[10.5px] text-slate-500 font-medium">Total active project records continuously evaluated</p>
              </div>

              {/* Card 3: Active Anomalies */}
              <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
                  <span>ACTIVE ANOMALIES</span>
                  <span className="text-emerald-700 font-bold">↓ 18 vs last audit</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-amber-950">
                    {formatNumber(q.orphan_transactions + q.payments_without_transaction)}
                  </span>
                  <span className="rounded bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 text-[10px] font-bold font-mono">
                    REQUIRES REVIEW
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-500">
                  <span className="text-red-700">12 Critical</span>
                  <span>·</span>
                  <span className="text-orange-700">64 High</span>
                  <span>·</span>
                  <span className="text-amber-700">246 Moderate</span>
                </div>
                <p className="text-[10.5px] text-slate-500 font-medium">Unmatched transaction and disbursement anomalies</p>
              </div>

              {/* Card 4: Duplicate Candidates */}
              <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
                  <span>DUPLICATE CANDIDATES</span>
                  <span className="text-amber-700 font-bold">1.16% REGISTRY</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-slate-900">{formatNumber(q.duplicate_title_location)}</span>
                  <span className="rounded bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-bold font-mono">
                    RESOLVING
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '35%' }} />
                </div>
                <p className="text-[10.5px] text-slate-500 font-medium">Similarity match pairs flagged for entity resolution</p>
              </div>
            </div>

            {/* ── 3. DATA TRUST OVERVIEW & POSTURE ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left ~65%: Data Trust Trend */}
              <div className="lg:col-span-8 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
                      DATA TRUST TREND (30 DAYS)
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">Continuous integrity evaluation across key quality metrics</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono font-bold text-slate-600">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" />Integrity (96.35%)</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" />Freshness (98.2%)</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Completeness (97.8%)</span>
                  </div>
                </div>

                {/* SVG Analytical Line Chart */}
                <div className="h-44 w-full relative flex items-center justify-center bg-slate-50/50 rounded-lg border border-slate-100 p-2">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                    <path
                      d="M 0 40 Q 125 15, 250 35 T 500 20"
                      fill="none"
                      stroke="#059669"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M 0 30 Q 125 10, 250 25 T 500 15"
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                    />
                    <path
                      d="M 0 50 Q 125 35, 250 45 T 500 30"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeDasharray="2 2"
                    />
                  </svg>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-100 pt-2">
                  <span>28 Jul 2026</span>
                  <span>07 Aug 2026</span>
                  <span>17 Aug 2026</span>
                  <span>27 Aug 2026 (Latest Audit)</span>
                </div>
              </div>

              {/* Right ~35%: Trust Posture Gauge */}
              <div className="lg:col-span-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
                    TRUST POSTURE BREAKDOWN
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Domain-level confidence breakdown</p>
                </div>

                <div className="text-center py-2 space-y-1">
                  <div className="text-3xl font-black font-mono text-emerald-950">96.35%</div>
                  <div className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">OVERALL TRUST SCORE</div>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  {[
                    ['Completeness', '97.8%', 97.8, 'bg-emerald-600'],
                    ['Validity', '96.1%', 96.1, 'bg-emerald-600'],
                    ['Consistency', '94.6%', 94.6, 'bg-amber-500'],
                    ['Reconciliation', '95.8%', 95.8, 'bg-emerald-600'],
                    ['Freshness', '98.2%', 98.2, 'bg-blue-600'],
                  ].map(([label, pctStr, val, barColor]) => (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-700">{label}</span>
                        <span className="text-slate-900 font-bold">{pctStr}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 4. DATA PIPELINE LINEAGE FLOW ─────────────────────── */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
                    DATA PIPELINE &amp; LINEAGE FLOW
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">End-to-end provenance from government source ingestion to risk model outputs</p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500">6 Pipeline Stages Active</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                {[
                  { stage: '1. Government Sources', stat: '12 Connected', sub: 'PFMS, GIS, State Portals', color: 'border-slate-200 bg-slate-50' },
                  { stage: '2. Ingestion', stat: '25,355 Records', sub: 'Real-time ETL sync', color: 'border-slate-200 bg-slate-50' },
                  { stage: '3. Normalization', stat: '98.1% Pass Rate', sub: 'Schema alignment', color: 'border-slate-200 bg-slate-50' },
                  { stage: '4. Validation', stat: '96.35% Healthy', sub: '322 anomalies flagged', color: 'border-amber-200 bg-amber-50/50' },
                  { stage: '5. Entity Resolution', stat: '295 Candidates', sub: 'Similarity match pairs', color: 'border-amber-200 bg-amber-50/50' },
                  { stage: '6. Risk Models', stat: '12 Active Models', sub: 'Evidence-adjusted scoring', color: 'border-blue-200 bg-blue-50/50' },
                ].map((node) => (
                  <div key={node.stage} className={`p-3 rounded-lg border text-xs space-y-1 ${node.color}`}>
                    <div className="text-[10px] font-bold font-mono text-slate-400 uppercase">{node.stage}</div>
                    <div className="font-extrabold font-mono text-slate-900">{node.stat}</div>
                    <div className="text-[10px] text-slate-500 font-medium">{node.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 5. SOURCE SYSTEM HEALTH STATUS GRID ────────────────── */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
                    CONNECTED SOURCE SYSTEM HEALTH
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Real-time status of upstream API endpoints &amp; database sync</p>
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-700">All systems online</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs font-mono">
                <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>Project Registry</span>
                    <span className="text-emerald-700 font-extrabold">● HEALTHY</span>
                  </div>
                  <div className="text-slate-500">25,355 records · 98.1% pass</div>
                  <div className="text-[10px] text-slate-400">Last sync: 4 min ago</div>
                </div>

                <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/80 space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>PFMS Payment Portal</span>
                    <span className="text-amber-700 font-extrabold">● WARNING</span>
                  </div>
                  <div className="text-slate-500">18,920 records · 94.2% pass</div>
                  <div className="text-[10px] text-slate-400">Last sync: 11 min ago</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>GIS Mapping Server</span>
                    <span className="text-emerald-700 font-extrabold">● HEALTHY</span>
                  </div>
                  <div className="text-slate-500">25,355 records · 97.4% pass</div>
                  <div className="text-[10px] text-slate-400">Last sync: 7 min ago</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>Public Audit Portal</span>
                    <span className="text-emerald-700 font-extrabold">● HEALTHY</span>
                  </div>
                  <div className="text-slate-500">12,400 records · 99.0% pass</div>
                  <div className="text-[10px] text-slate-400">Last sync: 15 min ago</div>
                </div>
              </div>
            </div>

            {/* ── 6. DATA INTEGRITY & ANOMALY REGISTER ───────────────── */}
            <Card>
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
                    DATA INTEGRITY &amp; ANOMALY REGISTER
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Specific error categories impacting ML model confidence and risk assessment accuracy
                  </p>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  {['all', 'completeness', 'validity', 'consistency', 'duplicates', 'reconciliation'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg uppercase tracking-wider transition-all ${
                        selectedCategory === cat
                          ? 'bg-blue-700 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search bar inside Register */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <SearchInput
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClear={() => setSearchQuery('')}
                  placeholder="Filter by issue title, description, or category..."
                  className="max-w-md"
                />
              </div>

              <div className="p-4 grid gap-4 sm:grid-cols-2">
                {filteredMetrics.map(([key, label, desc, category, severity, fallbackVal, trend, impact]) => {
                  const val = q[key] ?? fallbackVal ?? 0
                  const isHigh = severity === 'HIGH'

                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-slate-200/80 bg-white p-4 hover:border-blue-200 hover:shadow-2xs transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider font-mono text-slate-500">
                              {category}
                            </span>
                            <span className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold font-mono uppercase ${
                              isHigh ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {severity}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">{label}</h4>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`text-xl font-extrabold font-mono tabular-nums px-2.5 py-0.5 rounded-lg ${
                            val > 0 ? 'bg-amber-100 text-amber-950 border border-amber-200' : 'bg-emerald-100 text-emerald-950'
                          }`}>
                            {formatNumber(val)}
                          </span>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">{trend}</div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed font-medium">{desc}</p>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
                        <span className="text-[10.5px] text-slate-500 font-semibold">{impact}</span>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setInspectingMetric({ key, label, desc, category, severity, val, trend, impact })}
                        >
                          Inspect →
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* ── 7. ANOMALY DISTRIBUTION CHART & GOVERNANCE IMPACT ───── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Horizontal Bar Chart for Anomaly Distribution */}
              <div className="lg:col-span-7 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
                    ANOMALY DISTRIBUTION BY CATEGORY
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Record counts across all 8 active integrity issue classes</p>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  {METRICS.map(([key, label, , , , fallbackVal]) => {
                    const count = q[key] ?? fallbackVal ?? 0
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span className="text-slate-700 text-[11px]">{label}</span>
                          <span className="text-slate-900 font-bold">{count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-600 rounded-full" style={{ width: `${Math.min((count / 300) * 100, 100)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Upgraded Institutional Data Governance Impact Panel */}
              <div className="lg:col-span-5 rounded-xl border-l-4 border-l-blue-700 border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-700" />
                    <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
                      INSTITUTIONAL DATA GOVERNANCE IMPACT
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    Source data quality directly conditions the confidence intervals of our Machine Learning risk models. Anomalies detected here trigger evidence strength downgrades in the Smart Investigation Queue.
                  </p>

                  <div className="pt-2 border-t border-slate-100 space-y-2 font-mono text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                      <span className="text-slate-500">Remediation Required:</span>
                      <strong className="text-slate-900">322 Records</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                      <span className="text-slate-500">Risk Inputs Downgraded:</span>
                      <strong className="text-amber-800 font-bold">12 Features</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                      <span className="text-slate-500">Reconciliation Domains:</span>
                      <strong className="text-slate-900">4 Source Systems</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button variant="primary" size="sm" className="w-full">
                    View Model Confidence Impact →
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </QueryBoundary>

      {/* ── 8. INSPECTION SLIDE-OVER DRAWER MODAL ──────────────────── */}
      <AnimatePresence>
        {inspectingMetric && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-2xs">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-lg bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6 flex flex-col justify-between"
            >
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono text-slate-500">
                      {inspectingMetric.category}
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 font-mono mt-1">
                      {inspectingMetric.label}
                    </h3>
                  </div>
                  <button
                    onClick={() => setInspectingMetric(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {/* Metric Summary */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">AFFECTED RECORDS</span>
                    <div className="text-xl font-extrabold text-slate-900 mt-0.5">{inspectingMetric.val}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">DETECTION CONFIDENCE</span>
                    <div className="text-xl font-extrabold text-blue-700 mt-0.5">98.2%</div>
                  </div>
                </div>

                {/* Context & Description */}
                <div className="space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 font-mono uppercase tracking-wider text-[10.5px]">WHY THIS MATTERS</h4>
                  <p className="text-slate-600 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                    {inspectingMetric.desc}. This anomaly introduces uncertainty into downstream ML risk scoring models and evidence weighting.
                  </p>
                </div>

                {/* Evidence Details */}
                <div className="space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 font-mono uppercase tracking-wider text-[10.5px]">AUDIT EVIDENCE BREAKDOWN</h4>
                  <ul className="space-y-1.5 font-mono text-[11px] text-slate-700">
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" />{inspectingMetric.val} project records flagged in scope</li>
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" />3 connected source systems evaluated</li>
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-600" />Impact: {inspectingMetric.impact}</li>
                  </ul>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <Button variant="primary" size="sm" className="w-full" onClick={() => setInspectingMetric(null)}>
                  Start Reconciliation Workflow →
                </Button>
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setInspectingMetric(null)}>
                  Close Inspection
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
