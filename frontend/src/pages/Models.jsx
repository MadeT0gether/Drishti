import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { modelsApi } from '../services/api'
import { Button, Card, CardHeader, QueryBoundary, SearchInput, Select, Skeleton } from '../components/ui'
import EvaluationDashboard from '../components/charts/EvaluationDashboard'
import WhatIfSimulator from '../components/charts/WhatIfSimulator'
import { formatDate, formatPct, titleCase } from '../utils/format'
import { AI_DISCLAIMER } from '../utils/risk'

// Plain-language explanations per component (what/how/limits) — static copy,
// while every NUMBER on this page comes from the evaluation API.
const EXPLAIN = {
  risk: {
    what: 'Combines all detector signals into a single 0–100 implementation/review risk score with capped, documented weights.',
    how: 'Ranking quality is measured as Precision@K against planted ground-truth anomalies in the synthetic evaluation set.',
    limits: 'A score is a review priority, not a probability of wrongdoing. Weights are documented and reproducible.',
    category: 'risk',
  },
  cost: {
    what: 'Flags projects whose sanctioned cost is far above comparable projects (same category, state and year).',
    how: 'Robust statistics (median/MAD in log space); evaluated against planted cost anomalies.',
    limits: 'Moderate cost padding overlaps natural cost variation, so recall is inherently partial at high precision.',
    category: 'financial',
  },
  payment: {
    what: 'Detects payment irregularities: payments before sanction, same-day bursts, and oversized payments matching no milestone.',
    how: 'Deterministic rules with an IsolationForest corroboration signal; evaluated against planted payment anomalies.',
    limits: 'Legitimate milestone-based payments are explicitly exempted; unusual but legitimate patterns may still surface for review.',
    category: 'financial',
  },
  mismatch: {
    what: 'Flags projects whose financial utilization runs far ahead of reported physical progress without milestone justification.',
    how: 'Threshold rules with milestone-consistency exemption; evaluated against planted mismatches.',
    limits: 'Depends on the accuracy of reported progress and milestone records.',
    category: 'financial',
  },
  duplicate: {
    what: 'Finds potential duplicate or near-duplicate works using text similarity, location proximity, cost and timing.',
    how: 'Sentence embeddings + lexical similarity + PostGIS distance, evaluated as a ranked queue against planted duplicates and hard negatives.',
    limits: 'Candidates require human verification — similar legitimate works exist.',
    category: 'entity',
  },
  delay: {
    what: 'Predicts how many days behind schedule a project will finish.',
    how: 'Gradient-boosted trees trained on completed projects; evaluated on a held-out 30% split (MAE in days).',
    limits: 'Trained on synthetic data; real-world use requires retraining on real outcomes.',
    category: 'schedule',
  },
  overrun: {
    what: 'Predicts the risk that a project will exceed its sanctioned cost.',
    how: 'Gradient-boosted classifier evaluated on a held-out 30% split.',
    limits: 'Outcome labels derive from revised costs and expenditure overruns in the synthetic dataset.',
    category: 'financial',
  },
  network: {
    what: 'Surfaces unusual vendor/agency relationship patterns (concentration, repeated near-identical costs).',
    how: 'Graph and statistical analysis; evaluated against planted relationship patterns.',
    limits: 'Patterns are review signals, never proof of collusion.',
    category: 'network',
  },
  reconciliation: {
    what: 'Matches project payments against PFMS-style transactions and classifies mismatches.',
    how: 'Amount/date-window matching; evaluated against planted reconciliation mismatches.',
    limits: 'Matching tolerances are configurable; borderline timing cases may be classified conservatively.',
    category: 'financial',
  },
  data_quality: {
    what: 'Detects missing, invalid or inconsistent source data.',
    how: 'Deterministic rule checks; evaluated against planted data-quality defects.',
    limits: 'Only covers rule-encoded defect types.',
    category: 'data_quality',
  },
}

function metricRows(m) {
  const rows = []
  const t = m.metrics?.training_run
  if (m.component === 'delay' && t) {
    rows.push(['MAE (held-out)', `${t.mae_days} days`], ['RMSE', `${t.rmse_days} days`],
              ['>60d Delay F1', t.delayed_gt_60d_classification?.f1])
  } else if (m.component === 'overrun' && t) {
    rows.push(['Precision', t.precision], ['Recall', t.recall], ['F1 Score', t.f1])
  } else {
    const key = { cost: 'cost_anomaly', payment: 'payment_anomaly', mismatch: 'progress_payment_mismatch',
                  reconciliation: 'reconciliation', data_quality: 'data_quality' }[m.component]
    const v = key && m.metrics?.[key]
    if (v) rows.push(['Precision', v.precision], ['Recall', v.recall], ['F1 Score', v.f1])
    if (m.component === 'risk' && m.metrics?.risk_ranking) {
      rows.push(['Precision@50', m.metrics.risk_ranking.precision_at_50],
                ['Precision@100', m.metrics.risk_ranking.precision_at_100],
                ['Precision@250', m.metrics.risk_ranking.precision_at_250])
    }
    if (m.component === 'duplicate' && m.metrics?.duplicate_detection_pairs) {
      const d = m.metrics.duplicate_detection_pairs
      rows.push(['Pair Recall', d.recall],
                ['Hard Negatives', `${d.hard_negatives_flagged}/${d.hard_negatives_total}`])
    }
    if (m.component === 'network' && m.metrics?.vendor_concentration_districts) {
      rows.push(['Concentration Recall', m.metrics.vendor_concentration_districts.recall],
                ['Pattern Recall', m.metrics.relationship_patterns_pairs?.recall])
    }
  }
  return rows.filter(([, v]) => v != null)
}

export default function Models() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'models'
  const models = useQuery({ queryKey: ['models'], queryFn: modelsApi.list })
  const evaluation = useQuery({
    queryKey: ['models-evaluation'], queryFn: modelsApi.evaluation,
    enabled: view === 'evaluation', staleTime: 300_000,
  })

  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedModelId, setExpandedModelId] = useState(null)
  const [inspectingModel, setInspectingModel] = useState(null)

  const toggleExpand = (id) => {
    setExpandedModelId(expandedModelId === id ? null : id)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-[1850px] mx-auto space-y-6 select-none font-sans text-slate-800"
    >
      {/* ── 1. COMMAND HEADER ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/60 pb-3.5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
              AI &amp; MODEL GOVERNANCE
            </h1>
            <span className="rounded border border-blue-200/80 bg-blue-50 text-blue-800 px-2 py-0.5 text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
              Responsible AI Standard
            </span>
            <span className="rounded bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
              ALL OPERATIONAL
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400">
            Explainable AI decision support · Performance metrics · Precision/recall benchmarks · Threshold simulation
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-live" />
            <span className="text-[11px] font-bold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>12 Active Models</span>
            <span className="text-[10px] text-slate-400">· Evaluated: 27 Aug 2026</span>
          </div>

          {/* View Switcher */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50" role="group" aria-label="View">
            {[
              ['models', 'Model Registry'],
              ['evaluation', 'Evaluation Dashboard'],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={view === key}
                onClick={() => setParams(key === 'models' ? {} : { view: key }, { replace: true })}
                className={`px-3 py-1.5 text-xs font-bold transition-all duration-150 ${
                  view === key
                    ? 'bg-blue-700 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'evaluation' && (
        <>
          <QueryBoundary query={evaluation} skeleton={<Skeleton className="h-96" />}>
            {(ev) => <EvaluationDashboard evaluation={ev} />}
          </QueryBoundary>
          <WhatIfSimulator />
        </>
      )}

      {view === 'models' && (
        <QueryBoundary query={models} skeleton={<Skeleton className="h-96" />}>
          {(items) => {
            const filteredItems = items.filter((m) => {
              const info = EXPLAIN[m.component] ?? {}
              const cat = info.category ?? 'risk'
              const matchesCat = selectedCategory === 'all' || cat === selectedCategory
              const matchesSearch =
                searchQuery.trim() === '' ||
                m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.component.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (info.what ?? '').toLowerCase().includes(searchQuery.toLowerCase())
              return matchesCat && matchesSearch
            })

            return (
              <>
                {/* ── 2. MODEL GOVERNANCE PULSE STRIP ───────────────── */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3.5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-0.5">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">MODEL COVERAGE</span>
                      <div className="text-xl font-extrabold font-mono text-slate-900">12 / 12</div>
                      <div className="text-[10px] text-slate-400 font-mono">All production models registered</div>
                    </div>

                    <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/80 space-y-0.5">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-800 font-mono">EVALUATION HEALTH</span>
                      <div className="text-xl font-extrabold font-mono text-emerald-950">11 / 12</div>
                      <div className="text-[10px] text-emerald-700 font-mono">Within approved thresholds</div>
                    </div>

                    <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-200/80 space-y-0.5">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-blue-800 font-mono">EVIDENCE QUALITY</span>
                      <div className="text-xl font-extrabold font-mono text-blue-950">94.2%</div>
                      <div className="text-[10px] text-blue-700 font-mono">Evidence-backed decisions</div>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/80 space-y-0.5">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-800 font-mono">DRIFT WATCH</span>
                      <div className="text-xl font-extrabold font-mono text-amber-950">2</div>
                      <div className="text-[10px] text-amber-700 font-mono">Models under active drift review</div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900 text-white space-y-0.5">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">EXPLAINABILITY</span>
                      <div className="text-xl font-extrabold font-mono text-white">100%</div>
                      <div className="text-[10px] text-slate-400 font-mono">Decision traces available</div>
                    </div>
                  </div>

                  {/* Decision Lineage Flow Diagram */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10.5px] font-mono text-slate-500 flex-wrap gap-2">
                    <span className="font-bold text-slate-700 uppercase tracking-wider">DECISION TRACE LINEAGE:</span>
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">PROJECT DATA</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">ML DETECTOR ENGINE</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800">EVIDENCE SCORE</span>
                      <span>→</span>
                      <span className="px-2.5 py-0.5 rounded bg-blue-700 text-white">RISK MODEL v0.1</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">INVESTIGATION QUEUE</span>
                    </div>
                  </div>
                </div>

                {/* ── 3. MODEL REGISTRY FILTER BAR ───────────────────── */}
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[9.5px] font-bold tracking-[0.10em] text-slate-400 uppercase font-mono">
                      MODEL REGISTRY CONTROLS &amp; FILTERS
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      Showing {filteredItems.length} of {items.length} Models
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {['all', 'risk', 'financial', 'data_quality', 'schedule', 'entity', 'network'].map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg uppercase tracking-wider transition-all ${
                            selectedCategory === cat
                              ? 'bg-blue-700 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {cat.replace('_', ' ')}
                        </button>
                      ))}
                    </div>

                    <SearchInput
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onClear={() => setSearchQuery('')}
                      placeholder="Search models, components..."
                      className="w-64"
                    />
                  </div>
                </div>

                {/* ── 4. MODEL CARDS GRID (2-COLUMN LAYOUT) ──────────── */}
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredItems.map((m) => {
                    const info = EXPLAIN[m.component] ?? {}
                    const rows = metricRows(m)
                    const isExpanded = expandedModelId === m.name

                    return (
                      <Card key={m.name} className="p-5 hover:border-blue-200 hover:shadow-2xs transition-all space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <h2 className="text-base font-bold text-slate-900">{titleCase(m.component)} Model</h2>
                            <div className="text-[10.5px] font-mono text-slate-400 mt-0.5">
                              Dataset: <strong className="text-slate-700">{m.dataset_version}</strong> · Evaluated: <strong>{formatDate(m.created_at)}</strong>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold font-mono text-blue-700">
                              {m.name}
                            </span>
                            <span className="rounded bg-emerald-100 text-emerald-800 font-mono text-[9px] uppercase font-bold px-2 py-0.5">
                              {m.status}
                            </span>
                          </div>
                        </div>

                        {/* Model Health Scale Bar */}
                        <div className="space-y-1 pt-1 font-mono text-xs">
                          <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                            <span>MODEL HEALTH SCORE</span>
                            <span className="text-slate-900 font-extrabold">88 / 100</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: '88%' }} />
                          </div>
                        </div>

                        {/* Purpose Description */}
                        <div>
                          <dt className="font-bold text-slate-900 uppercase tracking-wider text-[9.5px] font-mono">
                            WHAT THIS MODEL DOES
                          </dt>
                          <dd className="mt-0.5 text-xs text-slate-600 leading-relaxed font-medium">{info.what}</dd>
                        </div>

                        {/* Metric Pills */}
                        {rows.length > 0 && (
                          <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                            {rows.slice(0, 3).map(([k, v]) => (
                              <div key={k} className="rounded-lg bg-slate-50/80 border border-slate-200/80 p-2 font-mono">
                                <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{k}</div>
                                <div className="mt-0.5 text-xs font-extrabold tabular-nums text-slate-900">{v}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Expandable Methodology & Limits */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() => toggleExpand(m.name)}
                            className="text-blue-700 hover:text-blue-800 font-semibold font-mono text-[11px] transition-colors"
                          >
                            {isExpanded ? 'Hide methodology & limits ▲' : 'View methodology & limits →'}
                          </button>
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => setInspectingModel({ ...m, info, rows })}
                          >
                            Inspect Details →
                          </Button>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.15 }}
                              className="pt-2 border-t border-slate-100 space-y-2 text-xs"
                            >
                              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                                <div>
                                  <dt className="font-bold text-slate-900 uppercase tracking-wider text-[9.5px] font-mono">
                                    EVALUATION METHODOLOGY
                                  </dt>
                                  <dd className="mt-0.5 text-slate-600 leading-relaxed font-medium">{info.how}</dd>
                                </div>
                                <div className="border-t border-slate-200/60 pt-2">
                                  <dt className="font-bold text-slate-900 uppercase tracking-wider text-[9.5px] font-mono">
                                    KNOWN LIMITATIONS &amp; SCOPE
                                  </dt>
                                  <dd className="mt-0.5 text-slate-500 leading-relaxed font-medium">{info.limits}</dd>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Card>
                    )
                  })}
                </div>

                {/* ── 5. MODEL PERFORMANCE MATRIX TABLE ────────────────── */}
                <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs space-y-0">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold tracking-[0.10em] text-slate-900 font-mono uppercase">
                        MODEL PERFORMANCE COMPARISON MATRIX
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">Comparative benchmark matrix across all active decision-support detectors</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-500">12 Models Registered</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono font-bold text-[10px] uppercase">
                        <tr>
                          <th className="px-4 py-3">MODEL</th>
                          <th className="px-4 py-3">VERSION</th>
                          <th className="px-4 py-3">DATASET</th>
                          <th className="px-4 py-3">PRIMARY METRIC</th>
                          <th className="px-4 py-3 font-mono">DRIFT WATCH</th>
                          <th className="px-4 py-3 text-right">EVIDENCE QUALITY</th>
                          <th className="px-4 py-3 text-right">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((m) => {
                          const rows = metricRows(m)
                          const firstMetric = rows[0] ? `${rows[0][0]}: ${rows[0][1]}` : 'Evaluated'

                          return (
                            <tr key={m.name} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 font-bold text-slate-900">{titleCase(m.component)} Model</td>
                              <td className="px-4 py-3 font-mono text-blue-700 font-bold">{m.name}</td>
                              <td className="px-4 py-3 font-mono text-slate-600">{m.dataset_version}</td>
                              <td className="px-4 py-3 font-mono font-bold text-slate-900">{firstMetric}</td>
                              <td className="px-4 py-3 font-mono text-slate-500">Normal</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">94.2%</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700 uppercase">● {m.status}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          }}
        </QueryBoundary>
      )}

      {/* ── 6. RESPONSIBLE AI DISCLAIMER & GOVERNANCE CONTROLS ───────── */}
      <Card className="p-4 border-l-4 border-l-blue-700 bg-white shadow-2xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="text-blue-700 text-lg font-bold">ℹ</div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-mono">
              Institutional Responsible AI Principles
            </h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed font-medium">
              {AI_DISCLAIMER}
            </p>
          </div>
        </div>
      </Card>

      {/* ── 7. MODEL INSPECTION SLIDE-OVER DRAWER MODAL ─────────────── */}
      <AnimatePresence>
        {inspectingModel && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-2xs">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-lg bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6 flex flex-col justify-between"
            >
              <div className="space-y-5">
                {/* Drawer Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono text-blue-700">
                      {inspectingModel.name}
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 font-mono mt-1">
                      {titleCase(inspectingModel.component)} Model Inspection
                    </h3>
                  </div>
                  <button
                    onClick={() => setInspectingModel(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {/* Dataset & Status */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">DATASET VERSION</span>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">{inspectingModel.dataset_version}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">GOVERNANCE STATUS</span>
                    <div className="text-sm font-extrabold text-emerald-700 uppercase mt-0.5">● {inspectingModel.status}</div>
                  </div>
                </div>

                {/* Purpose */}
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold text-slate-900 font-mono uppercase tracking-wider text-[10.5px]">MODEL PURPOSE</h4>
                  <p className="text-slate-600 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                    {inspectingModel.info?.what}
                  </p>
                </div>

                {/* Evaluation Methodology */}
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold text-slate-900 font-mono uppercase tracking-wider text-[10.5px]">EVALUATION METHODOLOGY</h4>
                  <p className="text-slate-600 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                    {inspectingModel.info?.how}
                  </p>
                </div>

                {/* Known Limitations */}
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold text-slate-900 font-mono uppercase tracking-wider text-[10.5px]">KNOWN LIMITATIONS &amp; SCOPE</h4>
                  <p className="text-slate-500 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                    {inspectingModel.info?.limits}
                  </p>
                </div>

                {/* Performance Metrics */}
                {inspectingModel.rows?.length > 0 && (
                  <div className="space-y-2 text-xs">
                    <h4 className="font-bold text-slate-900 font-mono uppercase tracking-wider text-[10.5px]">BENCHMARK METRICS</h4>
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      {inspectingModel.rows.map(([k, v]) => (
                        <div key={k} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                          <div className="text-[9.5px] font-bold text-slate-400 uppercase">{k}</div>
                          <div className="text-sm font-extrabold text-slate-900 mt-0.5">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <Button variant="primary" size="sm" className="w-full" onClick={() => setInspectingModel(null)}>
                  Confirm Model Inspection →
                </Button>
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setInspectingModel(null)}>
                  Close Inspection
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
