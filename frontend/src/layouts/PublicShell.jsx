import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { authApi, getToken, setToken } from '../services/api'
import { DrishtiLogo } from '../components/ui/BrandLogo'
import CitizenReportModal from '../components/public/CitizenReportModal'
import CitizenReportTrackerModal from '../components/public/CitizenReportTrackerModal'

/* Public transparency access is served through the seeded read-only viewer
   account (documented demo credential — synthetic prototype only). The
   backend enforces viewer RBAC server-side: read-only, no uploads, no audit. */
const PUBLIC_VIEWER = { email: 'officer@mplads.demo', password: 'Demo@1234' }

function usePublicSession() {
  const [ready, setReady] = useState(() => !!getToken())
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const ensure = async () => {
      if (getToken()) {
        setReady(true)
        return
      }
      try {
        const data = await authApi.login(PUBLIC_VIEWER.email, PUBLIC_VIEWER.password)
        if (!cancelled) {
          setToken(data.access_token)
          setFailed(false)
          setReady(true)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    ensure()
    // If a token expires mid-visit the API interceptor clears it and fires
    // this event; silently re-establish the public read-only session.
    const onUnauthorized = () => {
      setReady(false)
      ensure()
    }
    window.addEventListener('mplads:unauthorized', onUnauthorized)
    return () => {
      cancelled = true
      window.removeEventListener('mplads:unauthorized', onUnauthorized)
    }
  }, [])

  return { ready, failed }
}

function DrishtiPublicLogo() {
  return <DrishtiLogo subtitle="Public Transparency Portal" />
}

const PUBLIC_NAV = [
  { to: '/public/overview', label: 'Overview' },
  { to: '/public/projects', label: 'Projects' },
  { to: '/public/map', label: 'Geography' },
  { to: '/public/reports', label: 'Reports' },
  { to: '/public/methodology', label: 'Methodology' },
]

export default function PublicShell() {
  const { ready, failed } = usePublicSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [isTrackerModalOpen, setIsTrackerModalOpen] = useState(false)
  const [activeTrackingRefId, setActiveTrackingRefId] = useState('')

  return (
    <div className="min-h-screen w-full bg-[#F7F9FC] text-slate-900 font-sans select-none flex flex-col justify-between">
      {/* ═══════════════════════════════════════════════════════════════
         PUBLIC PORTAL HEADER
         ═══════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md px-5 lg:px-10 py-3 transition-all shadow-2xs">
        <div className="mx-auto flex max-w-[1850px] items-center justify-between">
          <Link to="/public/overview" className="flex items-center gap-3">
            <DrishtiPublicLogo />
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-4 lg:gap-7 text-xs font-semibold text-slate-600 whitespace-nowrap">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `transition-colors py-1 border-b-2 ${
                    isActive
                      ? 'border-blue-700 font-bold text-blue-700'
                      : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            {/* Direct Shortcut to Report Issue */}
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-1.5 py-1 text-xs font-bold text-blue-700 hover:text-blue-900 transition-colors border-b-2 border-transparent hover:border-blue-700 cursor-pointer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
              <span>Report an Issue</span>
            </button>
          </nav>

          {/* Right Action & Portal Switcher */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 text-xs transition-colors shadow-2xs"
            >
              <span>Report Issue</span>
              <span className="font-mono text-xs">→</span>
            </button>

            <span className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold font-mono text-emerald-800 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-live" />
              PUBLIC PORTAL
            </span>

            <Link to="/login">
              <button className="flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm whitespace-nowrap">
                <span className="hidden lg:inline">Authorized Government Console</span>
                <span className="lg:hidden">Authorized Console</span>
                <span className="font-mono text-xs">→</span>
              </button>
            </Link>

            {/* Mobile Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg border border-slate-200 text-slate-600"
              aria-label="Toggle menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden pt-3 pb-2 border-t border-slate-100 mt-3 space-y-1">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2 text-xs font-bold rounded-lg ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                setIsReportModalOpen(true)
              }}
              className="w-full text-left block px-3 py-2 text-xs font-bold rounded-lg text-blue-700 bg-blue-50/70 hover:bg-blue-100"
            >
              ⚠️ Report an Issue
            </button>
          </div>
        )}
      </header>

      {/* ═══════════════════════════════════════════════════════════════
         PUBLIC PORTAL MAIN CONTENT VIEWPORT
         ═══════════════════════════════════════════════════════════════ */}
      <main className="flex-1 py-6 px-5 lg:px-10 max-w-[1850px] w-full mx-auto">
        {failed ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-sm font-bold text-slate-900">Public data service unavailable</div>
            <p className="text-xs text-slate-500">
              The public information service could not be reached. Please try again later.
            </p>
          </div>
        ) : ready ? (
          <Outlet />
        ) : (
          <div className="p-10 text-center text-slate-500 font-mono text-xs">
            Connecting to the public information service…
          </div>
        )}
      </main>

      {/* ═══════════════════════════════════════════════════════════════
         PUBLIC PORTAL FOOTER
         ═══════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-slate-200 bg-white py-10 px-5 lg:px-10 text-xs text-slate-500 font-mono">
        <div className="mx-auto max-w-[1850px] space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-8 pb-6 border-b border-slate-100">
            <div className="space-y-2 max-w-md">
              <DrishtiPublicLogo />
              <p className="text-[11px] text-slate-600 font-sans leading-relaxed pt-1">
                Public information &amp; programme transparency portal (prototype demonstration). Data displayed here is synthetic and provided for informational and oversight-transparency demonstration purposes.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-2">PUBLIC PORTAL</div>
                <ul className="space-y-1.5 font-sans text-[11.5px]">
                  <li><Link to="/public/overview" className="hover:text-blue-700 transition-colors">Overview</Link></li>
                  <li><Link to="/public/projects" className="hover:text-blue-700 transition-colors">Project Explorer</Link></li>
                  <li><Link to="/public/map" className="hover:text-blue-700 transition-colors">Public Geography</Link></li>
                </ul>
              </div>

              <div>
                <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-2">REPORTS &amp; METHODOLOGY</div>
                <ul className="space-y-1.5 font-sans text-[11.5px]">
                  <li><Link to="/public/reports" className="hover:text-blue-700 transition-colors">Programme Reports</Link></li>
                  <li><Link to="/public/methodology" className="hover:text-blue-700 transition-colors">Data Methodology</Link></li>
                  <li><Link to="/public/methodology" className="hover:text-blue-700 transition-colors">Data Limitations</Link></li>
                </ul>
              </div>

              <div>
                <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-2">AUTHORIZED CONSOLE</div>
                <ul className="space-y-1.5 font-sans text-[11.5px]">
                  <li><Link to="/login" className="hover:text-blue-700 transition-colors font-bold text-slate-800">Authorized Sign In →</Link></li>
                  <li><span className="text-slate-400">Restricted Access</span></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 text-[10.5px]">
            <div>
              DRISHTI · Public Transparency Portal — Demonstration / Prototype Environment
            </div>
            <div>
              Prototype dataset — synthetic data · Not an official government service
            </div>
          </div>
        </div>
      </footer>

      {/* Global Public Citizen Report Modals */}
      <CitizenReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onOpenTracker={(refId) => {
          setActiveTrackingRefId(refId)
          setIsTrackerModalOpen(true)
        }}
      />

      <CitizenReportTrackerModal
        isOpen={isTrackerModalOpen}
        onClose={() => setIsTrackerModalOpen(false)}
        initialRefId={activeTrackingRefId}
      />
    </div>
  )
}
