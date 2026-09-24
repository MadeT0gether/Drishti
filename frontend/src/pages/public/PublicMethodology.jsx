import { Link } from 'react-router-dom'
import { motion } from 'motion/react'

/* Citizen-friendly "About the Data" page. Plain language first; the
   technical detail lives in the expandable section at the bottom. */

/* As-of date of the generated demo dataset (data/evaluation/dataset_stats.json). */
const SNAPSHOT_DATE = '24 August 2026'

const QUESTIONS = [
  {
    id: 'sources',
    q: 'Where does this information come from?',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
    body: (
      <>
        The information on this portal comes from the records kept while public works are
        planned and carried out. For each project you can see its name, where it is located,
        the amount of money approved for it, how much has been spent so far, and how complete
        the work is reported to be.
      </>
    ),
    link: { to: '/public/projects', label: 'Browse the project records' },
  },
  {
    id: 'progress',
    q: 'What does the progress percentage mean?',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 2a10 10 0 0 1 10 10h-10z" />
      </svg>
    ),
    body: (
      <>
        The progress percentage shows how complete the work is,{' '}
        <strong>as reported by the agency carrying out the project</strong>. This portal does
        not send inspectors to check the work, so the figure may sometimes be behind — or
        differ from — what you would see on the ground.
      </>
    ),
    note: 'Progress figures are reported, not independently verified.',
  },
  {
    id: 'updates',
    q: 'How current is the information?',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
    body: (
      <>
        This portal currently shows a snapshot of the available records — a copy taken at a
        point in time, not a live feed. A live public service would refresh its copy regularly
        and show you when each record was last updated.
      </>
    ),
    note: `Last updated: ${SNAPSHOT_DATE} (demonstration snapshot)`,
  },
  {
    id: 'limitations',
    q: 'What are the limitations?',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    ),
    body: (
      <>
        Records like these are filled in by many offices over many years, so some entries can
        be missing, incomplete, delayed, or inconsistent. Totals and percentages reflect
        whatever was recorded — read them as a good indication, not a perfect measurement.
      </>
    ),
  },
]

const TECH_SECTIONS = [
  {
    title: 'Source systems',
    body: 'In this prototype, records are drawn from a synthetic dataset generated to mirror the structure of programme administration systems: project recommendation and sanction records, milestone and progress-update registers, payment records, and PFMS-style financial transaction feeds. In a production deployment these would be sourced from the corresponding government systems of record.',
  },
  {
    title: 'Map and boundary data',
    body: 'District geography uses Census-2011 boundary data published by the DataMeet community (CC BY 4.0). Districts created by bifurcation after 2011 are shown undivided within their former extents.',
  },
  {
    title: 'Data quality',
    body: 'The dataset intentionally includes defects typical of administrative data — missing or invalid coordinates, incomplete dates, and unreconciled financial entries — so data-quality handling can be evaluated. Aggregate figures reflect the records available in the current snapshot.',
  },
  {
    title: 'Corrections and revisions',
    body: 'In a production service, corrections to published records would be applied at the source system and flow to the portal on the next synchronization, with material revisions noted. As a prototype, this portal does not operate a corrections process; the dataset is regenerated as a whole when the demonstration data changes.',
  },
]

export default function PublicMethodology() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-5 max-w-5xl mx-auto"
    >
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-black text-slate-900 tracking-tight">About the Data</h1>
        <p className="text-sm text-slate-600 font-medium mt-1">
          How to understand the information on this portal — in plain language.
        </p>
      </div>

      {/* Prototype notice — citizen-friendly wording */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 font-medium leading-relaxed">
        <strong className="font-mono text-[10.5px] uppercase tracking-wider block mb-1">Prototype notice</strong>
        This demonstration uses synthetic data for evaluation. The figures shown here do not
        represent real government projects, expenditure, or official findings.
      </div>

      {/* The four citizen questions — two columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {QUESTIONS.map((item) => (
          <section key={item.q} id={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3.5">
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 text-blue-700">
                {item.icon}
              </div>
              <div className="space-y-1.5 min-w-0">
                <h2 className="text-sm font-bold text-slate-900">{item.q}</h2>
                <p className="text-[12.5px] text-slate-600 leading-relaxed">{item.body}</p>
                {item.note && (
                  <p className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800 mt-1">
                    <span aria-hidden="true">ⓘ</span> {item.note}
                  </p>
                )}
                {item.link && (
                  <p className="pt-0.5">
                    <Link to={item.link.to} className="text-xs font-bold text-blue-700 hover:underline font-mono">
                      {item.link.label} →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* About internal analysis — compact side note, not a headline section */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          <strong className="text-slate-700">About internal analysis:</strong> authorized
          officials separately use analytical tools that highlight projects worth a closer look.
          Those signals are internal working aids, not public findings of fraud or misconduct,
          and they are not published on this portal. Official conclusions are made by authorized
          people, not by software.
        </p>
      </div>

      {/* Detailed methodology — for readers who want the technical version */}
      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm group">
        <summary className="cursor-pointer select-none list-none p-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Detailed methodology</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Source systems, map data, data quality, and corrections — the technical version.
            </p>
          </div>
          <span className="shrink-0 text-slate-400 font-mono text-xs group-open:rotate-180 transition-transform" aria-hidden="true">▼</span>
        </summary>
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-100">
          {TECH_SECTIONS.map((s) => (
            <div key={s.title} className="space-y-1 pt-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide font-mono">{s.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </details>
    </motion.div>
  )
}
