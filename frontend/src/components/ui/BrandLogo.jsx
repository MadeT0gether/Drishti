/* DRISHTI official brand identity — vector recreation of the approved logo.
   Emblem: navy outer ring + gold inner ring with 4 gold orbit dots, navy eye,
   navy iris, gold pupil with specular highlight.
   Wordmark: DRISHTI in navy serif, gold rule, gold tagline. */

const NAVY = '#1f3a5f'
const GOLD = '#a87e00'

export function DrishtiMark({ className = 'h-8 w-8' }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      {/* outer navy ring */}
      <circle cx="60" cy="60" r="54" stroke={NAVY} strokeWidth="7" />
      {/* inner gold ring */}
      <circle cx="60" cy="60" r="43" stroke={GOLD} strokeWidth="4" />
      {/* 4 gold orbit dots at cardinal points */}
      {[
        { cx: 60, cy: 17 },
        { cx: 60, cy: 103 },
        { cx: 17, cy: 60 },
        { cx: 103, cy: 60 },
      ].map((p) => (
        <g key={`${p.cx}-${p.cy}`}>
          <circle cx={p.cx} cy={p.cy} r="7" fill={GOLD} />
          <circle cx={p.cx} cy={p.cy} r="7" stroke="#ffffff" strokeWidth="1.5" opacity="0.85" />
        </g>
      ))}

      {/* eye — lids */}
      <path
        d="M 28 60 Q 44 42 60 42 Q 76 42 92 60 Q 76 78 60 78 Q 44 78 28 60 Z"
        fill="#ffffff"
        stroke={NAVY}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* iris */}
      <circle cx="60" cy="60" r="16.5" fill={NAVY} />
      {/* pupil */}
      <circle cx="60" cy="60" r="8" fill={GOLD} />
      {/* specular highlight */}
      <circle cx="63.5" cy="56.5" r="3" fill="#ffffff" />
    </svg>
  )
}

export function DrishtiTagline({ darkBg = false, className = '' }) {
  return (
    <div className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.12em] ${className}`} aria-label="Transparency, Accountability, Impact">
      <span className="h-px w-4" style={{ background: GOLD }} />
      <span style={{ color: GOLD }}>Transparency</span>
      <span className="h-1 w-1 rounded-full" style={{ background: GOLD }} />
      <span style={{ color: GOLD }}>Accountability</span>
      <span className="h-1 w-1 rounded-full" style={{ background: GOLD }} />
      <span style={{ color: GOLD }}>Impact</span>
      <span className="h-px w-4" style={{ background: GOLD }} />
    </div>
  )
}

export function DrishtiLogo({ darkBg = false, subtitle = 'TRANSPARENCY \u2022 ACCOUNTABILITY \u2022 IMPACT' }) {
  return (
    <div className="flex items-center gap-3">
      <DrishtiMark className="h-10 w-10 shrink-0" />
      <div className="min-w-0 leading-none">
        <div
          className={`text-[22px] font-bold tracking-[0.14em] uppercase ${darkBg ? 'text-white' : ''}`}
          style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: darkBg ? '#ffffff' : NAVY }}
        >
          DRISHTI
        </div>
        <div className="my-1 h-[2.5px] w-full" style={{ background: GOLD }} />
        <div
          className="text-[8px] font-bold uppercase"
          style={{ color: GOLD, letterSpacing: '0.08em', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  )
}
