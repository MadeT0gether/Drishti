import { useEffect, useRef, useState } from 'react'
import { dataApi } from '../../services/api'

/* Public transparency exports — real downloads of the public-safe datasets
   served by /data/export/{dataset}. No internal/officer data. */
const EXPORTS = [
  { dataset: 'completed-works', label: 'Completed Works', kind: 'CSV', filename: 'completed_works.csv' },
  { dataset: 'recommended-works', label: 'Recommended Works', kind: 'CSV', filename: 'recommended_works.csv' },
  { dataset: 'expenditures', label: 'Expenditures', kind: 'CSV', filename: 'expenditures.csv' },
  { dataset: 'mp-summary', label: 'MP Summary', kind: 'CSV', filename: 'mp_summary.csv' },
  { dataset: 'current', label: 'Current Data', kind: 'JSON', filename: 'current_data.json' },
]

function FileIcon({ kind }) {
  if (kind === 'JSON') {
    return (
      <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
        <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
    )
  }
  return (
    <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 15h6M9 18h4" />
    </svg>
  )
}

export default function ExportDataMenu() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const download = async (item) => {
    setBusy(item.dataset)
    setError(null)
    try {
      const blob = await dataApi.exportDataset(item.dataset)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = item.filename
      a.click()
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch {
      setError(item.dataset)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 text-xs font-bold transition-all shadow-sm"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
        <span>Export Data</span>
        <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden"
        >
          <div className="px-3.5 py-2.5 border-b border-slate-100 text-[10px] font-bold font-mono text-slate-500 uppercase tracking-wider">
            Public Datasets
          </div>
          {EXPORTS.map((item) => (
            <button
              key={item.dataset}
              role="menuitem"
              onClick={() => download(item)}
              disabled={busy != null}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <FileIcon kind={item.kind} />
              <span className="flex-1">{item.label}</span>
              <span className="rounded bg-slate-100 border border-slate-200 text-slate-600 text-[9.5px] font-bold font-mono px-1.5 py-0.5">
                {busy === item.dataset ? '…' : error === item.dataset ? 'Retry' : item.kind}
              </span>
            </button>
          ))}
          <div className="px-3.5 py-2 border-t border-slate-100 text-[10px] text-slate-400 font-sans">
            Public information only · Prototype dataset — synthetic data
          </div>
        </div>
      )}
    </div>
  )
}
