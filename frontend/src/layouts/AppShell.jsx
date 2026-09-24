import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useAuth } from '../hooks/useAuth'
import { alertsApi, investigationsApi } from '../services/api'
import { SCOPE_BADGES, accessNote, canAccess } from '../utils/rbac'
import CommandPalette from '../components/ui/CommandPalette'
import { DrishtiMark } from '../components/ui/BrandLogo'
import SakshiCopilot from '../components/ui/SakshiCopilot'

const ROLE_LABELS = {
  ministry: 'Ministry Admin',
  state: 'State Authority',
  district: 'District Authority',
  mp: 'Member of Parliament',
  officer: 'Monitoring Officer',
  viewer: 'Viewer',
}

const SCOPE_INFO = {
  ministry: { title: 'National (HQ)', subtitle: 'Platform-wide administration' },
  officer: { title: 'National (Both Houses)', subtitle: 'Lok Sabha & Rajya Sabha 2024–25' },
  state: { title: 'State Scope', subtitle: 'All districts in your state' },
  district: { title: 'District Scope', subtitle: 'Your district works portfolio' },
  mp: { title: 'Constituency Scope', subtitle: 'Your MPLADS portfolio' },
  viewer: { title: 'Read-only', subtitle: 'Public transparency data' },
}

const initialsOf = (name) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '—'

/* ─── Inline SVG Icons ─────────────────────────────────────── */
function Icon({ d, className = 'h-4 w-4', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

const ICONS_RAW = { alerts: ['M12 3L2 20h20L12 3zM12 10v4M12 17.5v.5'] }

/* ─── Nav Icons ─────────────────────────────────────────────── */
function NavIcon({ name, className = 'h-[17px] w-[17px]' }) {
  const p = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75' }
  switch (name) {
    case 'command':
      return <svg {...p}><path d="M3 12h4l2.5-6 3.5 12 2.5-7 2 3h4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'projects':
      return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
    case 'map':
      return <svg {...p}><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'alerts':
      return <svg {...p}><path d="M12 3L2 20h20L12 3zM12 10v4M12 17.5v.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'queue':
      return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/><path d="M11 8v3l2 2" strokeLinecap="round"/></svg>
    case 'cases':
      return <svg {...p}><path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 13h6" strokeLinecap="round"/></svg>
    case 'quality':
      return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'models':
      return <svg {...p}><circle cx="12" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M10 8.5L7.5 15.5M14 8.5l2.5 7M9 18h6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'geotag':
      return <svg {...p}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none"/></svg>
    case 'citizen':
      return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
    default: return null
  }
}

/* ─── DRISHTI Logo ──────────────────────────────────────────── */
function DrishtiLogo({ collapsed }) {
  return (
    <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
      <DrishtiMark className="h-9 w-9 shrink-0" />
      {!collapsed && (
        <div className="min-w-0 leading-none">
          <div className="text-[13.5px] font-extrabold tracking-[0.04em] text-slate-900" style={{ letterSpacing: '0.06em' }}>
            DRISHTI
          </div>
          <div className="mt-0.5 text-[9.5px] font-semibold text-slate-400 leading-snug tracking-wide">
            National Risk & Intelligence
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Nav Groups ─────────────────────────────────────────────────
   Role visibility comes from ROUTE_ROLES (utils/rbac.js) — the same
   matrix the route guards and command palette use. Badges are live
   counts, keyed into the counts object fetched in Sidebar. */
const NAV_GROUPS = [
  {
    title: null,
    items: [
      { to: '/command-center', label: 'Command Center', icon: 'command' },
      { to: '/projects', label: 'Projects', icon: 'projects' },
      { to: '/map', label: 'Geography', icon: 'map' },
    ],
  },
  {
    title: 'MONITORING',
    items: [
      {
        to: '/alerts', label: 'Risk & Alerts', icon: 'alerts',
        badgeKey: 'alerts',
        badgeCls: 'bg-red-50 text-red-700 border-red-200/70',
      },
      {
        to: '/investigations/queue', label: 'Investigations', icon: 'queue',
        badgeKey: 'queue',
        badgeCls: 'bg-amber-50 text-amber-700 border-amber-200/70',
      },
      {
        to: '/investigations', label: 'Cases', icon: 'cases', end: true,
        badgeKey: 'cases',
        badgeCls: 'bg-amber-50 text-amber-700 border-amber-200/70',
      },
      { to: '/geotag', label: 'GeoTag-1', icon: 'geotag' },
      { to: '/citizen-reports', label: 'Citizen Reports', icon: 'citizen' },
    ],
  },
  {
    title: 'GOVERNANCE',
    items: [
      { to: '/data-quality', label: 'Data Quality', icon: 'quality' },
      { to: '/models', label: 'AI & Models', icon: 'models' },
    ],
  },
]

/* Live sidebar badge counts — fetched only for items the role can see.
   Badges reflect what the user is authorized to work on: scoped roles get
   their scope's counts automatically (server-enforced), and a monitoring
   officer's Cases badge counts the cases assigned to THEM, not the
   national pile. */
function useNavCounts(user) {
  const role = user?.role
  const officer = role === 'officer'
  const alerts = useQuery({
    queryKey: ['nav-count', 'alerts'],
    queryFn: () => alertsApi.list({ status: 'open', page_size: 1 }),
    staleTime: 60_000,
    enabled: canAccess(role, '/alerts'),
  })
  // Triage backlog, not the whole ranked universe: high/critical-risk items
  // in scope that don't yet have an open case.
  const queueEnabled = canAccess(role, '/investigations/queue')
  const queueCritical = useQuery({
    queryKey: ['nav-count', 'queue', 'critical'],
    queryFn: () => investigationsApi.queue({ page_size: 1, risk_level: 'critical', has_open_case: false }),
    staleTime: 60_000,
    enabled: queueEnabled,
  })
  const queueHigh = useQuery({
    queryKey: ['nav-count', 'queue', 'high'],
    queryFn: () => investigationsApi.queue({ page_size: 1, risk_level: 'high', has_open_case: false }),
    staleTime: 60_000,
    enabled: queueEnabled,
  })
  const cases = useQuery({
    queryKey: ['nav-count', 'cases', officer ? user?.id : 'all'],
    queryFn: () => investigationsApi.list({
      page_size: 1, active: true, ...(officer ? { assigned_to_id: user.id } : {}) }),
    staleTime: 60_000,
    enabled: canAccess(role, '/investigations') && (!officer || user?.id != null),
  })
  return {
    alerts: alerts.data?.total,
    queue:
      queueCritical.data != null && queueHigh.data != null
        ? queueCritical.data.total + queueHigh.data.total
        : undefined,
    cases: cases.data?.total,
  }
}

/* ─── Sidebar ────────────────────────────────────────────────── */
function Sidebar({ collapsed, onNavigate }) {
  const { user } = useAuth()
  const counts = useNavCounts(user)
  return (
    <aside
      className="flex shrink-0 flex-col border-r border-slate-200/70 bg-white text-slate-900 select-none"
      style={{
        width: collapsed ? 60 : 228,
        transition: 'width 220ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Brand Header */}
      <div className={`border-b border-slate-200/60 py-4 ${collapsed ? 'px-2.5 flex justify-center' : 'px-4'}`}>
        <DrishtiLogo collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto" aria-label="Main navigation">
        {NAV_GROUPS.map((group, gi) => {
          const visible = group.items.filter(item => canAccess(user?.role, item.to))
          if (!visible.length) return null
          return (
            <div key={gi} className={gi > 0 ? 'mt-1' : ''}>
              {!collapsed && group.title && (
                <div className="px-4 pb-1.5 pt-3 text-[9px] font-bold tracking-[0.14em] text-slate-400 uppercase"
                     style={{ fontFamily: 'var(--font-mono)' }}>
                  {group.title}
                </div>
              )}
              {collapsed && group.title && gi > 0 && (
                <div className="mx-3 my-2 border-t border-slate-100" />
              )}
              <div className="space-y-0.5 px-2">
                {visible.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `group relative flex items-center justify-between rounded-lg py-2 text-[12.5px] font-medium transition-all duration-150 ${
                        collapsed ? 'px-0 justify-center' : 'px-2.5'
                      } ${
                        isActive
                          ? 'bg-blue-50/90 text-slate-900 font-semibold border border-blue-200/60 shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 border border-transparent'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Active left bar */}
                        {isActive && (
                          <motion.span
                            layoutId="nav-active-bar"
                            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-blue-600"
                            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                          />
                        )}
                        <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
                          <div className="w-5 h-5 flex items-center justify-center shrink-0">
                            <NavIcon
                              name={item.icon}
                              className={`h-[17px] w-[17px] transition-colors ${
                                isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                              }`}
                            />
                          </div>
                          {!collapsed && (
                            <span className="min-w-0 leading-tight">
                              <span className="block truncate">{item.label}</span>
                              {accessNote(user?.role, item.to) && (
                                <span className="block truncate text-[9.5px] font-medium text-slate-400">
                                  {accessNote(user?.role, item.to)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {!collapsed && item.badgeKey && counts[item.badgeKey] != null && counts[item.badgeKey] > 0 && (
                          <span className={`ml-auto rounded-md border px-1.5 py-0.5 text-[10px] font-bold shrink-0 min-w-[20px] text-center ${item.badgeCls ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}
                                style={{ fontFamily: 'var(--font-mono)' }}>
                            {counts[item.badgeKey] > 99 ? '99+' : counts[item.badgeKey]}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Active Scope Box — reflects the caller's server-enforced scope */}
      {(() => {
        const scope = SCOPE_INFO[user?.role] ?? SCOPE_INFO.officer
        return collapsed ? (
          <div className="p-2 border-t border-slate-200/60 flex justify-center">
            <button
              type="button"
              title={`${scope.title} — ${scope.subtitle}`}
              className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        ) : (
          <div className="p-3 border-t border-slate-200/60">
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400"
                      style={{ fontFamily: 'var(--font-mono)' }}>
                  ACTIVE SCOPE
                </span>
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-subtle" title="Scope Active" />
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 border border-blue-100 text-blue-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-slate-900 truncate">{scope.title}</div>
                  <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                    {scope.subtitle}
                  </div>
                </div>
              </div>
              <div className="pt-1.5 border-t border-slate-100 text-[10px] font-medium text-slate-400">
                Scope is assigned by your account role
              </div>
            </div>
          </div>
        )
      })()}
    </aside>
  )
}

/* ─── Live Timestamp ─────────────────────────────────────────── */
function LiveTimestamp() {
  const [ts, setTs] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTs(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const fmt = ts.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return <span className="tabular-nums">{fmt}</span>
}

/* ─── Breadcrumb Map ─────────────────────────────────────────── */
function useBreadcrumb() {
  const location = useLocation()
  const path = location.pathname
  if (path === '/') return { title: 'Command Center', subtitle: 'National Intelligence Pulse' }
  if (path.startsWith('/projects/')) return { title: 'Project Dossier', subtitle: 'Projects / Detail View' }
  if (path === '/projects') return { title: 'Project Registry', subtitle: 'National Programme Inventory' }
  if (path === '/alerts') return { title: 'Risk & Alerts', subtitle: 'Alert Operations Console' }
  if (path === '/investigations/queue') return { title: 'Investigations', subtitle: 'Priority Queue — Risk × Impact × Evidence' }
  if (path.startsWith('/investigations/')) return { title: 'Case File', subtitle: 'Cases / Investigation Detail' }
  if (path === '/investigations') return { title: 'Case Command Center', subtitle: 'Active Investigation Registry' }
  if (path === '/map') return { title: 'Geography', subtitle: 'Spatial Risk Intelligence' }
  if (path === '/data-quality') return { title: 'Data Quality', subtitle: 'Data Trust Center — Integrity Audit' }
  if (path === '/models') return { title: 'AI & Models', subtitle: 'Model Governance Center' }
  if (path === '/geotag') return { title: 'GeoTag-1', subtitle: 'Image Evidence Verification' }
  return { title: 'DRISHTI', subtitle: 'National Risk & Intelligence Platform' }
}

/* ─── Topbar ─────────────────────────────────────────────────── */
function Topbar({ collapsed, onToggleSidebar, onToggleMobile, onOpenCommandPalette }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef(null)
  const { title, subtitle } = useBreadcrumb()

  const canSeeAlerts = canAccess(user?.role, '/alerts')
  const alerts = useQuery({
    queryKey: ['nav-count', 'alerts'],
    queryFn: () => alertsApi.list({ status: 'open', page_size: 1 }),
    staleTime: 60_000,
    enabled: canSeeAlerts,
  })
  const openCount = alerts.data?.total ?? 0

  useEffect(() => {
    const fn = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Ctrl/Cmd + K
  useEffect(() => {
    const fn = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onOpenCommandPalette()
      }
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onOpenCommandPalette])

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 bg-white px-4 sm:px-5 select-none z-30">
      {/* Left: toggle + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="hidden md:flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 shrink-0"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          onClick={onToggleMobile}
          aria-label="Open navigation"
          className="md:hidden h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Separator */}
        <div className="hidden md:block h-4 w-px bg-slate-200" />

        <div className="min-w-0">
          <div className="text-[13px] font-bold text-slate-900 tracking-tight leading-none truncate">{title}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-medium text-slate-400 leading-none truncate">{subtitle}</span>
            <span className="hidden sm:inline-flex items-center rounded bg-emerald-50 border border-emerald-200/70 text-emerald-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                  style={{ fontFamily: 'var(--font-mono)' }}>
              {SCOPE_BADGES[user?.role] ?? 'NATIONAL'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Live sync indicator */}
        <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50/80 border border-slate-200/70 px-2.5 py-1.5 rounded-lg">
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-live shrink-0" />
          <span className="font-semibold text-slate-700">Live</span>
          <span className="text-slate-400 font-medium" style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px' }}>
            <LiveTimestamp />
          </span>
          <button
            onClick={() => alerts.refetch()}
            aria-label="Refresh data"
            className="ml-1 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Command palette trigger */}
        <button
          onClick={onOpenCommandPalette}
          aria-label="Open command palette (Ctrl+K)"
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-[11px] font-medium text-slate-400 hover:border-slate-300 hover:text-slate-600 transition-colors"
          style={{ width: 200 }}
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <span className="truncate flex-1">Search & commands...</span>
          <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-white px-1 py-0.5 text-[9.5px] font-bold text-slate-500"
               style={{ fontFamily: 'var(--font-mono)' }}>
            ⌘K
          </kbd>
        </button>

        {/* Alerts bell — hidden for roles without Risk & Alerts access */}
        {canSeeAlerts && (
        <button
          onClick={() => navigate('/alerts')}
          aria-label={`Risk alerts — ${openCount} open`}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M12 3L2 20h20L12 3zM12 10v4M12 17.5v.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {openCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-0.5 text-[9.5px] font-bold text-white shadow-sm">
              {openCount > 99 ? '99+' : openCount}
            </span>
          )}
        </button>
        )}

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(v => !v)}
            aria-expanded={showUserMenu}
            aria-haspopup="true"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 hover:border-slate-300 transition-colors"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-white text-[10px] font-extrabold shrink-0">
              {initialsOf(user?.full_name)}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-[11.5px] font-bold text-slate-900 leading-none">{user?.full_name ?? '—'}</div>
              <div className="text-[9.5px] font-medium text-slate-400 leading-none mt-0.5">{ROLE_LABELS[user?.role] ?? 'User'}</div>
            </div>
            <svg className="h-3 w-3 text-slate-400 hidden sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 mt-2 w-54 rounded-xl border border-slate-200/80 bg-white p-2 shadow-xl z-50"
              >
                <div className="border-b border-slate-100 px-3 py-2.5 mb-1">
                  <p className="text-[12px] font-bold text-slate-900">{user?.full_name ?? '—'}</p>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">{user?.email ?? ''}</p>
                  <span className="mt-2 inline-flex items-center rounded border border-blue-200/80 bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700"
                        style={{ fontFamily: 'var(--font-mono)' }}>
                    {ROLE_LABELS[user?.role] ?? 'User'}
                  </span>
                </div>
                <button
                  onClick={() => { setShowUserMenu(false); logout() }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11.5px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}

/* ─── Footer Status Bar ──────────────────────────────────────── */
function GlobalFooterBar() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-slate-200/70 bg-white/90 px-5 py-2 text-[10.5px] text-slate-500 select-none">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">Data Source:</span>
        <span className="font-semibold text-slate-700">12+ Integrated Government Systems</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium">Last Updated:</span>
        <span className="font-semibold text-slate-700 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
          27 Aug 2026 · 04:56 IST
        </span>
      </div>
      <div className="hidden lg:flex items-center gap-1.5">
        <span className="font-medium">AI Models:</span>
        <span className="font-semibold text-slate-700">12 Active · Evidence-Based · Explainable</span>
      </div>
      <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
        <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
        All Systems Operational
      </div>
    </footer>
  )
}

/* ─── Page Transition Wrapper ────────────────────────────────── */
function PageWrapper({ children }) {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/* ─── App Shell ──────────────────────────────────────────────── */
export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-background)' }}>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} />
      </div>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden" role="dialog" aria-label="Navigation menu">
            <motion.div
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </motion.div>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 bg-slate-900/50 backdrop-blur-sm"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed(v => !v)}
          onToggleMobile={() => setMobileOpen(true)}
          onOpenCommandPalette={openCommandPalette}
        />

        <main className="flex-1 overflow-y-auto px-5 py-5 pb-28 sm:px-6 sm:py-5" style={{ background: 'var(--color-background)' }}>
          <PageWrapper>
            <Outlet />
          </PageWrapper>
        </main>

        <GlobalFooterBar />
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* ── Sakshi AI Investigation Copilot ── */}
      <SakshiCopilot />
    </div>
  )
}
