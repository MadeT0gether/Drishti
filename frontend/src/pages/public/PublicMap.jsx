import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { dashboardApi } from '../../services/api'
import { formatINR, formatNumber } from '../../utils/format'
import PublicActivityMap, { ActivityLegend } from '../../components/maps/PublicActivityMap'

export default function PublicMap() {
  const [params, setParams] = useSearchParams()
  const stateId = params.get('state_id')
  const districtId = params.get('district_id')
  const [recenterKey, setRecenterKey] = useState(0)

  const setMany = (next) => {
    const sp = new URLSearchParams()
    Object.entries(next).forEach(([k, v]) => { if (v) sp.set(k, v) })
    setParams(sp, { replace: true })
  }

  const states = useQuery({ queryKey: ['states'], queryFn: dashboardApi.states, staleTime: 300_000 })
  const districts = useQuery({
    queryKey: ['districts', stateId],
    queryFn: () => dashboardApi.districts(stateId ? { state_id: stateId } : {}),
    staleTime: 300_000,
  })
  const boundaries = useQuery({
    queryKey: ['map-boundaries'],
    queryFn: () => dashboardApi.mapBoundaries(),
    staleTime: Infinity,
  })

  const sortedDistricts = [...(districts.data ?? [])].sort((a, b) => b.project_count - a.project_count)
  const alphaDistricts = [...(districts.data ?? [])].sort((a, b) => a.district.localeCompare(b.district))
  const selectedDistrict = districtId
    ? sortedDistricts.find((d) => String(d.district_id) === String(districtId))
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* ── 1. HEADER & CONTROL TOOLBAR ────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Explore Programme Activity by Geography</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Drill down from the national view to a state, then a district, to see public works activity there.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={stateId ?? ''}
            onChange={(e) => setMany({ state_id: e.target.value })}
            aria-label="Filter by state"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-2xs"
          >
            <option value="">All States &amp; UTs</option>
            {(states.data ?? []).map((s) => (
              <option key={s.state_id} value={s.state_id}>{s.state}</option>
            ))}
          </select>

          <select
            value={districtId ?? ''}
            onChange={(e) => setMany({ state_id: stateId, district_id: e.target.value })}
            aria-label="Filter by district"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-2xs"
          >
            <option value="">All Districts</option>
            {alphaDistricts.map((d) => (
              <option key={d.district_id} value={d.district_id}>{d.district}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── 2. PUBLIC MAP & REGIONAL PANEL ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 cols: District activity heatmap on real boundaries */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 font-mono text-xs">
            <span className="font-bold text-slate-900">INDIA PUBLIC WORKS MAP</span>
            <span className="text-slate-500">
              STATES COVERED: <strong className="text-slate-900">{states.data ? formatNumber(states.data.length) : '—'}</strong>
            </span>
          </div>

          {boundaries.isPending || districts.isPending ? (
            <div className="h-[460px] w-full rounded-xl bg-slate-100 animate-pulse flex items-center justify-center text-xs font-mono text-slate-400">
              Loading district boundaries…
            </div>
          ) : boundaries.isError ? (
            <div className="h-[460px] w-full rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs font-mono text-slate-500">
              Map boundaries are unavailable right now.
            </div>
          ) : (
            <div className="relative">
              <PublicActivityMap
                districts={districts.data}
                boundaries={boundaries.data}
                stateId={stateId}
                selectedDistrictId={districtId}
                recenterKey={recenterKey}
                onDistrictClick={(d) => setMany({
                  state_id: stateId,
                  district_id: String(d.district_id) === String(districtId) ? '' : String(d.district_id),
                })}
                height={460}
              />
              {/* Pin: snap the view back to the current selection after panning */}
              <button
                onClick={() => setRecenterKey((k) => k + 1)}
                title={districtId ? 'Recenter on the selected district'
                  : stateId ? 'Recenter on the selected state' : 'Recenter on India'}
                aria-label="Recenter map on current selection"
                className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 hover:bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-md transition-colors"
              >
                <svg className="h-3.5 w-3.5 text-blue-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Recenter</span>
              </button>
            </div>
          )}

          <ActivityLegend />
          <p className="text-[10px] text-slate-400 font-mono">
            Census-2011 district boundaries (DataMeet, CC BY 4.0). Districts without published
            records in the current selection are shown unshaded. Prototype dataset — synthetic data.
          </p>
        </div>

        {/* Right 4 cols: District drill-down */}
        <div className="lg:col-span-4 space-y-4">
          {selectedDistrict && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-black text-slate-900">{selectedDistrict.district}</div>
                  <div className="text-[10.5px] text-slate-500 font-mono">{selectedDistrict.state}</div>
                </div>
                <button
                  onClick={() => setMany({ state_id: stateId })}
                  className="text-[10px] font-mono font-bold text-slate-500 hover:text-slate-900"
                  aria-label="Clear district selection"
                >
                  ✕ CLEAR
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Projects</div>
                  <div className="text-base font-black text-slate-900">{formatNumber(selectedDistrict.project_count)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Sanctioned</div>
                  <div className="text-base font-black text-slate-900">{formatINR(selectedDistrict.sanctioned)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Utilization</div>
                  <div className="text-base font-black text-blue-700">
                    {selectedDistrict.utilization_pct != null ? `${selectedDistrict.utilization_pct}%` : '—'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Completion</div>
                  <div className="text-base font-black text-emerald-700">
                    {selectedDistrict.completion_rate_pct != null ? `${selectedDistrict.completion_rate_pct}%` : '—'}
                  </div>
                </div>
              </div>

              <Link to={`/public/projects?state_id=${selectedDistrict.state_id}&district_id=${selectedDistrict.district_id}`}>
                <button className="w-full rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 text-xs font-bold transition-all">
                  View projects in {selectedDistrict.district} →
                </button>
              </Link>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                {stateId ? 'Districts in Selected State' : 'Districts by Activity'}
              </h2>
              <span className="text-[10px] font-mono text-slate-400">Select to inspect</span>
            </div>
            <div className="space-y-2 font-sans text-xs max-h-96 overflow-y-auto pr-1">
              {sortedDistricts.map((dist) => {
                const selected = String(dist.district_id) === String(districtId)
                return (
                  <button
                    key={dist.district_id}
                    onClick={() => setMany({ state_id: stateId, district_id: selected ? '' : String(dist.district_id) })}
                    className={`w-full text-left p-3 rounded-lg border flex items-center justify-between transition-colors ${
                      selected
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-slate-50 border-slate-200/80 hover:border-blue-300 hover:bg-blue-50/40'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">{dist.district}</div>
                      <div className="text-[10.5px] text-slate-500 font-mono">{dist.state}</div>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <div className="font-bold text-blue-700">{formatNumber(dist.project_count)} works</div>
                      <div className="text-slate-500 font-bold">
                        {dist.utilization_pct != null ? `${dist.utilization_pct}% utilized` : '—'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
