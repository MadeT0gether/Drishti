import { useEffect, useRef } from 'react'
import { riskMeta } from '../../utils/risk'
import { titleCase } from '../../utils/format'

/** Accessible modal shell */
export function Modal({ label, onClose, children, maxWidth = 'max-w-md', raw = false, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const previous = document.activeElement
    const node = ref.current
    const focusables = () => node.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    focusables()[0]?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.() }
      if (e.key === 'Tab') {
        const f = [...focusables()]
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = originalOverflow
      node.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  if (raw) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/65 backdrop-blur-xs p-3 sm:p-4 transition-opacity overflow-hidden"
           role="dialog" aria-modal="true" aria-label={label} ref={ref}
           onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
        <div className={`w-full ${maxWidth} max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-xl border border-border bg-surface shadow-elevated overflow-hidden
                         motion-safe:animate-[modal-in_150ms_ease-out] ${className}`}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/65 backdrop-blur-xs p-3 sm:p-4 transition-opacity overflow-hidden"
         role="dialog" aria-modal="true" aria-label={label} ref={ref}
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={`w-full ${maxWidth} max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-xl border border-border bg-surface p-6 shadow-elevated overflow-y-auto
                       motion-safe:animate-[modal-in_150ms_ease-out] ${className}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">{children}</div>
          {onClose && (
            <button onClick={onClose} aria-label="Close modal"
                    className="ml-4 -mt-1 -mr-1 rounded-md p-1.5 text-text-muted transition-colors hover:bg-background hover:text-text-primary">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function Card({ children, className = '', variant = 'default', ...rest }) {
  const variantCls = {
    default: 'bg-surface border-border shadow-xs',
    subtle: 'bg-surface-subtle border-border-subtle shadow-xs',
    elevated: 'bg-surface border-border shadow-card',
    accent: 'bg-surface border-accent-border/60 shadow-xs',
  }[variant] ?? 'bg-surface border-border shadow-xs'

  return (
    <div className={`rounded-xl border transition-all duration-150 ${variantCls} ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, badge, className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-3.5 ${className}`}>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight text-text-primary">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}

export function RiskBadge({ level, score, size = 'sm' }) {
  const meta = riskMeta(level)
  const pad = size === 'lg' ? 'px-3 py-1 text-xs tracking-wide' : 'px-2.5 py-0.5 text-[11px]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-bold uppercase tracking-wider ${meta.bg} ${meta.border} ${meta.text} ${pad}`}
      role="status"
      aria-label={`Risk level: ${meta.label}${score != null ? `, score ${Math.round(score)}` : ''}`}
    >
      <span aria-hidden="true" className="text-[0.8em] leading-none">{meta.symbol}</span>
      {score != null && <span className="tabular-nums font-mono font-extrabold">{Math.round(score)}</span>}
      <span>{meta.label}</span>
    </span>
  )
}

const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  in_progress: 'bg-blue-50 text-blue-800 border-blue-200/80',
  sanctioned: 'bg-slate-100 text-slate-700 border-slate-200',
  recommended: 'bg-slate-50 text-slate-600 border-slate-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  open: 'bg-amber-50 text-amber-800 border-amber-200/80',
}

export function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${cls}`}>
      {titleCase(status)}
    </span>
  )
}

const SEV_STYLES = {
  critical: 'bg-red-100 text-red-950 border-red-300 font-bold',
  high: 'bg-orange-100 text-orange-950 border-orange-300 font-bold',
  medium: 'bg-amber-100 text-amber-950 border-amber-300 font-bold',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

export function SeverityBadge({ severity }) {
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-mono ${SEV_STYLES[severity] ?? SEV_STYLES.low}`}>
      {severity}
    </span>
  )
}

export function Select({ label, value, onChange, children, className = '', error, ...props }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-semibold tracking-wide text-text-secondary ${className}`}>
      {label && <span>{label}</span>}
      <div className="relative flex items-center">
        <select
          value={value}
          onChange={onChange}
          className={`w-full appearance-none rounded-lg border border-border bg-surface px-3 py-1.5 pr-8 text-sm font-medium text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 ${
            error ? 'border-danger' : ''
          }`}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute right-2.5 text-text-muted">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {error && <span className="text-[11px] font-medium text-danger">{error}</span>}
    </label>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', onClear, className = '' }) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <div className="pointer-events-none absolute left-3 text-text-muted">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface py-1.5 pl-9 pr-8 text-sm font-medium text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2.5 rounded-full p-0.5 text-text-muted hover:bg-background hover:text-text-primary"
          aria-label="Clear search"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

export function SortableHeader({ label, sortKey, activeSort, activeOrder, onSort, className = '' }) {
  const isActive = activeSort === sortKey
  return (
    <th className={`px-4 py-3 font-semibold text-xs tracking-wider uppercase text-text-muted select-none ${className}`}>
      <button
        type="button"
        onClick={() => onSort?.(sortKey)}
        className="inline-flex items-center gap-1 hover:text-text-primary focus:outline-none"
      >
        <span>{label}</span>
        {isActive && (
          <span className="text-accent text-[10px]">
            {activeOrder === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    </th>
  )
}

export function ProgressBar({ value, color = 'bg-accent', label, showPct = false }) {
  const pct = Math.min(Math.max(value ?? 0, 0), 100)
  return (
    <div className="w-full space-y-1" role="progressbar" aria-valuenow={Math.round(pct)}
         aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/50">
        <div className={`h-full rounded-full ${color} transition-all duration-300`}
             style={{ width: `${pct}%` }} />
      </div>
      {showPct && (
        <div className="text-right text-[11px] font-semibold tabular-nums font-mono text-text-secondary">
          {Math.round(pct)}%
        </div>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/60 ${className}`} aria-hidden="true" />
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-text-muted mb-3">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      {message && <p className="mt-1 max-w-sm text-xs text-text-muted leading-relaxed">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const status = error?.response?.status
  const msg = status === 403
    ? 'You are not authorized to view this data.'
    : status === 404
      ? 'The requested resource was not found.'
      : 'Unable to load data. The service may be temporarily unavailable.'
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger mb-3">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-text-primary">{msg}</p>
      {onRetry && status !== 403 && status !== 404 && (
        <button onClick={onRetry}
                className="mt-4 rounded-lg border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors">
          Retry
        </button>
      )}
    </div>
  )
}

/** Standard query boundary wrapper */
export function QueryBoundary({ query, skeleton, empty, children }) {
  if (query.isPending) return skeleton ?? <Skeleton className="h-40 w-full" />
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />
  const data = query.data
  const isEmpty = data == null || (Array.isArray(data) && data.length === 0)
    || (Array.isArray(data?.items) && data.items.length === 0)
  if (isEmpty && empty) return empty
  return children(data)
}

export function Button({ children, variant = 'primary', size = 'md', className = '', disabled, ...props }) {
  const baseCls = 'inline-flex items-center justify-center font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:opacity-50 disabled:pointer-events-none'

  const variants = {
    primary: 'bg-navy-900 text-white hover:bg-navy-800 shadow-xs border border-navy-950',
    accent: 'bg-accent text-white hover:bg-accent-hover shadow-xs',
    secondary: 'bg-surface border border-border text-text-primary hover:border-border-strong hover:bg-background shadow-xs',
    outline: 'border border-border text-text-secondary hover:border-navy-900 hover:text-navy-900 bg-transparent',
    ghost: 'text-text-secondary hover:bg-background hover:text-text-primary',
    danger: 'bg-danger text-white hover:bg-red-800 shadow-xs',
  }

  const sizes = {
    xs: 'px-2 py-1 text-xs rounded-md gap-1',
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-lg gap-2',
    lg: 'px-5 py-2.5 text-base rounded-xl gap-2.5',
  }

  return (
    <button
      disabled={disabled}
      className={`${baseCls} ${variants[variant] ?? variants.primary} ${sizes[size] ?? sizes.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input({ label, error, helper, icon, className = '', ...props }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-semibold tracking-wide text-text-secondary ${className}`}>
      {label && <span>{label}</span>}
      <div className="relative flex items-center">
        {icon && (
          <div className="pointer-events-none absolute left-3 text-text-muted">
            {icon}
          </div>
        )}
        <input
          className={`w-full rounded-lg border border-border bg-surface py-2 text-sm font-medium text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 ${
            icon ? 'pl-9 pr-3' : 'px-3'
          } ${error ? 'border-danger' : ''}`}
          {...props}
        />
      </div>
      {error ? (
        <span className="text-[11px] font-medium text-danger">{error}</span>
      ) : helper ? (
        <span className="text-[11px] font-normal text-text-muted">{helper}</span>
      ) : null}
    </label>
  )
}

export function TextArea({ label, error, helper, className = '', rows = 3, ...props }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-semibold tracking-wide text-text-secondary ${className}`}>
      {label && <span>{label}</span>}
      <textarea
        rows={rows}
        className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 ${
          error ? 'border-danger' : ''
        }`}
        {...props}
      />
      {error ? (
        <span className="text-[11px] font-medium text-danger">{error}</span>
      ) : helper ? (
        <span className="text-[11px] font-normal text-text-muted">{helper}</span>
      ) : null}
    </label>
  )
}

export function Checkbox({ label, checked, onChange, className = '', ...props }) {
  return (
    <label className={`inline-flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer select-none ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-border text-accent focus:ring-accent/20 focus:ring-2"
        {...props}
      />
      {label && <span>{label}</span>}
    </label>
  )
}

export function StatCard({ label, value, sub, tone = 'default', icon, to, className = '' }) {
  const toneCls = {
    danger: 'text-risk-critical',
    warn: 'text-risk-high',
    success: 'text-emerald-700',
    default: 'text-text-primary',
  }[tone] ?? 'text-text-primary'

  const body = (
    <Card className={`p-4 transition-all duration-150 ${to ? 'hover:border-border-strong hover:shadow-card' : ''} ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums tracking-tight ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-text-muted font-medium">{sub}</div>}
    </Card>
  )

  return to ? (
    <a href={to} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 rounded-xl">
      {body}
    </a>
  ) : body
}

export function GovernmentSectionHeader({ title, subtitle, badge, action, className = '' }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 border-b border-border/80 pb-2.5 mb-5 ${className}`}>
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-navy-900">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted leading-relaxed font-medium">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}

export function RiskStatCard({ label, value, sub, level = 'high', to, className = '' }) {
  const meta = riskMeta(level)
  const body = (
    <div className={`rounded-xl border border-border ${meta.bg} p-4 transition-all duration-150 ${to ? 'hover:border-border-strong hover:shadow-card' : ''} ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold font-mono ${meta.bg} ${meta.text} border ${meta.border}`}>
          <span aria-hidden="true">{meta.symbol}</span>
          <span>{meta.label}</span>
        </span>
      </div>
      <div className={`mt-2 text-2xl font-extrabold font-mono tabular-nums tracking-tight ${meta.text}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-text-muted font-medium">{sub}</div>}
    </div>
  )

  return to ? (
    <a href={to} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 rounded-xl">
      {body}
    </a>
  ) : body
}

export function AIInsightCard({ signal, severity = 'medium', confidence, evidence, count, actionTo, actionText = 'Inspect Signal →', className = '' }) {
  const sevBg = {
    critical: 'bg-red-50/70 border-red-200 text-red-950',
    high: 'bg-orange-50/70 border-orange-200 text-orange-950',
    medium: 'bg-amber-50/70 border-amber-200 text-amber-950',
    low: 'bg-blue-50/70 border-blue-200 text-blue-950',
  }[severity] ?? 'bg-amber-50/70 border-amber-200 text-amber-950'

  return (
    <Card className={`p-4 border ${sevBg} transition-all duration-150 hover:shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-navy-900 text-white text-[11px] font-mono font-bold">
            AI
          </span>
          <SeverityBadge severity={severity} />
          {count != null && (
            <span className="rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-bold font-mono text-text-primary shadow-xs border border-border">
              {count} Affected
            </span>
          )}
        </div>
        {confidence && (
          <span className="text-[11px] font-bold text-text-muted font-mono">
            {confidence} Conf.
          </span>
        )}
      </div>
      <h3 className="mt-3 text-sm font-bold text-text-primary leading-snug">{signal}</h3>
      {evidence && <p className="mt-1 text-xs text-text-secondary leading-relaxed font-medium">{evidence}</p>}
      {actionTo && (
        <div className="mt-3 pt-2 border-t border-black/5 flex justify-end">
          <a href={actionTo} className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-hover transition-colors">
            <span>{actionText}</span>
          </a>
        </div>
      )}
    </Card>
  )
}

export function EvidenceCard({ title, impact, description, factor, className = '' }) {
  return (
    <div className={`rounded-lg border border-border bg-surface-subtle p-3.5 space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary">{title}</span>
        {impact != null && (
          <span className="text-[11px] font-bold font-mono text-risk-critical">
            +{impact} Points
          </span>
        )}
      </div>
      {description && <p className="text-xs text-text-secondary leading-relaxed font-medium">{description}</p>}
      {factor && <div className="text-[10px] font-mono font-bold uppercase text-text-muted">Factor: {factor}</div>}
    </div>
  )
}

export function AlertCard({ alert, className = '' }) {
  return (
    <Card className={`p-4 border-l-4 border-l-danger hover:shadow-card transition-shadow ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <span className="font-mono text-xs font-bold text-text-primary">{alert.project_code}</span>
        </div>
        <span className="text-[11px] font-medium text-text-muted">{alert.district}, {alert.state}</span>
      </div>
      <p className="mt-2 text-xs font-semibold text-text-primary leading-snug">{alert.reason}</p>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
        <span className="text-[11px] text-text-muted">Score: <strong className="font-mono text-risk-critical">{alert.curr_score != null ? Math.round(alert.curr_score) : '—'}</strong></span>
        {alert.project_id && (
          <a href={`/projects/${alert.project_id}`} className="text-xs font-bold text-accent hover:underline">
            Investigate Project &rarr;
          </a>
        )}
      </div>
    </Card>
  )
}

export { default as SakshiLoader } from './SakshiLoader'

