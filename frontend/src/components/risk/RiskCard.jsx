import { motion } from 'motion/react'
import { Card } from '../ui'
import { riskMeta, AI_DISCLAIMER } from '../../utils/risk'
import { formatDateTime, formatINR, formatPct, titleCase } from '../../utils/format'

/** Compact human summary per factor type, from real evidence fields only. */
function factorHighlight(f) {
  const ev = f.evidence ?? {}
  switch (f.factor_type) {
    case 'cost_anomaly':
      return ev.deviation_pct != null
        ? `${formatPct(ev.deviation_pct)} above peer median (${ev.peer_n} peers)` : null
    case 'payment_anomaly':
      return ev.ratio_of_sanction != null
        ? `Payment equals ${formatPct(ev.ratio_of_sanction * 100)} of sanction` : ev.rule ? titleCase(ev.rule) : null
    case 'progress_payment_mismatch':
      return ev.financial_utilization_pct != null
        ? `Utilization ${formatPct(ev.financial_utilization_pct)} vs progress ${formatPct(ev.physical_progress_pct)}` : null
    case 'delay_risk':
      return ev.predicted_delay_days != null
        ? `Predicted ${Math.round(ev.predicted_delay_days)} days behind schedule` : null
    case 'duplicate_candidate':
      return ev.geo_km != null
        ? `Similar project ${ev.geo_km.toFixed(1)} km away (composite ${Math.round(ev.composite_score)})` : null
    case 'reconciliation_mismatch':
      return ev.status ? titleCase(ev.status) : null
    default:
      return null
  }
}

export default function RiskCard({ risk }) {
  const meta = riskMeta(risk.risk_level)
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-3">
        {/* Score panel */}
        <div className={`flex flex-col items-center justify-center gap-1 border-b border-border p-6 md:border-b-0 md:border-r ${meta.bg}`}>
          <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Implementation / Review Risk
          </div>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className={`text-5xl font-bold tabular-nums ${meta.text}`}>
            {Math.round(risk.risk_score)}
            <span className="text-2xl font-medium text-text-muted">/100</span>
          </motion.div>
          <div className={`flex items-center gap-1.5 text-lg font-bold uppercase ${meta.text}`}>
            <span aria-hidden="true" className="text-sm">{meta.symbol}</span>{meta.label}
          </div>
          <div className="mt-2 space-y-0.5 text-center text-xs text-text-secondary">
            <div>Evidence strength: <strong className="uppercase">{risk.evidence_strength}</strong></div>
            <div>Data completeness: {formatPct(risk.data_completeness_pct)}</div>
            <div>{risk.signal_count} independent signal{risk.signal_count === 1 ? '' : 's'}</div>
            <div className="text-text-muted">Model {risk.model_version} · {formatDateTime(risk.assessed_at)}</div>
          </div>
        </div>

        {/* Why flagged */}
        <div className="md:col-span-2">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">Why this project needs attention</h2>
          </div>
          <ol className="divide-y divide-border">
            {risk.factors.map((f, i) => {
              const highlight = factorHighlight(f)
              return (
                <li key={f.factor_type} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-text-secondary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{titleCase(f.factor_type)}</span>
                      <span className={`text-xs font-semibold uppercase ${f.severity === 'high' || f.severity === 'critical' ? 'text-risk-critical' : 'text-risk-moderate'}`}>
                        {f.severity}
                      </span>
                      <span className="ml-auto text-sm font-semibold tabular-nums text-text-secondary">
                        +{f.contribution.toFixed(1)}
                      </span>
                    </div>
                    {highlight && <div className="mt-0.5 text-sm text-text-secondary">{highlight}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
      <div className="border-t border-border bg-background px-5 py-2.5 text-[11px] leading-relaxed text-text-muted">
        {AI_DISCLAIMER}
      </div>
    </Card>
  )
}

/** Detailed evidence card per factor, rendered in the Evidence section. */
export function FactorEvidence({ factor }) {
  const ev = factor.evidence ?? {}
  const rows = []
  if (factor.factor_type === 'cost_anomaly' && ev.peer_median != null) {
    rows.push(['Sanctioned cost', formatINR(ev.sanctioned_cost)],
              ['Peer median', formatINR(ev.peer_median)],
              ['Deviation', `+${formatPct(ev.deviation_pct)}`],
              ['Peer group size', ev.peer_n],
              ['Robust z-score', ev.robust_z])
  } else if (factor.factor_type === 'progress_payment_mismatch') {
    rows.push(['Financial utilization', formatPct(ev.financial_utilization_pct)],
              ['Physical progress', formatPct(ev.physical_progress_pct)],
              ['Gap', `${ev.gap_pp} pp`],
              ['Milestone weight completed', formatPct(ev.completed_milestone_weight_pct)])
  } else if (factor.factor_type === 'payment_anomaly') {
    if (ev.max_payment != null) rows.push(['Payment amount', formatINR(ev.max_payment)])
    if (ev.ratio_of_sanction != null) rows.push(['Share of sanction', formatPct(ev.ratio_of_sanction * 100)])
    if (ev.payments_same_day != null) rows.push(['Same-day payments', ev.payments_same_day])
    if (ev.rules_triggered) rows.push(['Rules triggered', ev.rules_triggered.join(', ')])
  } else if (factor.factor_type === 'delay_risk') {
    rows.push(['Predicted delay', `${Math.round(ev.predicted_delay_days)} days`])
  } else if (factor.factor_type === 'duplicate_candidate') {
    if (ev.text_sim != null) rows.push(['Title similarity', formatPct(ev.text_sim * 100)])
    if (ev.geo_km != null) rows.push(['Distance', `${ev.geo_km.toFixed(2)} km`])
    if (ev.composite_score != null) rows.push(['Composite score', `${Math.round(ev.composite_score)}/100`])
    if (ev.other_project_id) rows.push(['Candidate project', `#${ev.other_project_id}`])
  } else {
    Object.entries(ev).slice(0, 6).forEach(([k, v]) =>
      rows.push([titleCase(k), typeof v === 'object' ? JSON.stringify(v) : String(v)]))
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{titleCase(factor.factor_type)}</h3>
        <span className="text-sm font-semibold tabular-nums text-text-secondary">+{factor.contribution.toFixed(1)} pts</span>
      </div>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 text-sm">
            <dt className="text-text-secondary">{k}</dt>
            <dd className="font-medium tabular-nums text-text-primary">{v ?? '—'}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-text-secondary">
        {factor.explanation}
      </p>
    </div>
  )
}
