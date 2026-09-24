import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { copilotApi } from '../../services/api'
import SakshiLoader from './SakshiLoader'

/* ═══════════════════════════════════════════════════════════════════
   Sakshi — AI Investigation Copilot  ·  DRISHTI Platform v2
   Institutional floating assistant, authenticated console only.
   Mounted once in AppShell — persists across all console routes.
═══════════════════════════════════════════════════════════════════ */

const T = {
  navy950: '#060d1a',
  navy900: '#0b1220',
  navy800: '#0f1a2e',
  navy700: '#162033',
  navy600: '#1e2d45',
  navy500: '#2a3d59',
  navy400: '#3d5270',
  navy300: '#5a7290',
  navy200: '#8aa4be',
  navy100: '#c2d3e4',
  navy50:  '#eef4f9',
  accent:  '#1a56db',
  accentH: '#1648c9',
  accentActive: '#1240b8',
  accentSoft: '#eff4ff',
  accentMuted: '#dce8ff',
  accentBorder: '#bfcffe',
  textPrimary:   '#0d1b2e',
  textSecondary: '#3d4f6a',
  textMuted:     '#7a8fa8',
  border:  '#e2e6ed',
  surfaceWash: '#f4f6f9',
  shadowPanel:
    '0 20px 48px -8px rgba(13,27,46,0.18), 0 8px 16px -4px rgba(13,27,46,0.10), 0 2px 4px 0 rgba(13,27,46,0.06)',
}

function SakshiMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="9" stroke="#3d5270" strokeWidth="1" />
      <path
        d="M7 7.5C7 6.67 7.67 6 8.5 6h3C12.33 6 13 6.67 13 7.5S12.33 9 11.5 9h-3C7.67 9 7 9.67 7 10.5S7.67 12 8.5 12h3c.83 0 1.5.67 1.5 1.5S12.33 15 11.5 15h-3"
        stroke="#8aa4be"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

function StatusDot({ active = true }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: active ? '#3b82f6' : '#94a3b8',
        flexShrink: 0,
        opacity: 0.9,
      }}
    />
  )
}

export default function SakshiCopilot() {
  const [open, setOpen] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusData, setStatusData] = useState(null)
  const navigate    = useNavigate()
  const panelRef    = useRef(null)
  const launcherRef = useRef(null)

  /* ── Draggable launcher ────────────────────────────────────────────
     The orb can be dragged anywhere so it never traps page controls
     (e.g. pagination) underneath it. Position persists in localStorage.
     A drag is distinguished from a click by a 6px movement threshold. */
  const ORB_SIZE = 56
  const EDGE_GAP = 12
  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('drishti.sakshi.pos'))
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved
    } catch { /* fresh default position */ }
    return null
  })
  const dragRef = useRef(null)
  const draggedRef = useRef(false)

  const clampPos = useCallback((x, y) => ({
    x: Math.min(Math.max(x, EDGE_GAP), Math.max(EDGE_GAP, window.innerWidth - ORB_SIZE - EDGE_GAP)),
    y: Math.min(Math.max(y, EDGE_GAP), Math.max(EDGE_GAP, window.innerHeight - ORB_SIZE - EDGE_GAP)),
  }), [])

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.moved && Math.hypot(dx, dy) < 6) return
      d.moved = true
      draggedRef.current = true
      setPos(clampPos(d.origX + dx, d.origY + dy))
    }
    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      if (d?.moved) {
        setPos((p) => {
          try { localStorage.setItem('drishti.sakshi.pos', JSON.stringify(p)) } catch { /* ignore */ }
          return p
        })
        // reset after the click event (which fires right after pointerup)
        // so the drag-ending click doesn't toggle the panel
        setTimeout(() => { draggedRef.current = false }, 0)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [clampPos])

  const onLauncherPointerDown = (e) => {
    const origin = pos ?? {
      x: window.innerWidth - 26 - ORB_SIZE,
      y: window.innerHeight - 26 - ORB_SIZE,
    }
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: origin.x, origY: origin.y, moved: false,
    }
  }

  const toggleOpen = useCallback(() => {
    if (draggedRef.current) return
    setOpen((v) => !v)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) {
      launcherRef.current?.focus()
    } else {
      setStatusLoading(true)
      copilotApi.status()
        .then((res) => setStatusData(res))
        .catch(() => {})
        .finally(() => setStatusLoading(false))
      const t = setTimeout(() => panelRef.current?.querySelector('button')?.focus(), 240)
      return () => clearTimeout(t)
    }
  }, [open])

  const goSmartQueue = useCallback(() => { setOpen(false); navigate('/investigations/queue') }, [navigate])
  const goMyCases    = useCallback(() => { setOpen(false); navigate('/investigations') }, [navigate])

  return (
    <>
      <style>{`
        .sk-launcher {
          pointer-events: auto;
          position: relative;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: none;
          outline: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #050a14;
          box-shadow:
            inset 0 2px 4px rgba(255, 235, 246, 0.38),
            inset 0 -6px 14px rgba(2, 6, 18, 0.8),
            0 14px 32px -4px rgba(3, 9, 23, 0.55),
            0 6px 12px -2px rgba(15, 23, 42, 0.35);
          transition:
            transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94),
            box-shadow 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94),
            filter 220ms ease;
        }
        .sk-orb-base {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 50%, #2e1065 0%, #1e1b4b 55%, #0f172a 100%);
          pointer-events: none;
          z-index: 1;
        }
        @keyframes sk-light-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .sk-orb-light-rotate {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background:
            radial-gradient(circle at 35% 22%, rgba(244, 204, 224, 0.55) 0%, rgba(192, 132, 252, 0.4) 25%, rgba(88, 28, 135, 0) 58%),
            radial-gradient(circle at 68% 75%, rgba(124, 58, 237, 0.45) 0%, rgba(15, 23, 42, 0) 65%);
          animation: sk-light-spin 6s linear infinite;
          pointer-events: none;
          z-index: 2;
        }
        .sk-orb-diffuse {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle at 38% 28%, rgba(255, 235, 246, 0.28) 0%, rgba(192, 132, 252, 0.2) 28%, rgba(4, 9, 20, 0.45) 85%);
          pointer-events: none;
          z-index: 3;
        }
        .sk-launcher:hover {
          transform: scale(1.03);
          filter: brightness(1.08);
          box-shadow:
            inset 0 2px 5px rgba(255, 240, 248, 0.48),
            inset 0 -6px 14px rgba(2, 6, 18, 0.82),
            0 18px 38px -4px rgba(3, 9, 23, 0.62),
            0 8px 16px -2px rgba(15, 23, 42, 0.4);
        }
        .sk-launcher:focus-visible {
          box-shadow:
            inset 0 2px 5px rgba(255, 240, 248, 0.5),
            0 0 0 2px rgba(255, 255, 255, 0.8),
            0 14px 32px -4px rgba(3, 9, 23, 0.55);
        }
        .sk-launcher:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) {
          .sk-orb-light-rotate { animation: none !important; }
        }
        .sk-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 4px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: #3d5270;
          transition: color 140ms ease, background 140ms ease;
          padding: 0;
          flex-shrink: 0;
        }
        .sk-close:hover { color: #c2d3e4; background: rgba(255,255,255,0.06); }
        .sk-close:focus-visible { outline: 2px solid rgba(96,165,250,0.5); outline-offset: 1px; }
        .sk-btn-p {
          flex: 1;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: #ffffff;
          background: #1a56db;
          border: 1px solid #1648c9;
          border-radius: 6px;
          padding: 0 14px;
          cursor: pointer;
          transition: background 160ms ease, box-shadow 160ms ease;
          white-space: nowrap;
        }
        .sk-btn-p:hover { background: #1648c9; box-shadow: 0 2px 8px rgba(26,86,219,0.28); }
        .sk-btn-p:active { background: #1240b8; box-shadow: none; }
        .sk-btn-p:focus-visible { outline: 2px solid #1a56db; outline-offset: 2px; }
        .sk-btn-s {
          flex: 1;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: #1a56db;
          background: #ffffff;
          border: 1px solid #bfcffe;
          border-radius: 6px;
          padding: 0 14px;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease;
          white-space: nowrap;
        }
        .sk-btn-s:hover { background: #eff4ff; border-color: #1a56db; }
        .sk-btn-s:active { background: #dce8ff; }
        .sk-btn-s:focus-visible { outline: 2px solid #1a56db; outline-offset: 2px; }
      `}</style>

      <div
        style={{
          position: 'fixed',
          ...(pos
            ? { left: pos.x, top: pos.y }
            : { bottom: 26, right: 26 }),
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              key="sakshi-panel"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{    opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
              role="dialog"
              aria-label="Sakshi AI Investigation Copilot"
              aria-modal="false"
              style={{
                pointerEvents: 'auto',
                width: 'clamp(292px, 88vw, 370px)',
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: T.shadowPanel,
                border: '1px solid rgba(94,120,152,0.20)',
                background: '#ffffff',
              }}
            >
              {/* Header */}
              <div
                style={{
                  background: 'linear-gradient(160deg, #0b1220 0%, #162033 100%)',
                  padding: '14px 16px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusDot />
                    <span style={{
                      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                      fontSize: 14.5,
                      fontWeight: 700,
                      color: '#eef4f9',
                      letterSpacing: '0.005em',
                      lineHeight: 1,
                    }}>
                      Sakshi
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                    fontSize: 8.5,
                    fontWeight: 600,
                    color: '#3d5270',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    paddingLeft: 11,
                  }}>
                    AI Investigation Copilot
                  </span>
                </div>
                <button className="sk-close" onClick={() => setOpen(false)} aria-label="Close Sakshi Copilot">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '16px 16px 14px', background: '#ffffff' }}>
                {statusLoading ? (
                  <SakshiLoader message="Connecting to AI Copilot engine..." />
                ) : (
                  <>
                    <p style={{
                      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: '#3d4f6a',
                      margin: '0 0 12px',
                    }}>
                      Sakshi answers inside an investigation case, grounded only in
                      that case&apos;s verified evidence and approved guidelines —
                      with citations, never ungrounded chat.
                    </p>
                    <p style={{
                      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#0d1b2e',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      margin: '0 0 9px',
                    }}>
                      Open a case to consult Sakshi
                    </p>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <button className="sk-btn-p" onClick={goSmartQueue}>Smart Queue</button>
                      <button className="sk-btn-s" onClick={goMyCases}>My Cases</button>
                    </div>
                  </>
                )}
              </div>

              {/* Governance footer */}
              <div style={{
                background: '#f4f6f9',
                borderTop: '1px solid #e2e6ed',
                padding: '7px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
              }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                  style={{ flexShrink: 0, marginTop: 1, opacity: 0.5 }}>
                  <circle cx="8" cy="8" r="7" stroke="#5a7290" strokeWidth="1.5" />
                  <path d="M8 7v4" stroke="#5a7290" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="5" r="0.75" fill="#5a7290" />
                </svg>
                <p style={{
                  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                  fontSize: 10,
                  color: '#8aa4be',
                  margin: 0,
                  lineHeight: 1.5,
                }}>
                  AI content is decision support only; final decisions remain with authorized officials.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <SakshiLauncher ref={launcherRef} open={open} onClick={toggleOpen} onPointerDown={onLauncherPointerDown} />
      </div>
    </>
  )
}

const SakshiLauncher = forwardRef(function SakshiLauncher({ open, onClick, onPointerDown }, ref) {
  return (
    <button
      ref={ref}
      className="sk-launcher"
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-label={open ? 'Close Sakshi Copilot' : 'Open Sakshi AI Investigation Copilot'}
      aria-expanded={open}
      title="Drag to move · click to open"
      style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="sk-orb-base" />
      <div className="sk-orb-light-rotate" />
      <div className="sk-orb-diffuse" />
      <span style={{
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: 10.5,
        fontWeight: 600,
        color: '#eef4f9',
        letterSpacing: '0.08em',
        textTransform: 'capitalize',
        lineHeight: 1,
        textShadow: '0 1px 3px rgba(3, 9, 23, 0.9), 0 0 8px rgba(192, 132, 252, 0.4)',
        position: 'relative',
        zIndex: 4,
      }}>
        Sakshi
      </span>
    </button>
  )
})
