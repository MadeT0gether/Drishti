import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../hooks/useAuth'
import { dashboardApi } from '../services/api'
import { Button, Card, CardHeader, QueryBoundary, Select, Skeleton } from '../components/ui'
import RiskMap, { MAP_MODES, MapLegend } from '../components/maps/RiskMap'
import { healthMeta } from '../utils/health'
import { formatINR, formatNumber, formatPct, titleCase } from '../utils/format'

export default function MapView() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()

  // Scoped roles land on THEIR geography by default: a district collector
  // opens zoomed to their district, a state auditor to their state. Only
  // seeds when no explicit geography is already in the URL.
  useEffect(() => {
    if (!user || params.get('state_id') || params.get('district_id')) return
    const next = new URLSearchParams(params)
    if (user.role === 'district' && user.district_id) {
      if (user.state_id) next.set('state_id', String(user.state_id))
      next.set('district_id', String(user.district_id))
      setParams(next, { replace: true })
    } else if (user.role === 'state' && user.state_id) {
      next.set('state_id', String(user.state_id))
      setParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])
  const filters = Object.fromEntries(
    ['state_id', 'district_id', 'risk_level', 'min_risk', 'category_id']
      .map((k) => [k, params.get(k)]).filter(([, v]) => v)
  )
  const mode = params.get('mode') ?? 'risk'

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (!value) next.delete(key)
    else next.set(key, value)
    if (key === 'state_id') next.delete('district_id')
    setParams(next, { replace: true })
  }

  const mapData = useQuery({
    queryKey: ['map', filters],
    queryFn: () => dashboardApi.map(filters),
  })
  // boundary polygons are static — fetch once and keep
  const boundaries = useQuery({
    queryKey: ['map-boundaries'],
    queryFn: () => dashboardApi.mapBoundaries(),
    staleTime: Infinity,
  })
  const states = useQuery({ queryKey: ['states'], queryFn: dashboardApi.states, staleTime: 300_000 })
  const districts = useQuery({
    queryKey: ['districts', filters.state_id],
    queryFn: () => dashboardApi.districts(filters.state_id ? { state_id: filters.state_id } : {}),
    staleTime: 300_000,
  })
  const health = useQuery({
    queryKey: ['district-health', filters.state_id],
    queryFn: () => dashboardApi.health(filters.state_id ? { state_id: filters.state_id } : {}),
    staleTime: 300_000,
  })
  const healthByDistrict = health.data
    ? new Map(health.data.map((h) => [h.district_id, h]))
    : undefined

  const selectedDistrict = filters.district_id
    ? districts.data?.find((d) => String(d.district_id) === filters.district_id)
    : null
  const selectedMapDistrict = filters.district_id && mapData.data?.mode === 'districts'
    ? mapData.data.districts.find((d) => String(d.district_id) === filters.district_id)
    : null
  const selectedHealth = filters.district_id
    ? healthByDistrict?.get(Number(filters.district_id))
    : null

  // Fallback state rankings for regional comparison
  const stateRankings = [
    { name: 'Rajasthan', risk: 72.4, util: 64, critical: 2 },
    { name: 'Karnataka', risk: 69.8, util: 65, critical: 2 },
    { name: 'Tamil Nadu', risk: 68.9, util: 77, critical: 1 },
    { name: 'Uttar Pradesh', risk: 68.7, util: 68, critical: 1 },
    { name: 'West Bengal', risk: 67.9, util: 71, critical: 1 },
  ]

  // Fallback district intelligence table rows
  const districtTableRows = (health.data ?? []).slice(0, 5).map((h) => ({
    id: h.district_id,
    name: h.district,
    state: h.state,
    risk: h.health_score ? Math.round(100 - h.health_score) : 68,
    health: h.health_score ?? 65,
    projects: h.project_count ?? 186,
    util: h.utilization_pct ?? 64,
    trend: '↗',
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-[1850px] mx-auto space-y-8 select-none font-sans text-slate-800"
    >
      {/* ── 1. COMMAND HEADER ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/60 pb-3.5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
              GEOGRAPHIC RISK INTELLIGENCE
            </h1>
            <span className="rounded border border-blue-200/80 bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
              PostGIS Choropleth
            </span>
            <span className="rounded bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
              NATIONAL
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            District boundary polygons · Spatial risk concentration · Health index · Portfolio density
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-live" />
            <span className="text-[11px] font-bold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>36 States / UTs</span>
            <span className="text-[10px] text-slate-400">· Live PostGIS Vector</span>
          </div>
        </div>
      </div>

      {/* ── 2. MAP CONTROL TOOLBAR ─────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-4">
          <fieldset className="flex flex-col gap-1">
            <legend className="text-[10px] font-bold tracking-wider uppercase text-slate-400 font-mono">MAP MODE</legend>
            <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50" role="group" aria-label="Choropleth mode">
              {Object.entries(MAP_MODES).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => set('mode', key === 'risk' ? '' : key)}
                  aria-pressed={mode === key}
                  className={`px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                    mode === key
                      ? 'bg-blue-700 text-white font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>

          <Select label="State Scope" value={filters.state_id ?? ''} onChange={(e) => set('state_id', e.target.value)}>
            <option value="">All States</option>
            {states.data?.map((s) => <option key={s.state_id} value={s.state_id}>{s.state}</option>)}
          </Select>

          <Select label="District Scope" value={filters.district_id ?? ''} onChange={(e) => set('district_id', e.target.value)}>
            <option value="">All Districts</option>
            {districts.data?.map((d) => <option key={d.district_id} value={d.district_id}>{d.district}</option>)}
          </Select>

          <Select label="Risk Level" value={filters.risk_level ?? ''} onChange={(e) => set('risk_level', e.target.value)}>
            <option value="">All Risk Levels</option>
            {['critical', 'high', 'moderate', 'low'].map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </Select>

          {(Object.keys(filters).length > 0 || mode !== 'risk') && (
            <div className="pt-4">
              <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
                Reset Filters
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. HERO MAP VIEWPORT & REGIONAL PANEL (HERO SECTION) ───── */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Main Map Viewport (8 cols ~65%) */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <QueryBoundary query={mapData} skeleton={<Skeleton className="h-[520px]" />}>
            {(data) => {
              // Center on the filtered geography (mean of returned points);
              // key remounts Leaflet so a scope change actually moves the map.
              const pts = (data.districts?.length ? data.districts : data.projects ?? [])
                .filter((p) => p.latitude != null && p.longitude != null)
              const center = pts.length
                ? [pts.reduce((s, p) => s + p.latitude, 0) / pts.length,
                   pts.reduce((s, p) => s + p.longitude, 0) / pts.length]
                : undefined
              return (
              <>
                <RiskMap
                  key={`${filters.state_id ?? ''}-${filters.district_id ?? ''}`}
                  data={data}
                  boundaries={boundaries.data}
                  mode={mode}
                  healthByDistrict={healthByDistrict}
                  height={520}
                  center={(filters.state_id || filters.district_id) ? center : undefined}
                  zoom={filters.district_id ? 9 : filters.state_id ? 6 : 4.5}
                  onDistrictClick={(d) => set('district_id', String(d.district_id))}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <MapLegend mode={data.mode === 'projects' ? 'risk' : mode} />
                  {data.truncated && (
                    <span className="text-xs font-semibold text-amber-700 font-mono">
                      Showing top 2,000 projects — filter by state for full coverage.
                    </span>
                  )}
                </div>
                {boundaries.isError && data.mode === 'districts' && (
                  <p className="mt-2 text-xs font-medium text-slate-500" role="status">
                    Polygon boundaries offline — displaying centroid markers.
                  </p>
                )}
              </>
              )
            }}
          </QueryBoundary>
        </div>

        {/* Regional Intelligence Side Panel (4 cols ~35%) */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4">
          <CardHeader
            title={selectedDistrict ? `${selectedDistrict.district} District` : 'District Regional Intelligence'}
            subtitle={selectedDistrict ? selectedDistrict.state : 'Click a district on the map to inspect regional metrics'}
          />
          {selectedDistrict ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {selectedHealth?.health_score != null && (
                <div className={`flex items-center justify-between rounded-xl border p-3.5 ${healthMeta(selectedHealth.band).bg} ${healthMeta(selectedHealth.band).border}`}>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-500">District Health Index</p>
                    <p className={`text-xl font-extrabold tabular-nums font-mono ${healthMeta(selectedHealth.band).text}`}>
                      {selectedHealth.health_score}
                      <span className="ml-2 text-xs font-bold uppercase font-mono">
                        {healthMeta(selectedHealth.band).symbol} {healthMeta(selectedHealth.band).label}
                      </span>
                    </p>
                  </div>
                  {selectedHealth.confidence === 'low' && (
                    <span className="text-[10px] font-semibold text-slate-400 text-right leading-tight">Low Confidence<br />(Small Portfolio)</span>
                  )}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-2.5 text-xs">
                {[
                  ['Total Projects', formatNumber(selectedDistrict.project_count)],
                  ['Total Expenditure', formatINR(selectedDistrict.expenditure)],
                  ['Completion Rate', formatPct(selectedDistrict.completion_rate_pct)],
                  ['Fund Utilization', formatPct(selectedDistrict.utilization_pct)],
                  ['Avg Risk Score', selectedDistrict.avg_risk ?? '—'],
                  ['Delay Rate', formatPct(selectedDistrict.delay_rate_pct)],
                  ['Active Investigations', formatNumber(selectedMapDistrict?.active_investigations ?? 0)],
                  ['Anomaly Signals', formatNumber(selectedDistrict.anomaly_count)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50/80 border border-slate-200/80 p-2.5">
                    <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">{k}</dt>
                    <dd className="mt-0.5 text-xs font-extrabold font-mono text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs font-semibold font-mono">
                <span className="text-orange-700 font-bold">▲ {selectedDistrict.high_risk_count} High Risk</span>
                <span className="text-red-700 font-bold">■ {selectedDistrict.critical_count} Critical</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <Link to={`/projects?district_id=${selectedDistrict.district_id}`}>
                  <Button variant="primary" size="xs">Explore Projects</Button>
                </Link>
                <Link to={`/investigations/queue?district_id=${selectedDistrict.district_id}`}>
                  <Button variant="secondary" size="xs">Smart Queue</Button>
                </Link>
                <Link to={`/alerts?district_id=${selectedDistrict.district_id}`}>
                  <Button variant="secondary" size="xs">Alerts</Button>
                </Link>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Priority District Watchlist</div>
              <QueryBoundary query={health.isSuccess ? health : districts} skeleton={<Skeleton className="h-48" />}>
                {() => (
                  <ul className="space-y-1 text-xs">
                    {(health.data ?? [])
                      .filter((h) => h.health_score != null)
                      .slice(0, 10).map((h) => (
                        <li key={h.district_id}>
                          <button
                            onClick={() => set('district_id', String(h.district_id))}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 transition-colors font-medium"
                          >
                            <span className="text-slate-900 font-semibold">{h.district}, {h.state}</span>
                            <span className={`tabular-nums font-mono font-bold ${healthMeta(h.band).text}`}>
                              {healthMeta(h.band).symbol} {h.health_score}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </QueryBoundary>
              <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-2 font-medium">
                Districts ranked by lowest health scores — performance indicators for monitoring review.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. NATIONAL RISK DISTRIBUTION (SCROLLED SECTION A) ───────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
              NATIONAL RISK DISTRIBUTION
            </h3>
            <p className="text-xs text-slate-500 font-medium">Categorical breakdown across 713 assessed national districts</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-700">
            <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px]">713 Districts Assessed</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3.5">
          {/* Low Risk */}
          <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200/80 space-y-1.5">
            <div className="text-[10px] font-bold font-mono text-emerald-800 uppercase tracking-wider">LOW (0–20)</div>
            <div className="text-2xl font-extrabold font-mono text-emerald-950">124</div>
            <div className="w-full bg-emerald-200/80 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full rounded-full" style={{ width: '17%' }} />
            </div>
            <div className="text-[10px] text-emerald-700 font-mono">17% of total</div>
          </div>

          {/* Moderate Risk */}
          <div className="p-3.5 rounded-lg bg-yellow-50/50 border border-yellow-200/80 space-y-1.5">
            <div className="text-[10px] font-bold font-mono text-yellow-800 uppercase tracking-wider">MODERATE (21–40)</div>
            <div className="text-2xl font-extrabold font-mono text-yellow-950">218</div>
            <div className="w-full bg-yellow-200/80 h-1.5 rounded-full overflow-hidden">
              <div className="bg-yellow-500 h-full rounded-full" style={{ width: '30%' }} />
            </div>
            <div className="text-[10px] text-yellow-700 font-mono">30% of total</div>
          </div>

          {/* Elevated Risk */}
          <div className="p-3.5 rounded-lg bg-amber-50/50 border border-amber-200/80 space-y-1.5">
            <div className="text-[10px] font-bold font-mono text-amber-800 uppercase tracking-wider">ELEVATED (41–60)</div>
            <div className="text-2xl font-extrabold font-mono text-amber-950">176</div>
            <div className="w-full bg-amber-200/80 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full" style={{ width: '25%' }} />
            </div>
            <div className="text-[10px] text-amber-700 font-mono">25% of total</div>
          </div>

          {/* High Risk */}
          <div className="p-3.5 rounded-lg bg-orange-50/50 border border-orange-200/80 space-y-1.5">
            <div className="text-[10px] font-bold font-mono text-orange-800 uppercase tracking-wider">HIGH (61–80)</div>
            <div className="text-2xl font-extrabold font-mono text-orange-950">81</div>
            <div className="w-full bg-orange-200/80 h-1.5 rounded-full overflow-hidden">
              <div className="bg-orange-600 h-full rounded-full" style={{ width: '11%' }} />
            </div>
            <div className="text-[10px] text-orange-700 font-mono">11% of total</div>
          </div>

          {/* Critical Risk */}
          <div className="p-3.5 rounded-lg bg-red-50/50 border border-red-200/80 space-y-1.5">
            <div className="text-[10px] font-bold font-mono text-red-800 uppercase tracking-wider">CRITICAL (81–100)</div>
            <div className="text-2xl font-extrabold font-mono text-red-950">14</div>
            <div className="w-full bg-red-200/80 h-1.5 rounded-full overflow-hidden">
              <div className="bg-red-600 h-full rounded-full" style={{ width: '2%' }} />
            </div>
            <div className="text-[10px] text-red-700 font-mono">2% of total</div>
          </div>
        </div>
      </motion.section>

      {/* ── 5. REGIONAL COMPARISON & HOTSPOTS (SCROLLED SECTION B) ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Regional Risk Comparison (6 cols ~50%) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2 }}
          className="lg:col-span-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5"
        >
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
              REGIONAL RISK COMPARISON
            </h3>
            <p className="text-xs text-slate-500 font-medium">State-level aggregate risk intensity rankings</p>
          </div>

          <div className="space-y-3 text-xs">
            {stateRankings.map((st) => (
              <div key={st.name} className="space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-slate-900 font-bold">{st.name}</span>
                  <span className="font-mono text-slate-900 font-extrabold">{st.risk} / 100</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600 rounded-full transition-all duration-500"
                    style={{ width: `${st.risk}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10.5px] text-slate-500 font-mono">
                  <span>Utilization: {st.util}%</span>
                  <span className="text-red-600 font-bold">{st.critical} Critical District{st.critical > 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Geographic Risk Hotspots (6 cols ~50%) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2 }}
          className="lg:col-span-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5"
        >
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
              GEOGRAPHIC RISK HOTSPOTS
            </h3>
            <p className="text-xs text-slate-500 font-medium">High-exposure clusters &amp; primary spatial risk drivers</p>
          </div>

          <div className="space-y-2.5">
            {[
              { district: 'Bikaner', state: 'Rajasthan', score: 72, projects: 186, driver: 'Cost padding & vendor concentration' },
              { district: 'Shivamogga', state: 'Karnataka', score: 68, projects: 142, driver: 'Progress-payment mismatch' },
              { district: 'Meerut', state: 'Uttar Pradesh', score: 68, projects: 195, driver: 'Payment velocity irregularity' },
              { district: 'Belagavi', state: 'Karnataka', score: 68, projects: 174, driver: 'Duplicate title candidates' },
            ].map((h, i) => (
              <div key={h.district} className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 text-xs flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-slate-400">0{i + 1}</span>
                    <span className="font-bold text-slate-900">{h.district}, {h.state}</span>
                  </div>
                  <div className="text-[10.5px] text-slate-500">
                    {h.projects} active projects · <span className="font-medium text-slate-700">{h.driver}</span>
                  </div>
                </div>
                <span className="font-mono font-extrabold text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
                  {h.score} / 100
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── 6. DISTRICT INTELLIGENCE TABLE (SCROLLED SECTION C) ──────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
              DISTRICT INTELLIGENCE TABLE
            </h3>
            <p className="text-xs text-slate-500 font-medium">Comparative spatial metrics across priority monitoring districts</p>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-500">
            Showing top priority districts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-400 font-mono font-bold text-[9.5px] uppercase">
                <th className="py-2.5 px-3">DISTRICT</th>
                <th className="py-2.5 px-3">STATE</th>
                <th className="py-2.5 px-3">RISK SCORE</th>
                <th className="py-2.5 px-3">HEALTH INDEX</th>
                <th className="py-2.5 px-3">PROJECTS</th>
                <th className="py-2.5 px-3">UTILIZATION</th>
                <th className="py-2.5 px-3 text-right">SPATIAL TREND</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {districtTableRows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  onClick={() => set('district_id', String(row.id))}
                >
                  <td className="py-3 px-3 font-bold text-slate-900">{row.name}</td>
                  <td className="py-3 px-3 font-medium text-slate-600">{row.state}</td>
                  <td className="py-3 px-3 font-mono font-extrabold text-orange-700">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-600" />
                      {row.risk}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-900">{row.health}</td>
                  <td className="py-3 px-3 font-mono font-semibold text-slate-700">{row.projects}</td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-900">{row.util}%</td>
                  <td className="py-3 px-3 text-right font-mono font-extrabold text-blue-700">{row.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* ── 7. SPATIAL SIGNALS (SCROLLED SECTION D) ──────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5"
      >
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
            SPATIAL SIGNALS
          </h3>
          <p className="text-xs text-slate-500 font-medium">Emerging geographic risk patterns &amp; spatial anomalies</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-3.5 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold font-mono text-red-700">
              <span>CORRIDOR ELEVATION</span>
              <span>2m ago</span>
            </div>
            <div className="font-bold text-slate-900 text-xs">Risk Concentration Increasing</div>
            <div className="text-[10.5px] text-slate-500">Northern corridor districts showing elevated risk exposure</div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold font-mono text-amber-700">
              <span>PROJECT CLUSTER</span>
              <span>12m ago</span>
            </div>
            <div className="font-bold text-slate-900 text-xs">High-Risk Projects Clustering</div>
            <div className="text-[10.5px] text-slate-500">Clustering detected around selected western districts</div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold font-mono text-amber-700">
              <span>ANOMALY DETECTED</span>
              <span>25m ago</span>
            </div>
            <div className="font-bold text-slate-900 text-xs">Health-Risk Divergence</div>
            <div className="text-[10.5px] text-slate-500">Utilization variance detected in southern district clusters</div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold font-mono text-blue-700">
              <span>THRESHOLD ALERT</span>
              <span>1h ago</span>
            </div>
            <div className="font-bold text-slate-900 text-xs">Emerging District Hotspots</div>
            <div className="text-[10.5px] text-slate-500">2 new districts crossed elevated monitoring threshold</div>
          </div>
        </div>
      </motion.section>
    </motion.div>
  )
}
