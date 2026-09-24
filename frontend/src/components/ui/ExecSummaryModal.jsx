import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { dashboardApi } from '../../services/api'

/* ═══════════════════════════════════════════════════════════════════
   Executive Summary Modal — DRISHTI Platform
   ─ Positioned near viewport top with internal scroll (Issue 2 fix)
   ─ PDF export uses ReportLab backend, not window.print() (Issue 1 fix)
   ─ All data from GET /api/v1/dashboard/executive-summary (no hardcoding)
═══════════════════════════════════════════════════════════════════ */

const fmt = {
  crore: (n) => n != null ? `₹${(n / 1e7).toFixed(2)} Cr` : '—',
  pct:   (n) => n != null ? `${n}%` : '—',
  int:   (n) => n != null ? Number(n).toLocaleString('en-IN') : '—',
  ts:    (s) => s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—',
}

const RISK_COLOR = {
  critical: '#dc2626', high: '#ea580c', elevated: '#f97316',
  moderate: '#f59e0b', low: '#64849a',
}
const RISK_BG = {
  critical: '#fef2f2', high: '#fff3e0', elevated: '#fff7ed',
  moderate: '#fffbeb', low: '#f0f4f8',
}

/* ── Small helpers ─────────────────────────────────────────────────── */
function Divider() {
  return <div style={{ borderTop: '1px solid #e2e6ed', margin: '18px 0' }} />
}

function SectionLabel({ n, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      {n && (
        <span style={{
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
          fontSize: 9, fontWeight: 700, color: '#8aa4be',
          background: '#f0f4f8', border: '1px solid #e2e6ed',
          borderRadius: 3, padding: '1px 5px', flexShrink: 0,
        }}>
          {String(n).padStart(2, '0')}
        </span>
      )}
      <span style={{
        fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        fontSize: 9, fontWeight: 700, color: '#3d5270',
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        {children}
      </span>
    </div>
  )
}

function KpiRow({ label, value, sub, accent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 0', borderBottom: '1px solid #f0f3f7',
    }}>
      <span style={{ fontSize: 12, color: '#3d4f6a', fontWeight: 500 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
          fontSize: 13, fontWeight: 700, color: accent ?? '#0d1b2e',
        }}>{value}</span>
        {sub && <div style={{ fontSize: 10, color: '#8aa4be', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

function RiskBadge({ level }) {
  const l = (level ?? 'low').toLowerCase()
  return (
    <span style={{
      fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: RISK_COLOR[l] ?? '#64849a', background: RISK_BG[l] ?? '#f0f4f8',
      border: `1px solid ${RISK_COLOR[l] ?? '#b8ccde'}`,
      borderRadius: 3, padding: '2px 6px',
    }}>
      {l}
    </span>
  )
}

function Meta({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        fontSize: 8.5, fontWeight: 600, color: '#3d5270',
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>{label}:</span>
      <span style={{
        fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        fontSize: 8.5, fontWeight: 700, color: '#8aa4be',
      }}>{value}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Main modal component
═══════════════════════════════════════════════════════════════════ */
export default function ExecSummaryModal({ open, onClose, data, loading, error }) {
  const contentRef = useRef(null)
  const [pdfLoading, setPdfLoading] = [
    typeof window !== 'undefined' ? window.__execPdfLoading : false,
    typeof window !== 'undefined' ? (v) => { window.__execPdfLoading = v } : () => {},
  ]

  /* Use local state properly */
  const [isPdfLoading, setIsPdfLoading] = [
    /* we use a simple ref trick — the component re-renders via parent state */
    false, () => {},
  ]

  const handlePdfDownload = useCallback(async () => {
    try {
      const blob = await dashboardApi.exportPdf()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'DRISHTI_Executive_Summary.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('PDF generation failed. Please try again.')
    }
  }, [])

  /* Keyboard close */
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  /* Lock body scroll while open; restore on close */
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  /* Focus content area on open */
  useEffect(() => {
    if (open) {
      setTimeout(() => contentRef.current?.focus(), 120)
    }
  }, [open])

  const d = data

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop */}
          <motion.div
            key="exec-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(6,13,26,0.55)',
              zIndex: 10000,
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* ── Modal panel — top-anchored, internal scroll */}
          <motion.div
            key="exec-panel"
            ref={contentRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Executive Summary"
            aria-modal="true"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,   scale: 1 }}
            exit={{    opacity: 0, y: -10,  scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              /* ── POSITION: near top of viewport (Issue 2 fix) ── */
              position: 'fixed',
              top: '72px',
              left: '50%',
              transform: 'translateX(-50%)',
              /* ── SIZE ── */
              width: 'clamp(320px, 90vw, 760px)',
              height: 'calc(100vh - 96px)',
              maxHeight: 'calc(100vh - 96px)',
              /* ── STRUCTURE: flex column so header is sticky ── */
              display: 'flex',
              flexDirection: 'column',
              /* ── STYLE ── */
              borderRadius: 10,
              background: '#ffffff',
              boxShadow: '0 24px 64px -8px rgba(13,27,46,0.22), 0 8px 24px -4px rgba(13,27,46,0.12)',
              border: '1px solid rgba(94,120,152,0.18)',
              outline: 'none',
              zIndex: 10001,
              overflow: 'hidden',
            }}
          >
            {/* ── Sticky header (always visible while scrolling) */}
            <div style={{
              background: 'linear-gradient(160deg, #0b1220 0%, #162033 100%)',
              padding: '16px 20px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                    fontSize: 8, fontWeight: 700, color: '#3d5270',
                    letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4,
                  }}>
                    DRISHTI · National Risk &amp; Intelligence Platform
                  </div>
                  <div style={{
                    fontSize: 17, fontWeight: 800, color: '#eef4f9',
                    letterSpacing: '-0.01em', lineHeight: 1,
                  }}>
                    Executive Summary
                  </div>
                  {d && (
                    <div style={{ display: 'flex', gap: 14, marginTop: 7, flexWrap: 'wrap' }}>
                      <Meta label="Scope"     value={(d.scope ?? 'national').toUpperCase()} />
                      <Meta label="Generated" value={fmt.ts(d.generated_at)} />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0 }}>
                  {/* PDF download button */}
                  {d && !loading && (
                    <button
                      onClick={handlePdfDownload}
                      aria-label="Download Executive Summary as PDF"
                      style={{
                        fontFamily: 'Inter, ui-sans-serif, sans-serif',
                        fontSize: 11, fontWeight: 600, color: '#8aa4be',
                        background: 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 5,
                        transition: 'color 0.14s, background 0.14s',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#c2d3e4'; e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#8aa4be'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Download PDF
                    </button>
                  )}

                  {/* Close button */}
                  <button
                    onClick={onClose}
                    aria-label="Close executive summary"
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6, width: 30, height: 30,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#3d5270',
                      transition: 'color 0.14s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#c2d3e4'}
                    onMouseLeave={e => e.currentTarget.style.color = '#3d5270'}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Scrollable content area (Issue 2 fix: only this scrolls) */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}>

              {/* Loading */}
              {loading && (
                <div style={{ textAlign: 'center', padding: '52px 0', color: '#7a8fa8' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                    fontSize: 11, letterSpacing: '0.1em', marginBottom: 8,
                  }}>
                    PREPARING EXECUTIVE SUMMARY…
                  </div>
                  <div style={{ fontSize: 12, color: '#a8bace' }}>
                    Fetching live data from backend
                  </div>
                </div>
              )}

              {/* Error */}
              {!loading && error && (
                <div style={{ padding: '24px' }}>
                  <div style={{
                    border: '1px solid #fca5a5', background: '#fef2f2',
                    borderRadius: 7, padding: '16px 18px', color: '#991b1b',
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                      fontSize: 10, fontWeight: 700, marginBottom: 4,
                    }}>
                      UNABLE TO GENERATE SUMMARY
                    </div>
                    <div style={{ fontSize: 12 }}>
                      {error?.response?.data?.detail ?? error?.message ?? 'An error occurred. Please try again.'}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Report content ──────────────────────────────────────── */}
              {!loading && !error && d && (
                <div style={{ padding: '20px 24px 24px' }}>

                  {/* 01. Executive Situation */}
                  <SectionLabel n={1}>Executive Situation</SectionLabel>
                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e6ed',
                    borderRadius: 7, padding: '12px 16px', marginBottom: 4,
                  }}>
                    <p style={{ fontSize: 12.5, lineHeight: 1.75, color: '#3d4f6a', margin: 0 }}>
                      The MPLADS portfolio under this scope contains{' '}
                      <strong style={{ color: '#0d1b2e' }}>
                        {fmt.int(d.overview?.total_projects)} projects
                      </strong>{' '}
                      with a total sanctioned outlay of{' '}
                      <strong style={{ color: '#0d1b2e' }}>
                        {fmt.crore(d.overview?.total_sanctioned)}
                      </strong>.{' '}
                      Fund utilization stands at{' '}
                      <strong style={{ color: '#047857' }}>
                        {fmt.pct(d.overview?.utilization_pct)}
                      </strong>{' '}
                      ({fmt.crore(d.overview?.total_expenditure)} expended).{' '}
                      {d.risk?.critical_count > 0 && (
                        <>
                          <strong style={{ color: '#dc2626' }}>
                            {d.risk.critical_count} critical-risk project{d.risk.critical_count !== 1 ? 's' : ''}
                          </strong>{' '}require immediate attention.{' '}
                        </>
                      )}
                      {d.signals?.open_alerts > 0 && (
                        <>
                          <strong style={{ color: '#ea580c' }}>
                            {fmt.int(d.signals.open_alerts)} active alert{d.signals.open_alerts !== 1 ? 's' : ''}
                          </strong>{' '}are currently open.
                        </>
                      )}
                    </p>
                  </div>

                  <Divider />

                  {/* 02. Key Risk Indicators */}
                  <SectionLabel n={2}>Key Risk Indicators</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
                    {[
                      { label: 'Critical Risk Projects', value: fmt.int(d.risk?.critical_count), accent: '#dc2626' },
                      { label: 'High Risk Projects',     value: fmt.int(d.risk?.high_risk_count), accent: '#ea580c' },
                      { label: 'Moderate Risk Projects', value: fmt.int(d.risk?.moderate_count) },
                      { label: 'Open Alerts',            value: fmt.int(d.signals?.open_alerts), accent: '#b45309' },
                    ].map(({ label, value, accent }) => (
                      <div key={label} style={{
                        background: '#f8fafc', border: '1px solid #e2e6ed',
                        borderRadius: 6, padding: '10px 14px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 11.5, color: '#3d4f6a', fontWeight: 500 }}>{label}</span>
                        <span style={{
                          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                          fontSize: 16, fontWeight: 800, color: accent ?? '#0d1b2e',
                          letterSpacing: '-0.02em',
                        }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* AI Anomaly signals */}
                  {d.signals?.anomaly_counts && Object.keys(d.signals.anomaly_counts).length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{
                        fontSize: 10, color: '#7a8fa8', fontWeight: 600,
                        marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>
                        AI Anomaly Signals
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(d.signals.anomaly_counts).map(([k, v]) => (
                          <span key={k} style={{
                            fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                            fontSize: 10, fontWeight: 600, color: '#1a56db',
                            background: '#eff4ff', border: '1px solid #bfcffe',
                            borderRadius: 4, padding: '2px 8px',
                          }}>
                            {k.replace(/_/g, ' ')}: {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <Divider />

                  {/* 03. Financial Position */}
                  <SectionLabel n={3}>Financial Position</SectionLabel>
                  <KpiRow label="Total Sanctioned"            value={fmt.crore(d.overview?.total_sanctioned)} />
                  <KpiRow label="Expenditure Released"        value={fmt.crore(d.overview?.total_expenditure)} sub={`${fmt.pct(d.overview?.utilization_pct)} utilization`} accent="#047857" />
                  <KpiRow label="Unspent Balance"             value={fmt.crore(d.overview?.unspent_balance)} accent="#94a3b8" />
                  {(d.overview?.delayed_projects ?? 0) > 0 && (
                    <KpiRow label="Delayed / At-Risk Projects" value={fmt.int(d.overview.delayed_projects)} accent="#ea580c" />
                  )}

                  <Divider />

                  {/* 04. Priority Review Queue */}
                  {d.priority_projects?.length > 0 && (
                    <>
                      <SectionLabel n={4}>Priority Review Queue</SectionLabel>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e6ed' }}>
                              {['Risk', 'Project', 'Location', 'Exposure'].map((h, i) => (
                                <th key={h} style={{
                                  fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                                  fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase',
                                  letterSpacing: '0.1em', color: '#7a8fa8',
                                  padding: '7px 10px', textAlign: i > 2 ? 'right' : 'left',
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {d.priority_projects.map((p, i) => (
                              <tr key={p.project_id ?? i} style={{ borderBottom: '1px solid #f0f3f7' }}>
                                <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{
                                      fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                                      fontSize: 14, fontWeight: 800,
                                      color: RISK_COLOR[(p.risk_level ?? 'low').toLowerCase()] ?? '#64849a',
                                    }}>
                                      {p.risk_score != null ? Math.round(p.risk_score) : '—'}
                                    </span>
                                    <RiskBadge level={p.risk_level} />
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px', verticalAlign: 'middle', maxWidth: 220 }}>
                                  <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0d1b2e', lineHeight: 1.3 }}>{p.title}</div>
                                  <div style={{ fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 9.5, color: '#8aa4be', marginTop: 2 }}>{p.code}</div>
                                </td>
                                <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: '#3d4f6a', whiteSpace: 'nowrap' }}>{p.district}</div>
                                  <div style={{ fontSize: 10, color: '#8aa4be', whiteSpace: 'nowrap' }}>{p.state}</div>
                                </td>
                                <td style={{ padding: '8px 10px', verticalAlign: 'middle', textAlign: 'right' }}>
                                  <span style={{ fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 12, fontWeight: 700, color: '#0d1b2e' }}>
                                    {p.sanctioned_cost != null ? `₹${(p.sanctioned_cost / 1e5).toFixed(1)} L` : '—'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Divider />
                    </>
                  )}

                  {/* 05. State Performance */}
                  {d.top_risk_states?.length > 0 && (
                    <>
                      <SectionLabel n={5}>State Performance (Risk Exposure)</SectionLabel>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e6ed' }}>
                            {['#', 'State', 'Avg Risk', 'Utilization', 'Critical'].map((h, i) => (
                              <th key={h} style={{
                                fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                                fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.1em', color: '#7a8fa8',
                                padding: '7px 10px', textAlign: i >= 2 ? 'right' : 'left',
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d.top_risk_states.map((s, i) => (
                            <tr key={s.state_id ?? s.state ?? i} style={{ borderBottom: '1px solid #f0f3f7' }}>
                              <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 10, color: '#8aa4be', fontWeight: 700 }}>
                                {String(i + 1).padStart(2, '0')}
                              </td>
                              <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600, color: '#0d1b2e' }}>
                                {s.state ?? s.state_name}
                              </td>
                              <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 12, fontWeight: 700, color: '#ea580c', textAlign: 'right' }}>
                                {s.avg_risk ?? '—'}
                              </td>
                              <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 12, fontWeight: 700, color: '#047857', textAlign: 'right' }}>
                                {s.utilization_pct != null ? `${s.utilization_pct}%` : '—'}
                              </td>
                              <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 12, fontWeight: 700, textAlign: 'right', color: (s.critical_count ?? 0) > 0 ? '#dc2626' : '#94a3b8' }}>
                                {s.critical_count ?? 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Divider />
                    </>
                  )}

                  {/* 06. Recent Alerts */}
                  {d.recent_alerts?.length > 0 && (
                    <>
                      <SectionLabel n={6}>Recent High-Priority Alerts</SectionLabel>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {d.recent_alerts.map((a, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12,
                            background: '#f8fafc', border: '1px solid #e2e6ed',
                            borderRadius: 6, padding: '10px 14px',
                          }}>
                            <div style={{ flexShrink: 0 }}>
                              <RiskBadge level={a.severity} />
                              <div style={{
                                fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                                fontSize: 14, fontWeight: 800,
                                color: RISK_COLOR[(a.severity ?? 'low').toLowerCase()], marginTop: 4,
                              }}>
                                {a.risk_score != null ? Math.round(a.risk_score) : '—'}
                              </div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#0d1b2e', marginBottom: 2 }}>{a.reason}</div>
                              <div style={{ fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 9.5, color: '#8aa4be' }}>
                                {a.project_code} · {[a.district, a.state].filter(Boolean).join(', ')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Divider />
                    </>
                  )}

                  {/* 07. Data Context */}
                  <SectionLabel n={7}>Data &amp; Model Context</SectionLabel>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e6ed', borderRadius: 6, padding: '10px 14px' }}>
                    <KpiRow label="Data Quality Issues" value={fmt.int(d.signals?.data_quality_issues)} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Governance footer — fixed at bottom of modal */}
            {!loading && !error && d && (
              <div style={{
                borderTop: '1px solid #e2e6ed', background: '#f4f6f9',
                padding: '10px 20px', flexShrink: 0,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, opacity: 0.5 }}>
                  <circle cx="8" cy="8" r="7" stroke="#5a7290" strokeWidth="1.5"/>
                  <path d="M8 7v4" stroke="#5a7290" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="8" cy="5" r="0.75" fill="#5a7290"/>
                </svg>
                <p style={{ margin: 0, fontSize: 10, color: '#8aa4be', lineHeight: 1.5 }}>
                  {d.disclaimer}
                  {d.dataset_note && <> · <em>{d.dataset_note}</em></>}
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
