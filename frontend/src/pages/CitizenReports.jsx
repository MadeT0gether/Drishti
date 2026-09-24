import { useState, useCallback } from 'react'
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { citizenReportsApi, dashboardApi } from '../services/api'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Modal,
  SearchInput,
  Select,
  Skeleton,
} from '../components/ui'
import { formatDateTime, formatNumber, titleCase } from '../utils/format'

const pinIcon = L.divIcon({
  className: 'custom-map-pin',
  html: `<div style="background-color: #dc2626; width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'verification_required', label: 'Verification Required' },
  { value: 'resolved', label: 'Resolved / Closed' },
  { value: 'dismissed', label: 'Dismissed' },
]

const STATUS_BADGES = {
  submitted: { label: 'Submitted', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  under_review: { label: 'Under Review', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  verification_required: { label: 'Verification Required', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  dismissed: { label: 'Dismissed', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
}

export default function CitizenReports() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(
    ['status', 'issue_type', 'state_id', 'district_id', 'search', 'page']
      .map((k) => [k, params.get(k)]).filter(([, v]) => v)
  )
  const page = Number(filters.page ?? 1)

  const [selectedReport, setSelectedReport] = useState(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [editRemarks, setEditRemarks] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (!value) next.delete(key)
    else next.set(key, value)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const reports = useQuery({
    queryKey: ['citizen-reports', filters],
    queryFn: () => citizenReportsApi.list({ page_size: 25, ...filters }),
    placeholderData: keepPreviousData,
  })

  const states = useQuery({ queryKey: ['states'], queryFn: dashboardApi.states, staleTime: 300_000 })
  const districts = useQuery({
    queryKey: ['districts', filters.state_id],
    queryFn: () => dashboardApi.districts(filters.state_id ? { state_id: filters.state_id } : {}),
    staleTime: 300_000,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => citizenReportsApi.update(id, data),
    onSuccess: (updated) => {
      setSelectedReport(updated)
      qc.invalidateQueries({ queryKey: ['citizen-reports'] })
      setIsUpdating(false)
    },
    onError: (err) => {
      alert(err.response?.data?.detail || 'Failed to update report')
      setIsUpdating(false)
    },
  })

  const handleOpenDetail = (report) => {
    setSelectedReport(report)
    setEditStatus(report.status)
    setEditRemarks(report.resolution_remarks || '')
    setDetailModalOpen(true)
  }

  const handleSaveUpdate = () => {
    if (!selectedReport) return
    setIsUpdating(true)
    updateMutation.mutate({
      id: selectedReport.id,
      data: {
        status: editStatus,
        resolution_remarks: editRemarks,
      },
    })
  }

  const d = reports.data
  const items = d?.items || []

  // Metric strip calculations
  const totalReports = d?.total ?? 0
  const underReviewCount = items.filter((r) => r.status === 'under_review').length
  const verificationReqCount = items.filter((r) => r.status === 'verification_required').length
  const resolvedCount = items.filter((r) => r.status === 'resolved').length

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
              CITIZEN REPORTS &amp; GROUND OVERSIGHT
            </h1>
            <span className="rounded border border-blue-200/80 bg-blue-50 text-blue-800 px-2 py-0.5 text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatNumber(totalReports)} Submitted
            </span>
            <span className="rounded bg-slate-100 text-slate-700 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
              CLASSIFIED EVIDENCE
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            Citizen-submitted observations, geo-tagged photos, and ground discrepancy reports. Citizen findings are review-only and do not alter official project records automatically.
          </p>
        </div>
      </div>

      {/* ── 2. METRIC SUMMARY TILES ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">TOTAL REPORTS</span>
          <div className="text-2xl font-black font-mono text-slate-900">{formatNumber(totalReports)}</div>
          <div className="text-[10.5px] text-slate-500">Citizen observations logged</div>
        </div>

        <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/40 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 font-mono">UNDER REVIEW</span>
          <div className="text-2xl font-black font-mono text-amber-950">{underReviewCount}</div>
          <div className="text-[10.5px] text-amber-700">Evaluating against records</div>
        </div>

        <div className="p-4 rounded-xl border border-orange-200/80 bg-orange-50/40 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800 font-mono">VERIFICATION REQUIRED</span>
          <div className="text-2xl font-black font-mono text-orange-950">{verificationReqCount}</div>
          <div className="text-[10.5px] text-orange-700">Needs ground field inspection</div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 font-mono">RESOLVED / CLOSED</span>
          <div className="text-2xl font-black font-mono text-emerald-950">{resolvedCount}</div>
          <div className="text-[10.5px] text-emerald-700">Review completed on record</div>
        </div>
      </div>

      {/* ── 3. FILTER BAR ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="w-64">
            <SearchInput
              value={filters.search ?? ''}
              onChange={(v) => set('search', v)}
              placeholder="Search reference ID, village, observation..."
            />
          </div>

          <Select
            value={filters.status ?? ''}
            onChange={(v) => set('status', v)}
            options={[{ value: '', label: 'All Statuses' }, ...STATUS_OPTIONS]}
            aria-label="Filter by review status"
          />

          <Select
            value={filters.state_id ?? ''}
            onChange={(v) => { set('state_id', v); set('district_id', '') }}
            options={[
              { value: '', label: 'All States' },
              ...(states.data?.map((s) => ({ value: String(s.id), label: s.name })) ?? []),
            ]}
            aria-label="Filter by state"
          />

          <Select
            value={filters.district_id ?? ''}
            onChange={(v) => set('district_id', v)}
            options={[
              { value: '', label: 'All Districts' },
              ...(districts.data?.map((d) => ({ value: String(d.id), label: d.name })) ?? []),
            ]}
            aria-label="Filter by district"
          />
        </div>

        {Object.keys(filters).length > 0 && (
          <button
            onClick={() => setParams({})}
            className="text-xs font-mono text-blue-700 hover:underline px-2"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ── 4. REPORTS DATA TABLE ─────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 font-mono text-[10.5px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4 font-bold">Report Ref / Date</th>
                <th className="py-3 px-4 font-bold">Project / Location</th>
                <th className="py-3 px-4 font-bold">Issue Category</th>
                <th className="py-3 px-4 font-bold">Evidence</th>
                <th className="py-3 px-4 font-bold">Reporter Role</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {reports.isPending ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-mono">Loading citizen reports...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-mono">No citizen reports found matching criteria.</td>
                </tr>
              ) : (
                items.map((r) => {
                  const badge = STATUS_BADGES[r.status] || STATUS_BADGES.submitted
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{r.reference_id}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-bold text-slate-900 truncate">{r.project_title || r.custom_project_name || 'General Locality'}</div>
                        <div className="text-[10.5px] text-slate-500 font-sans truncate">
                          {r.village_locality ? `${r.village_locality}, ` : ''}{r.district_name || 'District Scope'}
                        </div>
                      </td>

                      <td className="py-3 px-4 capitalize font-sans text-slate-700">
                        {r.issue_type.replace(/_/g, ' ')}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          {r.photos && r.photos.length > 0 ? (
                            <span className="rounded bg-blue-50 border border-blue-200 text-blue-800 px-1.5 py-0.5 font-bold">
                              📷 {r.photos.length} Photo{r.photos.length > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                          {r.latitude && r.longitude && (
                            <span className="rounded bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 font-bold">
                              📍 Geo-Tagged
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 capitalize text-slate-600 font-mono text-[11px]">
                        {r.reporter_relationship || 'Citizen'}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenDetail(r)}
                          className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1 text-xs font-bold text-blue-700 shadow-2xs transition-colors"
                        >
                          Review →
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. REPORT DETAIL & REVIEW MODAL ───────────────────────── */}
      {detailModalOpen && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-6 max-h-[85vh] flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-bold font-mono">
                    {selectedReport.reference_id}
                  </span>
                  <span className="rounded border border-amber-200 bg-amber-50 text-amber-800 px-2 py-0.5 text-[10px] font-bold font-mono uppercase">
                    CITIZEN GROUND OBSERVATION
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  {selectedReport.project_title || selectedReport.custom_project_name || 'Ground Issue Report'}
                </h3>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* Official Separation Notice Banner */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-start gap-2.5">
                <span className="text-amber-700 text-base">⚠️</span>
                <div className="text-[11.5px] text-amber-900 leading-relaxed">
                  <strong>CITIZEN REPORT NOTICE:</strong> This record reflects an observation reported by a citizen. It is segregated from official audit trails and physical progress records until verified by an authorized officer.
                </div>
              </div>

              {/* Observation & Location Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase font-mono text-slate-400 block">ISSUE &amp; LOCATION</span>
                  <div><strong>Issue Category:</strong> <span className="capitalize">{selectedReport.issue_type.replace(/_/g, ' ')}</span></div>
                  <div><strong>Location:</strong> {selectedReport.village_locality ? `${selectedReport.village_locality}, ` : ''}{selectedReport.district_name}, {selectedReport.state_name}</div>
                  <div><strong>Observed Date/Time:</strong> <span className="font-mono">{selectedReport.observation_datetime ? new Date(selectedReport.observation_datetime).toLocaleString('en-IN') : '—'}</span></div>
                  <div><strong>Submission Date:</strong> <span className="font-mono">{selectedReport.created_at ? new Date(selectedReport.created_at).toLocaleString('en-IN') : '—'}</span></div>
                </div>

                {/* Restricted Reporter Details Panel */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase font-mono text-blue-800">REPORTER DETAILS (RESTRICTED)</span>
                    <span className="rounded bg-blue-100 text-blue-800 text-[9px] font-bold font-mono px-1.5 py-0.5">OFFICIAL USE ONLY</span>
                  </div>
                  <div><strong>Name:</strong> {selectedReport.reporter_name || 'Anonymous / Unspecified'}</div>
                  <div><strong>Mobile:</strong> <span className="font-mono">{selectedReport.reporter_mobile || '—'}</span></div>
                  <div><strong>Email:</strong> <span className="font-mono">{selectedReport.reporter_email || '—'}</span></div>
                  <div><strong>Relationship:</strong> <span className="capitalize">{selectedReport.reporter_relationship || 'Citizen'}</span></div>
                </div>
              </div>

              {/* Citizen Observation Narrative */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase font-mono text-slate-400 block">CITIZEN OBSERVATION DESCRIPTION</span>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-slate-900 leading-relaxed font-sans text-xs">
                  {selectedReport.description}
                </div>
              </div>

              {/* Uploaded Photos & Map Pin */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Photo Evidence */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase font-mono text-slate-400 block">PHOTO EVIDENCE</span>
                  {selectedReport.photos && selectedReport.photos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedReport.photos.map((p, idx) => (
                        <div key={idx} className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 p-1">
                          <img
                            src={(import.meta.env.VITE_API_URL || 'http://localhost:8000') + p.url}
                            alt="Evidence"
                            className="h-28 w-full object-cover rounded"
                          />
                          <div className="mt-1 text-[9.5px] font-mono text-slate-500 truncate">{p.original_filename}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 font-mono text-center">
                      No photos uploaded
                    </div>
                  )}
                </div>

                {/* Map Coordinates */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase font-mono text-slate-400 block">GEO-TAG LOCATION</span>
                  {selectedReport.latitude && selectedReport.longitude ? (
                    <div className="h-36 w-full rounded-xl border border-slate-200 overflow-hidden">
                      <MapContainer
                        center={[selectedReport.latitude, selectedReport.longitude]}
                        zoom={13}
                        scrollWheelZoom={false}
                        className="h-full w-full"
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[selectedReport.latitude, selectedReport.longitude]} icon={pinIcon} />
                      </MapContainer>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 font-mono text-center">
                      No GPS coordinates supplied
                    </div>
                  )}
                </div>
              </div>

              {/* Status Update & Resolution Form */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <span className="text-[10px] font-bold uppercase font-mono text-slate-500 block">OFFICIAL REVIEW DECISION &amp; RESOLUTION</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Review Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Resolution Remarks / Findings</label>
                  <textarea
                    rows={3}
                    placeholder="Enter official resolution notes, inspection observations, or explanation of findings..."
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3.5 bg-slate-50 shrink-0">
              <button
                onClick={() => setDetailModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>

              <button
                disabled={isUpdating}
                onClick={handleSaveUpdate}
                className="rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 text-xs font-bold transition-all shadow-sm disabled:opacity-50"
              >
                {isUpdating ? 'Saving Update...' : 'Save Review Decision'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
