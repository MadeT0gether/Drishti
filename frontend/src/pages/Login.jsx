import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../hooks/useAuth'
import { DrishtiMark, DrishtiTagline } from '../components/ui/BrandLogo'

/* Access roles — mirrors the SIH demo storyboard (MoSPI → Officer).
   Selecting a tab pre-fills that role's demo identity. */
const ACCESS_ROLES = [
  {
    id: 'MoSPI',
    email: 'ministry@mplads.demo',
    blurb: 'Ministry of Statistics & Programme Implementation — national monitoring and policy oversight',
  },
  {
    id: 'SNA',
    email: 'state.mh@mplads.demo',
    blurb: 'State Nodal Authority — Maharashtra coordination & monitoring',
  },
  {
    id: 'District',
    email: 'district.pune@mplads.demo',
    blurb: 'District Authority — Pune sanction, review & action',
  },
  {
    id: 'MP',
    email: 'mp.pune@mplads.demo',
    blurb: 'Member of Parliament — Hon. Shiv Pune constituency works',
  },
  {
    id: 'Officer',
    email: 'officer@mplads.demo',
    blurb: 'Monitoring Officer — review & investigation support',
  },
]

const DEMO_PASSWORD = 'Demo@1234'

export default function Login() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [activeRole, setActiveRole] = useState(ACCESS_ROLES[0])
  const [email, setEmail] = useState(ACCESS_ROLES[0].email)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [authSuccess, setAuthSuccess] = useState(false)

  if (!loading && user) return <Navigate to="/command-center" replace />

  const selectRole = (role) => {
    setActiveRole(role)
    setEmail(role.email)
    setPassword('')
    setError('')
  }

  const onSubmit = async (e) => {
    e?.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      setAuthSuccess(true)
      setTimeout(() => {
        navigate('/command-center', { replace: true })
      }, 400)
    } catch (err) {
      setError(
        err.response?.status === 401
          ? 'Invalid official credentials. Please verify your official email and password.'
          : 'Unable to connect to authorization server. Ensure the backend security gateway is reachable.'
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#060d1a] px-4 py-10 font-sans text-slate-100 select-none">
      {/* ── Return home ── */}
      <Link
        to="/"
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-300 backdrop-blur transition-all hover:border-slate-500 hover:text-white sm:left-6 sm:top-6"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Home</span>
      </Link>
      {/* ── Backdrop: constellation network + bar-chart skyline ── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <svg className="absolute inset-x-0 top-0 h-[45%] w-full opacity-70" preserveAspectRatio="none" viewBox="0 0 1200 380">
          <g stroke="rgba(148,184,220,0.35)" strokeWidth="1">
            <path d="M 80,300 L 240,180 L 420,230 L 600,120 L 780,200 L 960,90 L 1120,170" fill="none" />
            <path d="M 240,180 L 420,230 M 600,120 L 780,200 M 240,180 L 600,120" opacity="0.6" />
          </g>
          <g fill="rgba(170,200,230,0.8)">
            {[[80,300],[240,180],[420,230],[600,120],[780,200],[960,90],[1120,170]].map(([x,y]) => (
              <g key={`${x}-${y}`}>
                <circle cx={x} cy={y} r="4" />
                <circle cx={x} cy={y} r="9" fill="none" stroke="rgba(170,200,230,0.4)" strokeWidth="1" />
              </g>
            ))}
          </g>
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex h-[30%] items-end justify-center gap-3 px-10 opacity-60">
          {[38, 62, 30, 74, 52, 88, 44, 68, 56, 80, 36, 64, 48, 72, 58, 84, 40, 66].map((h, i) => (
            <div
              key={i}
              className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-[#2b4a73]/90 to-[#3f6896]/60"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-blue-800/20 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center"
      >
        {/* ── Brand ── */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-xl">
          <DrishtiMark className="h-13 w-13" />
        </div>
        <div
          className="mt-3 text-[26px] font-bold uppercase tracking-[0.18em] text-white"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          DRISHTI
        </div>
        <DrishtiTagline className="mt-1.5 justify-center" />
        <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
          Centralized Monitoring &amp; Accountability Portal for MPLADS
        </p>

        {/* ── Access card ── */}
        <div className="mt-6 w-full rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Access Role
          </div>

          {/* Role tabs */}
          <div className="mt-2 grid grid-cols-5 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Access role">
            {ACCESS_ROLES.map((role) => {
              const active = role.id === activeRole.id
              return (
                <button
                  key={role.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectRole(role)}
                  className={`rounded-md px-1 py-1.5 text-[10.5px] font-bold transition-all ${
                    active
                      ? 'bg-white text-slate-900 shadow'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {role.id}
                </button>
              )
            })}
          </div>
          <p className="mt-2 min-h-7 text-[10.5px] leading-snug text-slate-500" aria-live="polite">
            {activeRole.blurb}
          </p>

          <form onSubmit={onSubmit} className="mt-1 space-y-3" noValidate>
            <div>
              <label htmlFor="email" className="sr-only">Official email address</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="official@example.gov.in"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Secure password"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || authSuccess}
              className={`flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 py-3 px-4 text-xs font-bold text-white transition-all hover:bg-slate-800 active:scale-[0.99] ${
                submitting || authSuccess ? 'cursor-wait opacity-90' : ''
              }`}
            >
              {authSuccess ? (
                <span className="text-emerald-400">Authenticated ✓ Redirecting...</span>
              ) : submitting ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Internal Login</span>
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setShowHint(!showHint)}
            className="mt-2.5 w-full text-center text-[11px] font-semibold text-blue-700 hover:text-blue-800"
          >
            Forgot access credentials?
          </button>
          {showHint && (
            <p className="mt-1.5 rounded-lg bg-blue-50 p-2.5 text-center text-[11px] leading-relaxed text-blue-900">
              Demo build — every role signs in with password <span className="font-mono font-bold">{DEMO_PASSWORD}</span>.
              Just pick a role tab above.
            </p>
          )}

          <p className="mt-3 border-t border-slate-100 pt-3 text-center text-[10px] leading-relaxed text-slate-400">
            Secure authentication for authorized government officers and oversight authorities.
          </p>
        </div>

        {/* ── Divider ── */}
        <div className="mt-4 flex w-full items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          <span className="h-px flex-1 bg-slate-700/60" />
          OR
          <span className="h-px flex-1 bg-slate-700/60" />
        </div>

        {/* ── Public entry ── */}
        <Link
          to="/public"
          className="mt-4 flex w-full flex-col items-center rounded-xl bg-white/95 py-3 shadow-lg transition-all hover:bg-white"
        >
          <span className="text-xs font-bold text-slate-900">⊙ Continue as Public Viewer</span>
          <span className="mt-0.5 text-[10.5px] text-slate-500">Transparent Monitoring for Citizens</span>
        </Link>
      </motion.div>
    </div>
  )
}
