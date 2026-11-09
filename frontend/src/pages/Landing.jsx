import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { DrishtiLogo } from '../components/ui/BrandLogo'

const CAPABILITIES = [
  {
    name: 'Programme Intelligence',
    desc: 'A unified national view of programme execution, expenditure, and physical progress.',
  },
  {
    name: 'Risk & Anomaly Detection',
    desc: 'Analytical models surface implementation and financial risk signals for review.',
  },
  {
    name: 'Geographic Intelligence',
    desc: 'District-level spatial context connecting projects, boundaries, and risk concentration.',
  },
  {
    name: 'Investigations & Case Review',
    desc: 'Prioritized review queues and an auditable case register for accountable follow-through.',
  },
  {
    name: 'Data Trust & Governance',
    desc: 'Source provenance, reconciliation, and data-quality controls underpin every signal.',
  },
]

const FLOW_STEPS = [
  { step: '01', name: 'Government Data', desc: 'Programme, financial, and geographic records brought together.' },
  { step: '02', name: 'Reconciliation', desc: 'Records validated, matched, and quality-checked.' },
  { step: '03', name: 'Intelligence & Risk Signals', desc: 'Evidence-linked signals highlight where attention is needed.' },
  { step: '04', name: 'Institutional Review', desc: 'Authorized officials examine, decide, and act — on the record.' },
]

const TRUST_ITEMS = [
  { name: 'Evidence-Based Intelligence', desc: 'Every signal stays connected to underlying, verifiable source data.' },
  { name: 'Human-Led Institutional Review', desc: 'Analytics inform decisions; authorized officials make them.' },
  { name: 'Audit-Aware Operations', desc: 'Administrative actions are recorded in an append-only audit trail.' },
  { name: 'Data Provenance & Governance', desc: 'Source lineage, freshness, and quality remain under institutional oversight.' },
]

/* Illustrative network nodes — synthetic sample, clearly labelled in the UI */
const SAMPLE_NODES = [
  { x: 100, y: 80, label: 'NDL-01', score: '81', color: '#dc2626' },
  { x: 220, y: 120, label: 'LKN-04', score: '76', color: '#ea580c' },
  { x: 340, y: 90, label: 'KOL-02', score: '64', color: '#f59e0b' },
  { x: 420, y: 170, label: 'GHY-09', score: '45', color: '#64748b' },
  { x: 300, y: 240, label: 'BLR-07', score: '71', color: '#ea580c' },
  { x: 180, y: 210, label: 'MUM-03', score: '59', color: '#f59e0b' },
]

export default function Landing() {
  return (
    <div className="min-h-screen w-full bg-[#050b14] text-slate-100 font-sans overflow-x-hidden">
      {/* ─── 1. Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#060d1a]/95 backdrop-blur-md px-6 lg:px-12 py-3.5">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <DrishtiLogo darkBg={true} />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-300">
            <a href="#overview" className="hover:text-white transition-colors">Overview</a>
            <a href="#platform" className="hover:text-white transition-colors">Platform</a>
            <a href="#intelligence" className="hover:text-white transition-colors">Intelligence</a>
            <a href="#governance" className="hover:text-white transition-colors">Governance</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/login">
              <button className="flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 text-xs font-bold transition-all shadow-md active:scale-95">
                <span>Access Official Portal</span>
                <span className="font-mono text-xs">→</span>
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── 2. Hero ───────────────────────────────────────────────── */}
      <section id="overview" className="relative overflow-hidden bg-[#060d1a] border-b border-slate-800/80 px-6 lg:px-12 py-12 lg:py-16">
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hero-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
          </svg>
        </div>

        <div className="mx-auto max-w-[1400px] grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 space-y-7"
          >
            <div className="inline-flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-950/40 px-3 py-1 text-[10px] font-bold text-blue-300 font-mono uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              NATIONAL DIGITAL GOVERNANCE PLATFORM
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[3.4rem] font-extrabold text-white leading-[1.12] tracking-tight">
              National Programme Intelligence, Risk &amp;{' '}
              <span className="underline decoration-[#a87e00] decoration-[5px] underline-offset-8">
                Oversight
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
              DRISHTI brings programme execution, geographic intelligence, financial signals,
              and risk assessment into one friendly, evidence-based workspace — so every
              official can see clearly and act with confidence.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <a href="#platform">
                <button className="group flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 text-xs font-bold transition-all shadow-lg hover:-translate-y-0.5">
                  <span>Explore Platform</span>
                  <span className="font-mono text-xs transition-transform group-hover:translate-y-0.5">↓</span>
                </button>
              </a>

              <Link to="/login">
                <button className="group flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900/80 hover:bg-slate-800 text-slate-100 px-6 py-3 text-xs font-bold transition-all hover:-translate-y-0.5">
                  <span>Access Official Portal</span>
                  <span className="font-mono text-xs transition-transform group-hover:translate-x-1">→</span>
                </button>
              </Link>
            </div>

            <div className="pt-6 border-t border-slate-800/80 flex flex-wrap items-center gap-x-8 gap-y-3">
              {[
                { val: '25,355', label: 'Works tracked' },
                { val: '80', label: 'Districts covered' },
                { val: '12', label: 'AI risk detectors' },
              ].map((s) => (
                <div key={s.label} className="flex items-baseline gap-2">
                  <span className="text-xl font-extrabold text-white tracking-tight font-mono">{s.val}</span>
                  <span className="text-[10.5px] font-mono text-slate-400 uppercase tracking-wider">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[10.5px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-300">
                <svg className="h-3.5 w-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                AUTHORIZED GOVERNMENT ENVIRONMENT
              </span>
              <span className="text-slate-700">·</span>
              <span>EVIDENCE-BASED INTELLIGENCE</span>
              <span className="text-slate-700">·</span>
              <span>AUDIT-AWARE OPERATIONS</span>
            </div>
          </motion.div>

          {/* Hero visual — national intelligence layer (synthetic sample) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="lg:col-span-5 relative"
          >
            <div className="rounded-2xl border border-slate-800 bg-[#050b14] p-6 shadow-2xl space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-[10.5px] font-mono">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-live" />
                  <span className="font-bold">NATIONAL INTELLIGENCE LAYER</span>
                </div>
                <span className="text-slate-500">Synthetic Sample</span>
              </div>

              <div className="h-64 sm:h-72 w-full relative rounded-lg border border-slate-800/80 bg-[#060d1a] overflow-hidden flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 500 300">
                  <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(56,189,248,0.06)" strokeWidth="1" />
                  <line x1="0" y1="200" x2="500" y2="200" stroke="rgba(56,189,248,0.06)" strokeWidth="1" />
                  <line x1="166" y1="0" x2="166" y2="300" stroke="rgba(56,189,248,0.06)" strokeWidth="1" />
                  <line x1="333" y1="0" x2="333" y2="300" stroke="rgba(56,189,248,0.06)" strokeWidth="1" />

                  <path d="M 100,80 L 220,120 L 340,90 L 420,170 L 300,240 L 180,210 Z" fill="none" stroke="rgba(56,189,248,0.18)" strokeWidth="1.5" strokeDasharray="3 3" />
                  <line x1="220" y1="120" x2="300" y2="240" stroke="rgba(56,189,248,0.1)" strokeWidth="1" />
                  <line x1="180" y1="210" x2="340" y2="90" stroke="rgba(56,189,248,0.1)" strokeWidth="1" />

                  {SAMPLE_NODES.map((node, idx) => (
                    <g key={idx}>
                      <circle cx={node.x} cy={node.y} r="5" fill={node.color} opacity="0.9" />
                      <circle cx={node.x} cy={node.y} r="12" fill="none" stroke={node.color} strokeWidth="1" opacity="0.3">
                        <animate attributeName="r" values="6;16;6" dur="3.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.4;0.05;0.4" dur="3.5s" repeatCount="indefinite" />
                      </circle>
                      <text x={node.x + 8} y={node.y + 4} fill="#cbd5e1" fontSize="9" fontFamily="monospace" fontWeight="bold">
                        {node.label}: {node.score}
                      </text>
                    </g>
                  ))}
                </svg>

                <div className="absolute top-3 left-3 rounded border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-[9.5px] font-mono text-slate-300">
                  DISTRICT RISK NETWORK
                </div>
              </div>

              <p className="text-[10px] text-slate-500 font-mono">
                Illustrative sample data — not a live operational feed.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── 3. Platform capabilities ─────────────────────────────── */}
      <section id="platform" className="bg-[#F7F9FC] text-slate-900 py-10 lg:py-14 px-6 lg:px-12 border-b border-slate-200">
        <div className="mx-auto max-w-[1400px] space-y-10">
          <div className="max-w-3xl space-y-2">
            <span className="text-[10px] font-bold font-mono text-blue-700 uppercase tracking-[0.14em]">
              PLATFORM
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              One Platform for Programme Oversight
            </h2>
            <p className="text-sm text-slate-600 font-medium leading-relaxed">
              Five connected capabilities move fragmented programme data toward accountable
              institutional intelligence.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {CAPABILITIES.map((cap) => (
              <Link key={cap.name} to="/public/overview" className="group">
                <div className="p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all space-y-3 h-full flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors block">
                      {cap.name}
                    </span>
                    <p className="text-xs text-slate-600 leading-relaxed">{cap.desc}</p>
                  </div>
                  <div className="text-xs font-bold text-blue-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform pt-2 font-mono">
                    <span>Learn more</span>
                    <span>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 3b. Public programme activity preview ─────────────────── */}
      <section id="public-activity" className="bg-white text-slate-900 py-10 lg:py-14 px-6 lg:px-12 border-b border-slate-200">
        <div className="mx-auto max-w-[1400px] grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-5">
            <span className="text-[10px] font-bold font-mono text-emerald-700 uppercase tracking-[0.14em]">
              PUBLIC TRANSPARENCY
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Explore Public Programme Activity
            </h2>
            <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-xl">
              See government programme activity across states and districts, with access to
              public project records and reported progress.
            </p>

            <ul className="space-y-2 text-xs text-slate-600">
              {[
                'What projects are being carried out in my area?',
                'Which districts have the most reported activity?',
                'What is the reported progress, and how much funding is involved?',
                'Can I inspect the official public record?',
              ].map((q) => (
                <li key={q} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600 font-bold" aria-hidden="true">✓</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link to="/public/map">
                <button className="flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2.5 text-xs font-bold transition-all shadow-sm">
                  <span>Explore Geography</span>
                  <span className="font-mono text-xs">→</span>
                </button>
              </Link>
              <Link to="/public/projects">
                <button className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-5 py-2.5 text-xs font-bold transition-all">
                  <span>Browse Public Records</span>
                  <span className="font-mono text-xs">→</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Drill-down navigator — real portal counts, each step links deeper */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
              <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-500 border-b border-slate-200 pb-2.5">
                <span className="font-bold text-slate-700">STATE → DISTRICT → PROJECT RECORDS</span>
                <span>Live counts</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { step: '01', name: 'Pick a State', count: '10 states', to: '/public/map',
                    icon: (<path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />) },
                  { step: '02', name: 'Open a District', count: '80 districts', to: '/public/map',
                    icon: (<circle cx="12" cy="12" r="8" />) },
                  { step: '03', name: 'Read the Record', count: '25,355 records', to: '/public/projects',
                    icon: (<path d="M6 2h9l5 5v15H6z M14 2v6h6" />) },
                ].map((s) => (
                  <Link key={s.step} to={s.to} className="group">
                    <div className="h-full rounded-xl border border-slate-200 bg-white p-4 space-y-2 transition-all group-hover:border-blue-400 group-hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <svg className="h-5 w-5 text-blue-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                          {s.icon}
                        </svg>
                        <span className="text-[9px] font-bold font-mono text-slate-400">{s.step}</span>
                      </div>
                      <div className="text-[13px] font-bold text-slate-900">{s.name}</div>
                      <div className="text-[11px] font-mono font-semibold text-blue-700">{s.count} →</div>
                    </div>
                  </Link>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Prototype dataset — same records as the Geography explorer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. How DRISHTI works ─────────────────────────────────── */}
      <section id="intelligence" className="bg-white text-slate-900 py-10 lg:py-14 px-6 lg:px-12 border-b border-slate-200">
        <div className="mx-auto max-w-[1400px] space-y-10">
          <div className="max-w-3xl space-y-2">
            <span className="text-[10px] font-bold font-mono text-blue-700 uppercase tracking-[0.14em]">
              INTELLIGENCE
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              How DRISHTI Works
            </h2>
            <p className="text-sm text-slate-600 font-medium">
              Raw government datasets become evidence-linked risk signals, prioritized for
              accountable human review.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FLOW_STEPS.map((s, i) => (
              <div key={s.step} className="relative p-6 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold font-mono text-blue-700 tracking-wider">STEP {s.step}</span>
                  {i < FLOW_STEPS.length - 1 && (
                    <span className="hidden lg:block text-slate-300 font-mono text-sm" aria-hidden="true">→</span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-900">{s.name}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 5. Trust / governance strip ──────────────────────────── */}
      <section id="governance" className="bg-[#060d1a] text-white py-10 lg:py-14 px-6 lg:px-12 border-b border-slate-800">
        <div className="mx-auto max-w-[1400px] space-y-10">
          <div className="max-w-3xl space-y-2">
            <span className="text-[10px] font-bold font-mono text-blue-400 uppercase tracking-[0.14em]">
              GOVERNANCE
            </span>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">
              Built for Institutional Trust
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TRUST_ITEMS.map((t) => (
              <div key={t.name} className="p-6 rounded-xl border border-slate-800 bg-slate-900/80 space-y-2">
                <h3 className="text-sm font-bold text-white">{t.name}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 6. Final CTA ─────────────────────────────────────────── */}
      <section className="bg-[#050b14] py-10 px-6 lg:px-12 border-b border-slate-800">
        <div className="mx-auto max-w-[1400px]">
          <div className="rounded-2xl border border-slate-800 bg-[#060d1a] p-10 lg:p-14 text-center space-y-6">
            <h2 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight max-w-3xl mx-auto leading-snug">
              Turn fragmented programme data into accountable institutional intelligence.
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/public/overview">
                <button className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900/80 hover:bg-slate-800 text-slate-100 px-6 py-3 text-xs font-bold transition-all">
                  <span>Explore the Platform</span>
                  <span className="font-mono text-xs">→</span>
                </button>
              </Link>
              <Link to="/login">
                <button className="flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 text-xs font-bold transition-all shadow-lg active:scale-95">
                  <span>Access Official Portal</span>
                  <span className="font-mono text-xs">→</span>
                </button>
              </Link>
            </div>
            <p className="text-[10.5px] text-slate-500 font-mono">
              Access is limited to authorized government officials and oversight authorities.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 7. Footer ────────────────────────────────────────────── */}
      <footer className="bg-[#040810] text-slate-400 py-8 px-6 lg:px-12 text-xs font-mono">
        <div className="mx-auto max-w-[1400px] space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-slate-800/80">
            <div className="space-y-3">
              <DrishtiLogo darkBg={true} />
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed pt-1">
                Decision-support infrastructure for national programme oversight, risk
                intelligence, and evidence-led institutional review.
              </p>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">PLATFORM</div>
              <ul className="space-y-1 text-[11px]">
                <li><Link to="/public/overview" className="hover:text-white transition-colors">Public Transparency Portal</Link></li>
                <li><Link to="/public/methodology" className="hover:text-white transition-colors">Data Methodology</Link></li>
                <li><Link to="/login" className="hover:text-white transition-colors">Official Portal Sign In</Link></li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">SECURITY &amp; SCOPE</div>
              <div className="text-[11px] text-slate-400 font-sans space-y-1">
                <div>Scope: National Public Works</div>
                <div>Access: Authorized Officials</div>
                <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[10.5px] pt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-live" />
                  System Operational
                </div>
              </div>
            </div>
          </div>

          <p className="text-[10.5px] text-slate-500 font-sans leading-relaxed max-w-4xl">
            Analytical risk scores are decision-support indicators derived from available data.
            They support institutional review and do not constitute legal proof of wrongdoing or
            autonomous administrative determinations. Final findings and decisions remain with
            authorized officials.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-4 text-[10.5px] text-slate-500">
            <div>DRISHTI · Demonstration / Prototype Environment — Prototype dataset, synthetic data</div>
            <div>© DRISHTI Platform · SIH 2026 Prototype</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
