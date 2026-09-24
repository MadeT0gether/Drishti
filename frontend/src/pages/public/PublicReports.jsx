import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../services/api'
import ExportDataMenu from '../../components/ui/ExportDataMenu'

/* The public reporting/publication layer: what official summaries exist,
   what each covers, and how often it is published. In the prototype no
   documents are published — each card points at the live view that would
   feed it. */
const REPORT_TYPES = [
  {
    cat: 'Monthly Summary',
    title: 'National Programme Implementation Summary',
    cadence: 'Published monthly',
    desc: 'A national-level snapshot of programme progress: completed works, works underway, and reported fund utilization.',
    liveTo: '/public/overview',
    liveLabel: 'See the live national view',
    pdf: 'monthly',
  },
  {
    cat: 'Quarterly Benchmark',
    title: 'Public Works Delivery & Utilization Benchmark',
    cadence: 'Published quarterly',
    desc: 'Compare delivery, progress, and utilization across states and districts for the quarter.',
    liveTo: '/public/map',
    liveLabel: 'Compare states & districts live',
    pdf: 'quarterly',
  },
  {
    cat: 'State Report',
    title: 'State-wise Expenditure & Progress Report',
    cadence: 'Published monthly',
    desc: 'Individual states in focus: sanctioned funding, reported expenditure, and physical progress across the works portfolio.',
    liveTo: '/public/map',
    liveLabel: 'Explore state-level figures',
    pdf: 'state',
  },
  {
    cat: 'Annual Report',
    title: 'Annual Public Infrastructure Performance & Transparency Report',
    cadence: 'Published annually',
    desc: 'The yearly overall picture: programme delivery, coverage, data-quality posture, and methodology notes.',
    liveTo: '/public/methodology',
    liveLabel: 'Read the methodology',
    pdf: 'annual',
  },
]

/* Period pickers + one-click download of the simplified citizen PDFs.
   Periods come from the backend (only periods with recorded activity). */
const SELECT_CLS =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[11rem]'

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function DownloadButton({ busy, error, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-bold transition-all"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
      {busy ? 'Preparing…' : error ? 'Retry PDF' : 'Download PDF'}
    </button>
  )
}

function PdfDownload({ kind }) {
  const needsMonths = kind === 'monthly' || kind === 'state'
  const periods = useQuery({
    queryKey: ['report-periods', needsMonths ? 'months' : kind],
    queryFn:
      needsMonths ? dashboardApi.monthlyReportMonths
      : kind === 'quarterly' ? dashboardApi.quarterlyReportQuarters
      : dashboardApi.annualReportYears,
    staleTime: 300_000,
  })
  const states = useQuery({
    queryKey: ['states'],
    queryFn: dashboardApi.states,
    staleTime: 300_000,
    enabled: kind === 'state',
  })
  const [period, setPeriod] = useState('')
  const [stateId, setStateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const options = periods.data ?? []
  const keyOf = (o) =>
    kind === 'quarterly' ? `${o.year}-${o.quarter}` :
    kind === 'annual' ? `${o.year}` : `${o.year}-${o.month}`
  const value = period || (options[0] ? keyOf(options[0]) : '')
  const stateOptions = states.data ?? []
  const stateValue = stateId || (stateOptions[0] ? String(stateOptions[0].state_id ?? stateOptions[0].id) : '')

  const download = async () => {
    const parts = value.split('-').map(Number)
    setBusy(true)
    setError(false)
    try {
      let blob, filename
      if (kind === 'monthly') {
        blob = await dashboardApi.monthlyReportPdf(parts[0], parts[1])
        filename = `DRISHTI_Monthly_Report_${parts[0]}_${String(parts[1]).padStart(2, '0')}.pdf`
      } else if (kind === 'quarterly') {
        blob = await dashboardApi.quarterlyReportPdf(parts[0], parts[1])
        filename = `DRISHTI_Quarterly_Report_${parts[0]}_Q${parts[1]}.pdf`
      } else if (kind === 'state') {
        blob = await dashboardApi.stateReportPdf(Number(stateValue), parts[0], parts[1])
        const name = stateOptions.find((s) => String(s.state_id ?? s.id) === stateValue)?.state
        filename = `DRISHTI_State_Report_${(name || stateValue).replace(/\s+/g, '_')}_${parts[0]}_${String(parts[1]).padStart(2, '0')}.pdf`
      } else {
        blob = await dashboardApi.annualReportPdf(parts[0])
        filename = `DRISHTI_Annual_Report_${parts[0]}.pdf`
      }
      saveBlob(blob, filename)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  if (periods.isLoading || (kind === 'state' && states.isLoading)) {
    return <div className="pt-2 text-[10px] font-mono text-slate-400">Loading available periods…</div>
  }
  if (!options.length) return null

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      {kind === 'state' && (
        <select
          value={stateValue}
          onChange={(e) => setStateId(e.target.value)}
          aria-label="State"
          className={SELECT_CLS}
        >
          {stateOptions.map((s) => {
            const id = String(s.state_id ?? s.id)
            return (
              <option key={id} value={id}>
                {s.state ?? s.name}
              </option>
            )
          })}
        </select>
      )}
      <select
        value={value}
        onChange={(e) => setPeriod(e.target.value)}
        aria-label="Report period"
        className={SELECT_CLS}
      >
        {options.map((o) => (
          <option key={keyOf(o)} value={keyOf(o)}>
            {o.label}
          </option>
        ))}
      </select>
      <DownloadButton
        busy={busy}
        error={error}
        disabled={!value || (kind === 'state' && !stateValue)}
        onClick={download}
      />
    </div>
  )
}

export default function PublicReports() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-2 max-w-3xl">
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Programme Reports</h1>
          <p className="text-sm text-slate-600 font-medium leading-relaxed">
            Official summaries of programme delivery, expenditure, utilization, and public
            infrastructure performance. Explore national, state-wise, quarterly, and annual views
            of the information published through DRISHTI — and download the underlying public
            datasets.
          </p>
          <p className="text-[11px] text-slate-400 font-mono">
            Prototype environment — reports render from live synthetic data; the datasets are
            downloadable via Export Data.
          </p>
        </div>
        <ExportDataMenu />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORT_TYPES.map((r) => (
          <div key={r.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-2.5 flex flex-col">
            <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
              <span className="font-bold text-blue-700 uppercase bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                {r.cat}
              </span>
              <span className="text-slate-400">{r.cadence}</span>
            </div>
            <div className="font-bold text-slate-900 text-sm leading-snug">{r.title}</div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans flex-1">{r.desc}</p>
            <div className="pt-2 border-t border-slate-100">
              <Link to={r.liveTo} className="text-xs font-bold text-blue-700 hover:underline font-mono">
                {r.liveLabel} →
              </Link>
              {r.pdf && <PdfDownload kind={r.pdf} />}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-[11px] text-slate-500 font-sans leading-relaxed">
        How these figures are compiled, what they mean, and their limitations are documented in the{' '}
        <Link to="/public/methodology" className="font-bold text-blue-700 hover:underline">Data Methodology</Link>.
      </div>
    </motion.div>
  )
}
