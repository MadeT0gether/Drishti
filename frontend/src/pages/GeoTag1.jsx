/**
 * GeoTag-1 — Image Evidence Verification
 *
 * Allows authorized officers to upload project site images, validate them,
 * extract EXIF/GPS metadata, link projects via ID or Name, enter human
 * officer review/observations, track review status (Pending Review / Reviewed),
 * and download standardised PDF evidence records.
 *
 * Responsible-AI: Geo-location data, verification signals, and human observations
 * are decision-support only. They do not constitute findings of fraud, misconduct,
 * or legal liability. Final decisions remain with authorized officials.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { useAuth } from '../hooks/useAuth'
import { geotagApi } from '../services/api'
import { Card, CardHeader, Modal, Skeleton } from '../components/ui'

// ─── Status metadata ──────────────────────────────────────────────────────────
const VERIFICATION_META = {
  uploaded:       { label: 'Uploaded',            cls: 'bg-slate-50 text-slate-700 border-slate-200' },
  processing:     { label: 'Processing',           cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  geo_available:  { label: 'Geo-data Available',   cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  geo_missing:    { label: 'Geo-data Not Found',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified:       { label: 'Verified',             cls: 'bg-green-50 text-green-800 border-green-200' },
  requires_review:{ label: 'Requires Review',      cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  failed:         { label: 'Processing Failed',    cls: 'bg-red-50 text-red-700 border-red-200' },
}

function VerificationBadge({ status }) {
  const meta = VERIFICATION_META[status] ?? VERIFICATION_META.uploaded
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${meta.cls}`}
          style={{ fontFamily: 'var(--font-mono)' }}>
      {meta.label}
    </span>
  )
}

function ReviewStatusBadge({ status }) {
  const isReviewed = status === 'reviewed'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${
      isReviewed
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : 'bg-amber-50 text-amber-800 border-amber-200'
    }`} style={{ fontFamily: 'var(--font-mono)' }}>
      <span className={`h-1.5 w-1.5 rounded-full ${isReviewed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {isReviewed ? 'Reviewed' : 'Pending Review'}
    </span>
  )
}

// ─── Processing Timeline ───────────────────────────────────────────────────────
const TIMELINE_STEPS = [
  { key: 'uploaded',     label: 'Uploaded' },
  { key: 'validated',    label: 'File Validated' },
  { key: 'meta',         label: 'Metadata Checked' },
  { key: 'geo',          label: 'Geo-data Extracted' },
  { key: 'pdf',          label: 'PDF Generated' },
  { key: 'status',       label: 'Verification Signal' },
]

function statusToStep(status) {
  if (!status || status === 'uploaded') return 0
  if (status === 'processing') return 2
  if (status === 'geo_available' || status === 'geo_missing') return 4
  if (status === 'verified' || status === 'requires_review') return 5
  if (status === 'failed') return 3
  return 0
}

function ProcessingTimeline({ evidence }) {
  const currentStep = statusToStep(evidence?.processing_status)
  const failed = evidence?.processing_status === 'failed'

  return (
    <div className="relative">
      <div className="flex flex-col gap-0">
        {TIMELINE_STEPS.map((step, i) => {
          const done = i < currentStep
          const active = i === currentStep
          const isFailed = failed && i === currentStep
          return (
            <div key={step.key} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                  isFailed
                    ? 'border-red-400 bg-red-50 text-red-600'
                    : done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : active
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-slate-200 bg-white text-slate-400'
                }`}>
                  {isFailed ? '✕' : done ? '✓' : i + 1}
                </div>
                {i < TIMELINE_STEPS.length - 1 && (
                  <div className={`w-px flex-1 mt-0.5 mb-0.5 min-h-[16px] ${done ? 'bg-emerald-300' : 'bg-slate-100'}`} />
                )}
              </div>
              <div className="pb-3 min-w-0">
                <div className={`text-[12px] font-semibold leading-tight ${
                  isFailed ? 'text-red-600' : done ? 'text-emerald-700' : active ? 'text-slate-900' : 'text-slate-400'
                }`}>
                  {step.label}
                </div>
                {step.key === 'geo' && (done || active) && !isFailed && (
                  <div className="mt-0.5 text-[10.5px] text-slate-500">
                    {evidence?.geo_available
                      ? '✓ Geo-location available'
                      : 'Geo-location data not available'}
                  </div>
                )}
                {step.key === 'pdf' && done && (
                  <div className="mt-0.5 text-[10.5px] text-slate-500">
                    PDF evidence record generated
                  </div>
                )}
                {isFailed && evidence?.error_message && (
                  <div className="mt-0.5 text-[10.5px] text-red-500 max-w-xs">{evidence.error_message}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── GPS / Geo Info ────────────────────────────────────────────────────────────
function GeoInfoBlock({ metadata }) {
  if (!metadata) return null
  return (
    <div className={`rounded-lg border p-3 ${metadata.geo_available
      ? 'border-emerald-200 bg-emerald-50/60'
      : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex items-center gap-2 mb-2">
        <svg className={`h-4 w-4 shrink-0 ${metadata.geo_available ? 'text-emerald-600' : 'text-amber-600'}`}
             viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className={`text-[12px] font-bold ${metadata.geo_available ? 'text-emerald-700' : 'text-amber-700'}`}>
          {metadata.geo_status_message}
        </span>
      </div>
      {metadata.geo_available ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-white border border-emerald-100 p-2">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>LATITUDE</div>
            <div className="text-[12px] font-mono font-semibold text-slate-900 mt-0.5">{metadata.latitude?.toFixed(7)}°</div>
          </div>
          <div className="rounded bg-white border border-emerald-100 p-2">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>LONGITUDE</div>
            <div className="text-[12px] font-mono font-semibold text-slate-900 mt-0.5">{metadata.longitude?.toFixed(7)}°</div>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-amber-700">
          The uploaded image does not contain embedded GPS/EXIF geo-location data.
          Geo-location data is never fabricated.
        </p>
      )}
    </div>
  )
}

// ─── Project Selector (ID or Name search) ──────────────────────────────────────
function ProjectSelector({ selectedProject, onSelectProject }) {
  const [searchMode, setSearchMode] = useState('name') // 'id' | 'name'
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Search query hook
  const { data: results = [], isLoading } = useQuery({
    queryKey: ['geotag-project-search', query],
    queryFn: () => geotagApi.searchProjects(query),
    enabled: query.trim().length >= 1,
    staleTime: 30_000,
  })

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
               style={{ fontFamily: 'var(--font-mono)' }}>
          Associate Project (Optional)
        </label>
        {/* Toggle mode */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => { setSearchMode('name'); setQuery(''); setIsOpen(false) }}
            className={`rounded-md px-2.5 py-1 transition-all ${
              searchMode === 'name' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Search by Project Name
          </button>
          <button
            type="button"
            onClick={() => { setSearchMode('id'); setQuery(''); setIsOpen(false) }}
            className={`rounded-md px-2.5 py-1 transition-all ${
              searchMode === 'id' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Search by Project ID
          </button>
        </div>
      </div>

      {selectedProject ? (
        /* Selected Project Card */
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/70 p-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-mono text-[11px] font-bold">
              #{selectedProject.id}
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold text-slate-900 truncate" title={selectedProject.title}>
                {selectedProject.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                <span className="font-mono text-blue-700 font-semibold">{selectedProject.code}</span>
                <span>·</span>
                <span>District: <strong className="text-slate-700">{selectedProject.district_name}</strong></span>
                <span>·</span>
                <span>State: <strong className="text-slate-700">{selectedProject.state_name}</strong></span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectProject(null)}
            className="ml-3 shrink-0 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
          >
            Change / Remove
          </button>
        </div>
      ) : (
        /* Search Input & Dropdown */
        <div ref={dropdownRef} className="relative">
          <div className="relative">
            <input
              type={searchMode === 'id' ? 'text' : 'text'}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIsOpen(true) }}
              onFocus={() => setIsOpen(true)}
              placeholder={
                searchMode === 'id'
                  ? 'Enter numeric Project ID or code (e.g. 101 or MPL-2025)…'
                  : 'Type Project Name to search (e.g. Road Construction, Community Hall)…'
              }
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 py-2.5 text-[12.5px] font-medium text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
            />
            <svg className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
            </svg>
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setIsOpen(false) }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && query.trim().length >= 1 && (
            <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
              {isLoading ? (
                <div className="p-3 text-[12px] text-slate-400 flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12"/>
                  </svg>
                  Searching database projects…
                </div>
              ) : results.length === 0 ? (
                <div className="p-3.5 text-center text-[12px] text-slate-500">
                  No matching projects found for "{query}".
                </div>
              ) : (
                results.map((proj) => (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => {
                      onSelectProject(proj)
                      setIsOpen(false)
                      setQuery('')
                    }}
                    className="w-full p-3 text-left hover:bg-blue-50/70 transition-colors flex items-start justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-bold text-slate-900 group-hover:text-blue-700 truncate">
                        {proj.title}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span className="font-mono font-semibold text-slate-600">{proj.code}</span>
                        <span>·</span>
                        <span>{proj.district_name}</span>
                        <span>·</span>
                        <span>{proj.state_name}</span>
                      </div>
                    </div>
                    <div className="shrink-0 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                      ID #{proj.id}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          <p className="mt-1 text-[10.5px] text-slate-400">
            {selectedProject
              ? 'Linked project will be recorded with the evidence.'
              : 'Search by ID or Name above. Leave unselected to record as "Project not linked".'}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Evidence Detail Modal ────────────────────────────────────────────────────
function EvidenceDetailModal({ evidence, onClose, onRefresh }) {
  const queryClient = useQueryClient()
  const { data: metadata, isLoading: metaLoading } = useQuery({
    queryKey: ['geotag-metadata', evidence.id],
    queryFn: () => geotagApi.metadata(evidence.id),
    staleTime: 60_000,
  })

  // Review editing state inside modal
  const [reviewText, setReviewText] = useState(evidence.officer_review || '')
  const [isEditingReview, setIsEditingReview] = useState(false)

  useEffect(() => {
    setReviewText(evidence.officer_review || '')
  }, [evidence])

  // Review update mutation
  const updateReviewMutation = useMutation({
    mutationFn: (payload) => geotagApi.updateReview(evidence.id, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['geotag-list'] })
      queryClient.invalidateQueries({ queryKey: ['geotag-metadata', evidence.id] })
      if (onRefresh) onRefresh(updated)
      setIsEditingReview(false)
    },
    onError: (err) => {
      alert(err?.response?.data?.detail || 'Failed to update review status.')
    },
  })

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) : 'Not available'

  const pdfUrl = geotagApi.pdfDownloadUrl(evidence.id)

  const handleDownloadPdf = () => {
    const token = sessionStorage.getItem('mplads_token')
    fetch(pdfUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('PDF not available')
        return r.blob()
      })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `GeoTag_Evidence_${evidence.id}.pdf`
        document.body.appendChild(a)
        a.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(a)
      })
      .catch(() => alert('PDF evidence record not available for this entry.'))
  }

  const toggleReviewStatus = () => {
    const nextStatus = evidence.review_status === 'reviewed' ? 'pending_review' : 'reviewed'
    updateReviewMutation.mutate({ review_status: nextStatus })
  }

  const saveOfficerReview = () => {
    updateReviewMutation.mutate({ officer_review: reviewText })
  }

  const exifEntries = metadata?.exif_data
    ? Object.entries(metadata.exif_data).filter(([k]) => k !== 'GPS').slice(0, 20)
    : []

  return (
    <Modal label="GeoTag Evidence Package Details" onClose={onClose} maxWidth="max-w-[700px]" raw={true}>
      {/* ── STICKY HEADER ── */}
      <div className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5 bg-white z-10">
        <div className="min-w-0 flex-1 pr-2">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug break-words" title={evidence.original_filename}>
            {evidence.original_filename}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-[11.5px] text-slate-500 font-medium">
              Record ID <strong className="font-mono text-slate-700">#{evidence.id}</strong>
            </span>
            <span className="text-slate-300">·</span>
            <ReviewStatusBadge status={evidence.review_status} />
            <VerificationBadge status={evidence.processing_status} />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── SCROLLABLE INTERNAL CONTENT BODY ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 overflow-x-hidden">
        {/* Responsible-AI Notice */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 flex items-start gap-2.5">
          <svg className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
          </svg>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-800">Human-in-the-loop Decision Support:</span>{' '}
            Verification signals and metadata extracted by GeoTag-1 are intended for official review only.
            They do not constitute a legal finding of fraud, misconduct, or fake evidence. Final determination belongs to authorized officials.
          </p>
        </div>

        {/* Grid: Core Attributes & Associated Project */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Column 1: Core Attributes & Associated Project */}
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                EVIDENCE METADATA & ASSOCIATIONS
              </div>
              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 text-[12px]">
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-slate-500 font-medium">Format / Type</span>
                  <span className="font-mono font-bold text-slate-800 uppercase">{evidence.mime_type?.split('/')[1] ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-slate-500 font-medium">File Size</span>
                  <span className="font-mono font-bold text-slate-800">
                    {evidence.file_size_bytes ? `${(evidence.file_size_bytes / 1024).toFixed(1)} KB` : '—'}
                  </span>
                </div>
                <div className="flex items-start justify-between p-2.5 gap-2">
                  <span className="text-slate-500 font-medium shrink-0">Project Association</span>
                  <span className="font-semibold text-right break-words max-w-[200px]">
                    {evidence.project_id ? (
                      <span className="text-blue-700 font-bold">
                        {evidence.project_name ? `${evidence.project_name} (#${evidence.project_id})` : `Project #${evidence.project_id}`}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Project not linked</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-slate-500 font-medium">Uploaded By</span>
                  <span className="font-bold text-slate-800">Officer #{evidence.uploaded_by_id}</span>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-slate-500 font-medium">Upload Date/Time</span>
                  <span className="font-mono text-slate-700">{fmt(evidence.created_at)}</span>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-slate-500 font-medium">Review Status</span>
                  <span className="font-bold">
                    {evidence.review_status === 'reviewed' ? (
                      <span className="text-emerald-700">Reviewed {evidence.reviewed_at ? `on ${fmt(evidence.reviewed_at)}` : ''}</span>
                    ) : (
                      <span className="text-amber-700">Pending Review</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Toggle Review Action */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-bold text-slate-800">Review Mark</div>
                <div className="text-[11px] text-slate-500">
                  {evidence.review_status === 'reviewed'
                    ? 'Currently marked as Reviewed.'
                    : 'Mark evidence as officially reviewed.'}
                </div>
              </div>
              <button
                type="button"
                disabled={updateReviewMutation.isPending}
                onClick={toggleReviewStatus}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition-all shadow-sm ${
                  evidence.review_status === 'reviewed'
                    ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    : 'border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {updateReviewMutation.isPending
                  ? 'Updating…'
                  : evidence.review_status === 'reviewed'
                  ? 'Mark as Pending'
                  : '✓ Mark as Reviewed'}
              </button>
            </div>
          </div>

          {/* Column 2: Officer Review / Observations */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>
                  OFFICER REVIEW / OBSERVATION
                </div>
                {!isEditingReview && (
                  <button
                    type="button"
                    onClick={() => setIsEditingReview(true)}
                    className="text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    {evidence.officer_review ? 'Edit Observation' : '+ Add Observation'}
                  </button>
                )}
              </div>

              {isEditingReview ? (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Enter officer notes or observations about this site evidence..."
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-[12px] text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-mono">{reviewText.length}/2000 chars</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setIsEditingReview(false); setReviewText(evidence.officer_review || '') }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={updateReviewMutation.isPending}
                        onClick={saveOfficerReview}
                        className="rounded-lg bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        {updateReviewMutation.isPending ? 'Saving…' : 'Save Notes'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 min-h-[100px]">
                  {evidence.officer_review ? (
                    <p className="text-[12px] text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                      "{evidence.officer_review}"
                    </p>
                  ) : (
                    <p className="text-[11.5px] text-slate-400 italic">
                      No officer observations entered yet. Click "+ Add Observation" above to record human findings.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Geo Info */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                GEO-LOCATION VERIFICATION
              </div>
              {metaLoading ? <Skeleton className="h-20" /> : <GeoInfoBlock metadata={metadata} />}
            </div>
          </div>
        </div>

        {/* PDF Download Bar */}
        <div className="flex flex-wrap items-center justify-between rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 gap-3">
          <div>
            <div className="text-[12.5px] font-bold text-slate-900">Standardised PDF Evidence Package</div>
            <div className="text-[11px] text-slate-500">
              Server-generated document containing image render, EXIF tables, and official audit log.
            </div>
          </div>
          {evidence.has_pdf ? (
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex items-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-3.5 py-2 text-[12px] font-bold text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Download PDF Document
            </button>
          ) : (
            <span className="text-[11px] font-semibold text-slate-400">PDF not available</span>
          )}
        </div>

        {/* Processing Timeline & EXIF metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5" style={{ fontFamily: 'var(--font-mono)' }}>
              VERIFICATION TIMELINE
            </div>
            <ProcessingTimeline evidence={evidence} />
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5" style={{ fontFamily: 'var(--font-mono)' }}>
              CAMERA EXIF METADATA
            </div>
            {exifEntries.length > 0 ? (
              <div className="rounded-xl border border-slate-200 overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <tbody>
                    {exifEntries.map(([key, val], i) => (
                      <tr key={key} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="px-3 py-1.5 font-semibold text-slate-600 w-36 whitespace-nowrap">{key}</td>
                        <td className="px-3 py-1.5 text-slate-700 font-mono truncate max-w-xs" title={String(val)}>{String(val)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center text-[11.5px] text-slate-400 italic">
                No EXIF camera metadata embedded in image.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Evidence Table ────────────────────────────────────────────────────────────
function EvidenceTable({ items, onViewDetail, onQuickReview }) {
  const fmt = (dt) => dt ? new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '—'

  if (!items.length) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50">
            {['#', 'File', 'Associated Project', 'Review Status', 'Verification Signal', 'Uploaded', 'Actions'].map(h => (
              <th key={h} className="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((ev) => (
            <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
              <td className="px-3.5 py-3 font-mono text-slate-400 text-[11px]">#{ev.id}</td>
              
              {/* File Info */}
              <td className="px-3.5 py-3 max-w-[160px]">
                <div className="font-bold text-slate-800 truncate" title={ev.original_filename}>
                  {ev.original_filename}
                </div>
                <div className="text-[10.5px] text-slate-400 uppercase font-mono mt-0.5">
                  {ev.mime_type?.split('/')[1] ?? '—'} · {(ev.file_size_bytes / 1024).toFixed(0)} KB
                </div>
              </td>

              {/* Associated Project */}
              <td className="px-3.5 py-3 max-w-[200px]">
                {ev.project_id ? (
                  <div>
                    <div className="font-bold text-slate-900 truncate" title={ev.project_name}>
                      {ev.project_name || `Project #${ev.project_id}`}
                    </div>
                    <div className="text-[10.5px] font-mono text-blue-700 font-semibold mt-0.5">
                      ID #{ev.project_id} {ev.project_code ? `· ${ev.project_code}` : ''}
                    </div>
                  </div>
                ) : (
                  <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-400 italic">
                    Project not linked
                  </span>
                )}
              </td>

              {/* Review Status */}
              <td className="px-3.5 py-3 whitespace-nowrap">
                <ReviewStatusBadge status={ev.review_status} />
              </td>

              {/* Verification Signal */}
              <td className="px-3.5 py-3 whitespace-nowrap">
                <VerificationBadge status={ev.processing_status} />
              </td>

              {/* Uploaded */}
              <td className="px-3.5 py-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                {fmt(ev.created_at)}
              </td>

              {/* Actions */}
              <td className="px-3.5 py-3 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onViewDetail(ev)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickReview(ev)}
                    className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-bold transition-colors shadow-sm ${
                      ev.review_status === 'reviewed'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {ev.review_status === 'reviewed' ? 'Edit Review' : 'Review'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Upload Zone ───────────────────────────────────────────────────────────────
const ACCEPTED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.svg']

function validate_file_client(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase()
  if (!ACCEPTED_EXT.includes(ext)) {
    return `Unsupported format: ${ext}. Accepted formats: JPG, JPEG, PNG, WEBP, SVG`
  }
  return null
}

function UploadZone({ maxFileMb, onUploadComplete }) {
  const [dragOver, setDragOver] = useState(false)
  const [queue, setQueue] = useState([]) // [{file, id, status, error}]
  const [selectedProject, setSelectedProject] = useState(null)
  const [officerReviewText, setOfficerReviewText] = useState('')
  const inputRef = useRef(null)
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: ({ file, projectId, officerReview }) => {
      const fd = new FormData()
      fd.append('file', file)
      if (projectId) fd.append('project_id', projectId)
      if (officerReview && officerReview.trim()) {
        fd.append('officer_review', officerReview.trim())
      }
      return geotagApi.upload(fd)
    },
    onSuccess: (data, variables) => {
      setQueue(q => q.map(item =>
        item.id === variables.queueId
          ? { ...item, status: 'done', result: data }
          : item
      ))
      queryClient.invalidateQueries({ queryKey: ['geotag-list'] })
      if (onUploadComplete) onUploadComplete()
    },
    onError: (error, variables) => {
      const msg = error?.response?.data?.detail || 'Upload failed. Please try again.'
      setQueue(q => q.map(item =>
        item.id === variables.queueId
          ? { ...item, status: 'error', error: msg }
          : item
      ))
    },
  })

  const addFiles = useCallback((files) => {
    const newItems = Array.from(files).map(file => {
      const clientErr = validate_file_client(file)
      return {
        file,
        id: `${Date.now()}-${Math.random()}`,
        status: clientErr ? 'invalid' : 'pending',
        error: clientErr,
        result: null,
      }
    })
    setQueue(q => [...q, ...newItems])
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const removeItem = (id) => setQueue(q => q.filter(i => i.id !== id))

  const uploadAll = () => {
    const pid = selectedProject?.id
    const reviewNote = officerReviewText.trim()
    queue.filter(i => i.status === 'pending').forEach(item => {
      setQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i))
      uploadMutation.mutate({
        file: item.file,
        projectId: pid,
        officerReview: reviewNote,
        queueId: item.id,
      })
    })
  }

  const pendingCount = queue.filter(i => i.status === 'pending').length
  const uploadingCount = queue.filter(i => i.status === 'uploading').length

  return (
    <div className="space-y-5">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
          dragOver
            ? 'border-blue-500 bg-blue-50/80 shadow-inner'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT.join(',')}
          multiple
          className="sr-only"
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />
        <div className="flex flex-col items-center gap-3 pointer-events-none">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-colors ${
            dragOver ? 'border-blue-300 bg-blue-100 text-blue-600' : 'border-slate-200 bg-slate-50 text-slate-400'
          }`}>
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-[13.5px] font-bold text-slate-800">
              {dragOver ? 'Drop images here' : 'Drag & Drop Project Site Images Here'}
            </p>
            <p className="mt-0.5 text-[11.5px] text-slate-500">
              or{' '}
              <span className="font-semibold text-blue-600 underline underline-offset-2">Browse Files</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {['JPG', 'JPEG', 'PNG', 'WEBP', 'SVG'].map(fmt => (
              <span key={fmt}
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 uppercase"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                {fmt}
              </span>
            ))}
          </div>
          {maxFileMb && (
            <p className="text-[10.5px] text-slate-400">
              Maximum allowed file size: {maxFileMb} MB per file
            </p>
          )}
        </div>
      </div>

      {/* Grid: Project Association & Officer Observation Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
        
        {/* Project Association (ID or Name) */}
        <ProjectSelector
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
        />

        {/* Officer Review / Observation Notes Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                   style={{ fontFamily: 'var(--font-mono)' }}>
              Officer Review / Observation (Optional)
            </label>
            <span className="text-[10.5px] text-slate-400 font-mono">{officerReviewText.length}/2000</span>
          </div>
          <textarea
            rows={3}
            maxLength={2000}
            value={officerReviewText}
            onChange={(e) => setOfficerReviewText(e.target.value)}
            placeholder="Enter officer notes or human observations (e.g., Image appears to show road condition at reported project location. Visible damage near roadside section.)"
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-[12.5px] text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
          />
          <p className="text-[10.5px] text-slate-400">
            Recorded as human observation note. Not presented as AI conclusion.
          </p>
        </div>
      </div>

      {/* Queue items */}
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            {queue.map(item => (
              <div key={item.id}
                   className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[12px] transition-colors ${
                     item.status === 'done'
                       ? 'border-emerald-200 bg-emerald-50/60'
                       : item.status === 'error' || item.status === 'invalid'
                       ? 'border-red-200 bg-red-50/60'
                       : item.status === 'uploading'
                       ? 'border-blue-200 bg-blue-50/60'
                       : 'border-slate-200 bg-white'
                   }`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold border ${
                  item.status === 'done' ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                  : item.status === 'error' || item.status === 'invalid' ? 'border-red-300 bg-red-100 text-red-700'
                  : item.status === 'uploading' ? 'border-blue-300 bg-blue-100 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}>
                  {item.status === 'done' ? '✓'
                   : item.status === 'error' || item.status === 'invalid' ? '!'
                   : item.status === 'uploading' ? '↑'
                   : '○'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{item.file.name}</div>
                  <div className="text-[10.5px] text-slate-400">
                    {(item.file.size / 1024).toFixed(1)} KB
                    {item.status === 'done' && (
                      <span className="ml-2 text-emerald-700 font-semibold">
                        {item.result?.geo_available ? '· Geo-data extracted' : '· Geo-data not found'}
                      </span>
                    )}
                    {(item.status === 'error' || item.status === 'invalid') && (
                      <span className="ml-2 text-red-600 font-semibold">{item.error}</span>
                    )}
                  </div>
                </div>
                {item.status !== 'uploading' && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded"
                    aria-label="Remove file"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Button */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={uploadAll}
          disabled={uploadingCount > 0}
          className="flex items-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-md"
        >
          {uploadingCount > 0 ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12"/>
              </svg>
              Processing {uploadingCount} image{uploadingCount > 1 ? 's' : ''} → PDF Evidence…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Process & Verify {pendingCount} Evidence Image{pendingCount > 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-slate-200 bg-slate-50 text-slate-300 mb-4">
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h3 className="text-[14px] font-bold text-slate-700">No GeoTag evidence records uploaded yet</h3>
      <p className="mt-1.5 text-[12px] text-slate-400 max-w-xs">
        Upload project site images above to begin evidence processing.
        Images will be converted to standardized PDF evidence records.
      </p>
    </div>
  )
}

// ─── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Previous
      </button>
      <span className="text-[11px] text-slate-500 font-mono">Page {page} of {totalPages}</span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function GeoTag1() {
  const [page, setPage] = useState(1)
  const [selectedEvidence, setSelectedEvidence] = useState(null)
  const [reviewFilter, setReviewFilter] = useState('') // '' | 'pending_review' | 'reviewed'

  // Fetch backend upload config (file size limit)
  const { data: uploadConfig } = useQuery({
    queryKey: ['geotag-config'],
    queryFn: () => geotagApi.config(),
    staleTime: 5 * 60_000,
  })

  // Fetch evidence list
  const { data: evidenceList, isLoading, isError, refetch } = useQuery({
    queryKey: ['geotag-list', page, reviewFilter],
    queryFn: () => geotagApi.list({ page, page_size: 20, review_status: reviewFilter || undefined }),
    staleTime: 30_000,
    keepPreviousData: true,
  })

  const items = evidenceList?.items ?? []
  const totalPages = evidenceList?.total_pages ?? 1
  const total = evidenceList?.total ?? 0

  return (
    <div className="mx-auto max-w-7xl space-y-5">

      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm text-slate-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <div>
              <h1 className="text-[18px] font-extrabold tracking-tight text-slate-900 leading-none">
                GeoTag-1
              </h1>
              <p className="mt-0.5 text-[11.5px] font-medium text-slate-400">
                Image Evidence Processing & Verification
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10.5px] font-bold text-emerald-700 uppercase tracking-wider"
                style={{ fontFamily: 'var(--font-mono)' }}>
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider"
                style={{ fontFamily: 'var(--font-mono)' }}>
            Evidence Module
          </span>
        </div>
      </div>

      {/* Responsible-AI Banner */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="flex items-start gap-3">
          <svg className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
          </svg>
          <p className="text-[11.5px] text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-800">Decision-Support Only.</span>{' '}
            GeoTag-1 is an evidence-processing module for authorized officers. Geo-location data, EXIF metadata, and officer review observations are verification signals. They do not constitute findings of fraud, misconduct, or legal liability. Final decisions remain with authorized officials.
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader
          title="Image Evidence Upload"
          subtitle="Upload project site images (JPG, JPEG, PNG, WEBP, SVG) to convert them into PDF evidence records with project association and officer review notes."
        />
        <div className="p-5">
          <UploadZone
            maxFileMb={uploadConfig?.max_file_mb ?? 20}
            onUploadComplete={() => refetch()}
          />
        </div>
      </Card>

      {/* Evidence Records List */}
      <Card>
        <CardHeader
          title="Uploaded Evidence Records"
          subtitle="All processed geo-tagged evidence. Inspect metadata, officer observations, and PDF evidence documents."
          action={
            <div className="flex items-center gap-2">
              {/* Review Filter */}
              <select
                value={reviewFilter}
                onChange={(e) => { setReviewFilter(e.target.value); setPage(1) }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-100"
              >
                <option value="">All Review Statuses</option>
                <option value="pending_review">Pending Review</option>
                <option value="reviewed">Reviewed</option>
              </select>

              {total > 0 && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-bold text-slate-600"
                      style={{ fontFamily: 'var(--font-mono)' }}>
                  {total} record{total !== 1 ? 's' : ''}
                </span>
              )}
              <button
                type="button"
                onClick={() => refetch()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                aria-label="Refresh evidence list"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round"/>
                </svg>
                Refresh
              </button>
            </div>
          }
        />
        <div className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <svg className="h-8 w-8 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
              </svg>
              <p className="text-[12px] font-semibold text-red-600">Failed to load evidence records</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-[11px] text-blue-600 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              <EvidenceTable
                items={items}
                onViewDetail={setSelectedEvidence}
                onQuickReview={setSelectedEvidence}
              />
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={totalPages} onPage={setPage} />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Evidence Detail Modal */}
      <AnimatePresence>
        {selectedEvidence && (
          <EvidenceDetailModal
            evidence={selectedEvidence}
            onClose={() => setSelectedEvidence(null)}
            onRefresh={(updated) => setSelectedEvidence(updated)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
