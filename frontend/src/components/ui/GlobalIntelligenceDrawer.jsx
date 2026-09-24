import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Link } from 'react-router-dom'

/* ─── Risk Color Map ─────────────────────────────────────────── */
const RISK_COLORS = {
  critical: { dot: '#dc2626', bg: '#fef2f2', border: '#fca5a5', text: '#7f1d1d', label: 'CRITICAL', symbol: '■' },
  high:     { dot: '#ea580c', bg: '#fff3e0', border: '#fb923c', text: '#7c2d12', label: 'HIGH', symbol: '▲' },
  elevated: { dot: '#f97316', bg: '#fff7ed', border: '#fdba74', text: '#7c2d12', label: 'ELEVATED', symbol: '◆' },
  moderate: { dot: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', text: '#92400e', label: 'MODERATE', symbol: '◆' },
  low:      { dot: '#64849a', bg: '#f0f4f8', border: '#b8ccde', text: '#3d5470', label: 'LOW', symbol: '●' },
}

function riskColor(level) {
  return RISK_COLORS[level?.toLowerCase()] ?? RISK_COLORS.low
}

/* ─── Risk Score Ring ────────────────────────────────────────── */
function RiskScoreRing({ score = 0, level = 'low', size = 72 }) {
  const rc = riskColor(level)
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f3f7" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={rc.dot} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-extrabold tabular-nums leading-none" style={{ color: rc.dot, fontFamily: 'var(--font-mono)' }}>
          {Math.round(score)}
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wider mt-0.5" style={{ color: rc.dot }}>
          {rc.label}
        </span>
      </div>
    </div>
  )
}

/* ─── Evidence Factor Bar ────────────────────────────────────── */
function EvidenceFactor({ label, contribution, maxContribution = 30, description }) {
  const pct = Math.min((contribution / maxContribution) * 100, 100)
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-semibold text-slate-800 truncate">{label}</div>
        {description && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{description}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-blue-600"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          />
        </div>
        <span className="text-[11px] font-bold tabular-nums text-slate-700 w-8 text-right" style={{ fontFamily: 'var(--font-mono)' }}>
          +{contribution}
        </span>
      </div>
    </div>
  )
}

/* ─── Metric Row ─────────────────────────────────────────────── */
function MetricRow({ label, value, mono = false, highlight = false }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <span className={`text-[11.5px] font-semibold ${highlight ? 'text-slate-900' : 'text-slate-700'} ${mono ? 'tabular-nums' : ''}`}
            style={mono ? { fontFamily: 'var(--font-mono)' } : {}}>
        {value}
      </span>
    </div>
  )
}

/* ─── Timeline Item ──────────────────────────────────────────── */
function TimelineItem({ timestamp, event, actor, type = 'info' }) {
  const typeColors = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    alert: 'bg-red-100 text-red-700',
    success: 'bg-emerald-100 text-emerald-700',
  }
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={`h-2 w-2 rounded-full mt-1 shrink-0 ${
          type === 'alert' ? 'bg-red-500' :
          type === 'warning' ? 'bg-amber-500' :
          type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
        }`} />
        <div className="flex-1 w-px bg-slate-200 my-1.5" />
      </div>
      <div className="pb-3 min-w-0">
        <p className="text-[11.5px] font-medium text-slate-800 leading-snug">{event}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {actor && <span className="text-[10px] font-semibold text-slate-500">{actor}</span>}
          <span className="text-[9.5px] text-slate-400 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{timestamp}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Section ────────────────────────────────────────────────── */
function Section({ title, children, defaultOpen = true }) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="px-5 py-3 bg-slate-50/60">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400"
              style={{ fontFamily: 'var(--font-mono)' }}>
          {title}
        </span>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  )
}

/* ─── Global Intelligence Drawer ────────────────────────────── */
export default function GlobalIntelligenceDrawer({
  isOpen,
  onClose,
  // Context type: 'project' | 'district' | 'alert' | 'investigation' | 'data-issue' | 'model'
  type = 'project',
  // Context data object (type-specific shape)
  data = null,
  // Optional: custom title override
  title,
  // Optional: custom subtitle override
  subtitle,
}) {
  const panelRef = useRef(null)

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const fn = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [isOpen, onClose])

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Derived display data
  const d = data ?? {}
  const level = d.risk_level ?? d.level ?? 'low'
  const score = d.risk_score ?? d.score ?? 0
  const rc = riskColor(level)

  const drawerTitle = title ?? (
    type === 'project' ? 'Project Intelligence' :
    type === 'district' ? 'District Intelligence' :
    type === 'alert' ? 'Alert Details' :
    type === 'investigation' ? 'Investigation Priority' :
    type === 'data-issue' ? 'Data Quality Issue' :
    type === 'model' ? 'Model Card' :
    'Intelligence Detail'
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] z-40"
            onClick={onClose}
          />

          {/* Drawer Panel */}
          <motion.div
            key="drawer"
            ref={panelRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34, mass: 0.9 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white border-l border-slate-200 overflow-hidden"
            style={{ width: 480, maxWidth: '95vw', boxShadow: 'var(--shadow-drawer)' }}
            role="complementary"
            aria-label={drawerTitle}
          >
            {/* Sticky Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 bg-white shrink-0 sticky top-0 z-10">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                {(type === 'project' || type === 'district' || type === 'investigation') && data && (
                  <RiskScoreRing score={score} level={level} />
                )}
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1"
                       style={{ fontFamily: 'var(--font-mono)' }}>
                    {drawerTitle}
                  </div>
                  <div className="text-[14px] font-bold text-slate-900 leading-snug truncate">
                    {d.title ?? d.name ?? d.project_title ?? '—'}
                  </div>
                  {(d.code ?? d.id) && (
                    <div className="text-[10.5px] text-slate-500 mt-0.5 tabular-nums"
                         style={{ fontFamily: 'var(--font-mono)' }}>
                      {d.code ?? `#${d.id}`}
                    </div>
                  )}
                  {(d.district_name ?? d.state_name ?? subtitle) && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      {[d.district_name, d.state_name].filter(Boolean).join(', ') || subtitle}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close panel"
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors ml-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Risk Status Badge */}
              {data && score > 0 && (
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3"
                     style={{ background: rc.bg }}>
                  <div className="flex h-2.5 w-2.5 rounded-full shrink-0" style={{ background: rc.dot }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: rc.text }}>
                    {rc.label} RISK
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium ml-auto">
                    Score: <strong style={{ color: rc.dot, fontFamily: 'var(--font-mono)' }}>{Math.round(score)}/100</strong>
                  </span>
                </div>
              )}

              {/* Key Metrics */}
              {data && (
                <Section title="Key Metrics">
                  <div className="space-y-0.5">
                    {d.active_projects != null && <MetricRow label="Active Projects" value={d.active_projects.toLocaleString('en-IN')} />}
                    {d.total_sanctioned != null && (
                      <MetricRow label="Fund Exposure" mono
                        value={`₹${(d.total_sanctioned / 1_00_00_000).toFixed(1)} Cr`} />
                    )}
                    {d.utilization_pct != null && (
                      <MetricRow label="Utilization" value={`${d.utilization_pct}%`} highlight />
                    )}
                    {d.high_risk_count != null && (
                      <MetricRow label="High Risk Projects" value={d.high_risk_count} highlight={d.high_risk_count > 0} />
                    )}
                    {d.sanctioned_cost != null && (
                      <MetricRow label="Sanctioned Cost" mono
                        value={`₹${(d.sanctioned_cost / 1_00_000).toFixed(1)} L`} />
                    )}
                    {d.financial_year && <MetricRow label="Financial Year" value={d.financial_year} />}
                    {d.status && <MetricRow label="Status" value={d.status.replace(/_/g, ' ')} />}
                    {d.confidence != null && <MetricRow label="Model Confidence" value={d.confidence} highlight />}
                    {d.evidence_count != null && <MetricRow label="Evidence Signals" value={d.evidence_count} />}
                  </div>
                </Section>
              )}

              {/* Evidence-First: WHY THIS IS HIGH */}
              {data && score >= 60 && (
                <Section title="Why This Risk Score Is High">
                  <div className="mb-3 p-2.5 rounded-md bg-amber-50 border border-amber-200/80">
                    <p className="text-[10.5px] font-medium text-amber-800 leading-relaxed">
                      {d.evidence_count != null
                        ? `Risk score computed from ${d.evidence_count} independent signals. Each contributing factor is shown below.`
                        : 'Risk score computed from independent model signals with verifiable evidence.'}
                    </p>
                  </div>
                  {d.risk_factors?.length > 0 ? (
                    <div>
                      {d.risk_factors.map((f, i) => (
                        <EvidenceFactor key={i} {...f} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-slate-500 font-medium">
                      The full contributing-factor breakdown, with evidence for each signal,
                      is on the project dossier.
                    </p>
                  )}
                  {d.evidence_count != null && (
                    <div className="mt-3 flex items-center gap-3 text-[10.5px] text-slate-500 font-medium">
                      <span>Independent Signals: <strong className="text-slate-800">{d.evidence_count}</strong></span>
                    </div>
                  )}
                </Section>
              )}

              {/* Timeline */}
              {d.timeline?.length > 0 && (
                <Section title="Activity Timeline">
                  <div>
                    {d.timeline.map((t, i) => (
                      <TimelineItem key={i} {...t} />
                    ))}
                  </div>
                </Section>
              )}

              {/* Related Records */}
              {d.related?.length > 0 && (
                <Section title="Related Records">
                  <div className="space-y-1.5">
                    {d.related.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-200/80 px-3 py-2">
                        <div>
                          <p className="text-[11.5px] font-semibold text-slate-800 truncate">{r.label}</p>
                          <p className="text-[10px] text-slate-500">{r.type}</p>
                        </div>
                        {r.href && (
                          <Link to={r.href} className="text-[10.5px] font-semibold text-blue-700 hover:text-blue-900 shrink-0 ml-3">
                            View →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* AI Disclaimer */}
              <div className="px-5 py-4">
                <div className="rounded-md bg-slate-50 border border-slate-200/80 px-3 py-2.5">
                  <p className="text-[9.5px] text-slate-500 leading-relaxed">
                    <strong className="text-slate-600">Note:</strong> Risk signals are model assessments for review prioritization. They are not findings of fraud or misconduct. Final decisions rest with authorized officers.
                  </p>
                </div>
              </div>
            </div>

            {/* Sticky Footer Actions */}
            <div className="border-t border-slate-200 px-5 py-3.5 bg-slate-50/80 shrink-0 flex items-center gap-2.5">
              {type === 'project' && d.id && (
                <Link
                  to={`/projects/${d.id}`}
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2 text-[11.5px] font-semibold text-white transition-colors"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  Open Project Dossier
                </Link>
              )}
              {(type === 'project' || type === 'district') && (
                <Link
                  to="/investigations/queue"
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-[11.5px] font-semibold text-slate-700 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7"/>
                    <path d="M21 21l-4.35-4.35M11 8v3l2 2" strokeLinecap="round"/>
                  </svg>
                  Open Investigation
                </Link>
              )}
              {type === 'alert' && (
                <>
                  <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2 text-[11.5px] font-semibold text-white transition-colors">
                    Acknowledge
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-4 py-2 text-[11.5px] font-semibold text-amber-800 transition-colors">
                    Escalate
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
