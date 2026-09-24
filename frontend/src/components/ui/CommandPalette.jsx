import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../../hooks/useAuth'
import { ROUTE_ROLES } from '../../utils/rbac'

/* ─── Command Groups ─────────────────────────────────────────── */
const NAV_COMMANDS = [
  {
    id: 'command', title: 'Command Center', subtitle: 'National Intelligence Pulse',
    path: '/', category: 'Navigation',
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M3 12h4l2.5-6 3.5 12 2.5-7 2 3h4.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    id: 'projects', title: 'Project Registry', subtitle: '25,355 projects in scope',
    path: '/projects', category: 'Navigation',
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  },
  {
    id: 'map', title: 'Geography', subtitle: 'Spatial Risk Intelligence',
    path: '/map', category: 'Navigation',
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" strokeLinecap="round"/></svg>,
  },
  {
    id: 'alerts', title: 'Risk & Alerts', subtitle: 'Alert operations console',
    path: '/alerts', category: 'Monitoring', roles: ROUTE_ROLES['/alerts'],
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 3L2 20h20L12 3zM12 10v4M12 17.5v.5" strokeLinecap="round"/></svg>,
  },
  {
    id: 'queue', title: 'Investigations', subtitle: 'Smart Priority Queue',
    path: '/investigations/queue', category: 'Monitoring', roles: ROUTE_ROLES['/investigations/queue'],
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M11 8v3l2 2" strokeLinecap="round"/></svg>,
  },
  {
    id: 'cases', title: 'Case Command Center', subtitle: 'Active investigation registry',
    path: '/investigations', category: 'Monitoring', roles: ROUTE_ROLES['/investigations'],
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" strokeLinecap="round"/><path d="M9 13h6" strokeLinecap="round"/></svg>,
  },
  {
    id: 'quality', title: 'Data Trust Center', subtitle: 'Data quality governance & audit',
    path: '/data-quality', category: 'Governance',
    roles: ROUTE_ROLES['/data-quality'],
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round"/><path d="M9 12l2 2 4-4" strokeLinecap="round"/></svg>,
  },
  {
    id: 'models', title: 'AI & Model Governance', subtitle: 'Model monitoring & evaluation',
    path: '/models', category: 'Governance', roles: ROUTE_ROLES['/models'],
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M10 8.5L7.5 15.5M14 8.5l2.5 7M9 18h6" strokeLinecap="round"/></svg>,
  },
]

const ACTION_COMMANDS = [
  {
    id: 'search-projects', title: 'Search Projects', subtitle: 'Search across all 25,355 projects',
    category: 'Actions',
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/></svg>,
    action: (q, navigate, onClose) => {
      navigate(`/projects?search=${encodeURIComponent(q)}`)
      onClose()
    },
  },
  {
    id: 'critical-alerts', title: 'View Critical Alerts', subtitle: 'Filter to critical severity alerts',
    category: 'Actions',
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 3L2 20h20L12 3zM12 10v4M12 17.5v.5" strokeLinecap="round"/></svg>,
    action: (_, navigate, onClose) => { navigate('/alerts?severity=critical'); onClose() },
  },
  {
    id: 'high-risk-projects', title: 'High Risk Projects', subtitle: 'View all high-risk & critical projects',
    category: 'Actions',
    icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 3L2 20h20L12 3zM12 10v4" strokeLinecap="round"/></svg>,
    action: (_, navigate, onClose) => { navigate('/projects?risk_level=high'); onClose() },
  },
]

const CATEGORY_ORDER = ['Navigation', 'Monitoring', 'Governance', 'Actions']

/* ─── Category Section ───────────────────────────────────────── */
function CategorySection({ category, commands, selectedIndex, allCommands, onSelect }) {
  return (
    <div>
      <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400"
           style={{ fontFamily: 'var(--font-mono)' }}>
        {category}
      </div>
      {commands.map((cmd) => {
        const globalIdx = allCommands.indexOf(cmd)
        const isActive = globalIdx === selectedIndex
        return (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
              isActive ? 'bg-blue-50 border-l-2 border-blue-600' : 'hover:bg-slate-50 border-l-2 border-transparent'
            }`}
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-md border shrink-0 ${
              isActive ? 'border-blue-200/80 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}>
              {cmd.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[12px] font-semibold truncate ${isActive ? 'text-blue-900' : 'text-slate-800'}`}>
                {cmd.title}
              </div>
              {cmd.subtitle && (
                <div className="text-[10.5px] text-slate-400 truncate">{cmd.subtitle}</div>
              )}
            </div>
            {cmd.badge && (
              <span className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold shrink-0 ${cmd.badge.cls}`}
                    style={{ fontFamily: 'var(--font-mono)' }}>
                {cmd.badge.count}
              </span>
            )}
            {isActive && (
              <kbd className="hidden sm:flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1 text-[9px] font-bold text-slate-500 shrink-0">
                ↵
              </kbd>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Command Palette ────────────────────────────────────────── */
export default function CommandPalette({ isOpen, onClose }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)

  // Filter visible commands
  const filteredNavCommands = NAV_COMMANDS.filter(cmd => {
    if (cmd.roles && user && !cmd.roles.includes(user.role)) return false
    if (!query.trim()) return true
    return (
      cmd.title.toLowerCase().includes(query.toLowerCase()) ||
      cmd.subtitle?.toLowerCase().includes(query.toLowerCase()) ||
      cmd.category.toLowerCase().includes(query.toLowerCase())
    )
  })

  const filteredActionCommands = ACTION_COMMANDS.filter(cmd => {
    if (!query.trim()) return true
    return (
      cmd.title.toLowerCase().includes(query.toLowerCase()) ||
      cmd.subtitle?.toLowerCase().includes(query.toLowerCase())
    )
  })

  // Group by category
  const grouped = {}
  ;[...filteredNavCommands, ...filteredActionCommands].forEach(cmd => {
    if (!grouped[cmd.category]) grouped[cmd.category] = []
    grouped[cmd.category].push(cmd)
  })

  const allFiltered = CATEGORY_ORDER
    .filter(c => grouped[c])
    .flatMap(c => grouped[c])

  useEffect(() => { setSelectedIndex(0) }, [query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Keyboard nav
  useEffect(() => {
    if (!isOpen) return
    const fn = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => (i + 1) % Math.max(allFiltered.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => (i - 1 + allFiltered.length) % Math.max(allFiltered.length, 1))
      } else if (e.key === 'Enter' && allFiltered[selectedIndex]) {
        e.preventDefault()
        handleSelect(allFiltered[selectedIndex])
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [isOpen, allFiltered, selectedIndex, onClose])

  const handleSelect = (cmd) => {
    if (cmd.action) {
      cmd.action(query, navigate, onClose)
    } else if (cmd.path) {
      navigate(cmd.path)
      onClose()
    }
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/projects?search=${encodeURIComponent(query.trim())}`)
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-start justify-center px-4"
          style={{ background: 'rgb(13 27 46 / 0.45)', backdropFilter: 'blur(3px)', paddingTop: '10vh' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full overflow-hidden rounded-xl bg-white border border-slate-200/80"
            style={{ maxWidth: 580, maxHeight: '70vh', boxShadow: 'var(--shadow-modal)', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 border-b border-slate-200 px-4 py-0 shrink-0">
              <svg className="h-4 w-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search pages, projects, alerts..."
                className="h-12 flex-1 bg-transparent text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <kbd className="flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 shrink-0"
                   style={{ fontFamily: 'var(--font-mono)' }}>
                ESC
              </kbd>
            </form>

            {/* Results */}
            <div className="flex-1 overflow-y-auto py-2">
              {allFiltered.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[12px] font-medium text-slate-400">
                    No results for "{query}"
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Press <kbd className="font-semibold text-slate-600">↵</kbd> to search projects
                  </p>
                </div>
              ) : (
                CATEGORY_ORDER.filter(c => grouped[c]).map(category => (
                  <CategorySection
                    key={category}
                    category={category}
                    commands={grouped[category]}
                    selectedIndex={selectedIndex}
                    allCommands={allFiltered}
                    onSelect={handleSelect}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-2 shrink-0">
              <div className="flex items-center gap-3 text-[10.5px] text-slate-400">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1 text-[9px] font-bold text-slate-500">↑</kbd>
                  <kbd className="rounded border border-slate-200 bg-white px-1 text-[9px] font-bold text-slate-500">↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1.5 text-[9px] font-bold text-slate-500">↵</kbd>
                  Select
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                DRISHTI Command Palette
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
