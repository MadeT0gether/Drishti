import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { citizenReportsApi } from '../../services/api'
import { formatDateTime } from '../../utils/format'

const STATUS_STEPS = [
  { key: 'submitted', label: 'Submitted', desc: 'Received & logged in registry' },
  { key: 'under_review', label: 'Under Review', desc: 'Officer evaluating records' },
  { key: 'verification_required', label: 'Verification Required', desc: 'Field inspection assigned' },
  { key: 'resolved', label: 'Resolved / Closed', desc: 'Official review completed' },
]

function getStatusIndex(status) {
  if (status === 'submitted') return 0
  if (status === 'under_review') return 1
  if (status === 'verification_required') return 2
  if (status === 'resolved' || status === 'dismissed') return 3
  return 0
}

export default function CitizenReportTrackerModal({ isOpen, onClose, initialRefId = '' }) {
  const [refId, setRefId] = useState(initialRefId)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  const handleTrack = async (targetId) => {
    const queryId = (targetId || refId).trim().toUpperCase()
    if (!queryId) return

    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const data = await citizenReportsApi.track(queryId)
      setReport(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Report reference ID not found. Please verify the code and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialRefId) {
      setRefId(initialRefId)
      handleTrack(initialRefId)
    }
  }, [initialRefId])

  if (!isOpen) return null

  const currentStep = report ? getStatusIndex(report.status) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <span className="text-[10px] font-bold font-mono tracking-widest text-blue-700 uppercase">
                CITIZEN REPORT TRACKER
              </span>
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Track Your Submitted Issue</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-6 space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleTrack()
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Enter Reference ID (e.g. DRISHTI-F93A12)"
              value={refId}
              onChange={(e) => setRefId(e.target.value.toUpperCase())}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 uppercase focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading || !refId.trim()}
              className="rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Track →'}
            </button>
          </form>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Tracked Report Status Display */}
          {report && (
            <div className="space-y-6 pt-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">REFERENCE ID</span>
                    <span className="font-mono font-black text-sm text-slate-900">{report.reference_id}</span>
                  </div>
                  <span className="rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-bold font-mono text-[10.5px] px-3 py-1 uppercase">
                    STATUS: {report.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Project / Target</span>
                    <span className="font-bold text-slate-800">{report.project_title || 'Unlisted / General Area'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Location</span>
                    <span className="text-slate-700">
                      {report.district_name ? `${report.district_name}, ${report.state_name || ''}` : 'Local Observation'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Issue Category</span>
                    <span className="text-slate-700 capitalize">{report.issue_type.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Submitted On</span>
                    <span className="text-slate-700 font-mono text-[11px]">
                      {report.created_at ? new Date(report.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                </div>

                {report.resolution_remarks && (
                  <div className="pt-2 border-t border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase font-mono block">
                      OFFICIAL RESOLUTION / REMARKS
                    </span>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200">
                      {report.resolution_remarks}
                    </p>
                  </div>
                )}
              </div>

              {/* Progress Timeline Stepper */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
                  Review &amp; Verification Lifecycle
                </h4>

                <div className="space-y-3">
                  {STATUS_STEPS.map((s, idx) => {
                    const isDone = idx <= currentStep
                    const isCurrent = idx === currentStep
                    return (
                      <div key={s.key} className="flex items-start gap-3">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${isDone ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-400'}`}>
                          {isDone ? '✓' : idx + 1}
                        </div>
                        <div className="space-y-0.5">
                          <div className={`text-xs font-bold ${isCurrent ? 'text-blue-700' : isDone ? 'text-slate-900' : 'text-slate-400'}`}>
                            {s.label}
                          </div>
                          <p className="text-[11px] text-slate-500">{s.desc}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-200 px-6 py-3.5 bg-slate-50">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  )
}
