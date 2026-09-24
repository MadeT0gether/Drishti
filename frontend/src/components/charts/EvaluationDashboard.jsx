import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader } from '../ui'
import { titleCase } from '../../utils/format'

/** Model-evaluation visualizations. Every number comes from the
 *  /models/evaluation artifact (computed against the ground-truth ledger by
 *  scripts/evaluate) — nothing is estimated in the browser. Charts are
 *  single-hue by design; exact-value comparisons render as tables. */

const ACCENT = '#4f46e5'
const ACCENT_SOFT = '#a5b4fc'

const pct = (v) => (v == null ? '—' : `${Math.round(v * 1000) / 10}%`)
const num = (v) => (v == null ? '—' : v)

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-text-primary">{value}</div>
      {sub && <div className="text-xs text-text-secondary">{sub}</div>}
    </div>
  )
}

/** Single-series precision@K bars with direct labels. */
function AtKChart({ title, subtitle, points, note }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="p-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={points} margin={{ top: 18, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="k" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false}
                   tickLine={false} tickFormatter={(v) => `${v * 100}%`} />
            <Tooltip formatter={(v) => pct(v)} cursor={{ fill: '#f1f5f9' }} />
            <Bar dataKey="value" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={44}>
              <LabelList dataKey="value" position="top" formatter={pct}
                         style={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {note && <p className="mt-1 text-xs text-text-muted">{note}</p>}
      </div>
    </Card>
  )
}

/** 2x2 confusion matrix as a shaded grid — exact counts always visible. */
function ConfusionMatrix({ title, subtitle, confusion, positiveLabel }) {
  const { tp, fp, tn, fn } = confusion
  const max = Math.max(tp, fp, tn, fn, 1)
  const cell = (label, v, isCorrect) => (
    <div className="flex flex-col items-center justify-center rounded-md border border-border p-3"
         style={{ background: `rgba(${isCorrect ? '79,70,229' : '220,38,38'}, ${0.06 + 0.30 * (v / max)})` }}>
      <span className="text-lg font-bold tabular-nums text-text-primary">{v.toLocaleString()}</span>
      <span className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</span>
    </div>
  )
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="p-4">
        <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 text-xs text-text-muted">
          <span />
          <span className="text-center font-medium">Flagged {positiveLabel}</span>
          <span className="text-center font-medium">Not flagged</span>
          <span className="font-medium [writing-mode:sideways-lr]">Actually {positiveLabel}</span>
          {cell('True positive', tp, true)}
          {cell('False negative', fn, false)}
          <span className="font-medium [writing-mode:sideways-lr]">Actually normal</span>
          {cell('False positive', fp, false)}
          {cell('True negative', tn, true)}
        </div>
      </div>
    </Card>
  )
}

/** Horizontal single-hue bars for feature importance. */
function FeatureImportance({ importance }) {
  const rows = Object.entries(importance)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
  const max = rows[0]?.[1] ?? 1
  return (
    <Card>
      <CardHeader title="Delay model — feature importance"
                  subtitle="Top drivers of the held-out delay prediction (XGBoost gain)" />
      <ul className="space-y-2 p-4">
        {rows.map(([name, v]) => (
          <li key={name} className="grid grid-cols-[150px_1fr_48px] items-center gap-2 text-xs">
            <span className="truncate text-text-secondary" title={name}>{titleCase(name)}</span>
            <div className="h-3 rounded-sm bg-slate-100">
              <div className="h-full rounded-sm" style={{ width: `${(v / max) * 100}%`, background: ACCENT }} />
            </div>
            <span className="text-right tabular-nums font-medium text-text-primary">{pct(v)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Exact-value comparison across detectors — a table, with inline bars. */
function DetectorTable({ metrics }) {
  const rows = [
    ['Cost anomaly', metrics.cost_anomaly],
    ['Payment anomaly', metrics.payment_anomaly],
    ['Progress/payment mismatch', metrics.progress_payment_mismatch],
    ['Reconciliation', metrics.reconciliation],
    ['Data quality', metrics.data_quality],
    ['Vendor concentration', metrics.vendor_concentration_districts],
    ['Relationship patterns', metrics.relationship_patterns_pairs],
  ].filter(([, m]) => m)
  const bar = (v) => (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-16 rounded-sm bg-slate-100">
        <div className="h-full rounded-sm" style={{ width: `${(v ?? 0) * 100}%`, background: ACCENT_SOFT }} />
      </div>
      <span className="tabular-nums">{pct(v)}</span>
    </div>
  )
  return (
    <Card>
      <CardHeader title="Detector precision / recall / F1"
                  subtitle="Measured against the planted ground-truth ledger" />
      <div className="overflow-x-auto p-2">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-border text-left uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2 font-medium">Detector</th>
              <th className="px-3 py-2 font-medium">Precision</th>
              <th className="px-3 py-2 font-medium">Recall</th>
              <th className="px-3 py-2 font-medium">F1</th>
              <th className="px-3 py-2 font-medium">TP / FP / FN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(([name, m]) => (
              <tr key={name}>
                <td className="px-3 py-2 font-medium text-text-primary">{name}</td>
                <td className="px-3 py-2">{bar(m.precision)}</td>
                <td className="px-3 py-2">{bar(m.recall)}</td>
                <td className="px-3 py-2">{bar(m.f1)}</td>
                <td className="px-3 py-2 tabular-nums text-text-secondary">
                  {num(m.tp)} / {num(m.fp)} / {num(m.fn)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function VariantRecall({ per_variant }) {  const rows = Object.entries(per_variant)
  return (
    <Card>
      <CardHeader title="Reconciliation — recall by mismatch variant"
                  subtitle="How many planted mismatches of each kind were caught" />
      <ul className="space-y-2 p-4">
        {rows.map(([name, v]) => (
          <li key={name} className="grid grid-cols-[150px_1fr_72px] items-center gap-2 text-xs">
            <span className="text-text-secondary">{titleCase(name)}</span>
            <div className="h-3 rounded-sm bg-slate-100">
              <div className="h-full rounded-sm" style={{ width: `${v.recall * 100}%`, background: ACCENT }} />
            </div>
            <span className="text-right tabular-nums font-medium text-text-primary">
              {v.caught}/{v.total} ({pct(v.recall)})
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Stage 7 feedback loop — do closed human case outcomes agree with the
 *  flagged signal families? Renders only when the artifact carries
 *  field_feedback (closed cases with recorded outcomes). */
function FieldFeedback({ feedback }) {
  const rows = Object.entries(feedback.by_signal ?? {})
  return (
    <Card>
      <CardHeader title="Field feedback — outcome agreement by signal"
                  subtitle="Closed investigation cases vs the signal families flagged on them" />
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile label="Closed cases" value={feedback.closed_cases_with_outcome ?? '—'}
                    sub="with a recorded outcome" />
          <StatTile label="Confirmed" value={feedback.confirmed ?? '—'}
                    sub="review found a real issue" />
          <StatTile label="Not confirmed" value={feedback.refuted ?? '—'}
                    sub="review found no issue" />
          <StatTile label="Agreement rate" value={feedback.agreement_rate != null ? pct(feedback.agreement_rate) : '—'}
                    sub="confirmed ÷ decisive cases" />
        </div>
        {rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map(([name, v]) => (
              <li key={name} className="grid grid-cols-[150px_1fr_72px] items-center gap-2 text-xs">
                <span className="text-text-secondary">{titleCase(name.replaceAll('_', ' '))}</span>
                <div className="h-3 rounded-sm bg-slate-100">
                  <div className="h-full rounded-sm" style={{ width: `${(v.agreement_rate ?? 0) * 100}%`, background: ACCENT }} />
                </div>
                <span className="text-right tabular-nums font-medium text-text-primary">
                  {v.agreement_rate != null ? pct(v.agreement_rate) : '—'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">
            No decisive closed cases yet — open cases from the queue and record outcomes to start the loop.
          </p>
        )}
        {feedback.note && <p className="text-xs text-text-muted">{feedback.note}</p>}
      </div>
    </Card>
  )
}

export default function EvaluationDashboard({ evaluation }) {
  const m = evaluation.metrics
  const delay = m.delay_model_heldout
  const overrun = m.overrun_model_heldout
  const riskPk = m.risk_ranking
  const dupQueue = m.duplicate_ranked_queue

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Dataset" value={evaluation.dataset_version}
                  sub={`seed ${evaluation.dataset_seed} · ${evaluation.n_projects_evaluable?.toLocaleString()} evaluable projects`} />
        <StatTile label="Delay MAE (held-out)" value={delay ? `${delay.mae_days} days` : '—'}
                  sub={delay ? `RMSE ${delay.rmse_days} days · ${delay.test_rows?.toLocaleString()} test rows` : 'Not evaluated'} />
        <StatTile label="Overrun F1 (held-out)" value={overrun ? overrun.f1 : '—'}
                  sub={overrun ? `precision ${overrun.precision} · recall ${overrun.recall}` : 'Not evaluated'} />
        <StatTile label="Risk ranking P@100" value={riskPk ? pct(riskPk.precision_at_100) : '—'}
                  sub={riskPk ? `${riskPk.ground_truth_positive_projects?.toLocaleString()} ground-truth positives` : 'Not evaluated'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {riskPk && (
          <AtKChart title="Risk ranking — precision at K"
                    subtitle="Share of the top-K riskiest projects that carry a planted anomaly"
                    points={[10, 50, 100, 250].map((k) => ({ k: `Top ${k}`, value: riskPk[`precision_at_${k}`] }))} />
        )}
        {dupQueue && (
          <AtKChart title="Duplicate queue — precision at K"
                    subtitle="Ranked duplicate-candidate queue vs planted duplicates"
                    points={[100, 200, 300, 500].map((k) => ({ k: `Top ${k}`, value: dupQueue[`precision_at_${k}`] }))}
                    note={`Hard negatives (legitimate look-alikes) in top 100/200/300/500: `
                      + `${dupQueue.hard_negatives_in_top_100}/${dupQueue.hard_negatives_in_top_200}`
                      + `/${dupQueue.hard_negatives_in_top_300}/${dupQueue.hard_negatives_in_top_500}`} />
        )}
        {delay?.delayed_gt_60d_classification?.confusion && (
          <ConfusionMatrix title="Delay >60 days — confusion matrix"
                           subtitle={`Held-out split · F1 ${delay.delayed_gt_60d_classification.f1}`}
                           confusion={delay.delayed_gt_60d_classification.confusion}
                           positiveLabel="delayed" />
        )}
        {overrun?.confusion && (
          <ConfusionMatrix title="Cost overrun — confusion matrix"
                           subtitle={`Held-out split · F1 ${overrun.f1}`}
                           confusion={overrun.confusion} positiveLabel="overrun" />
        )}
        {delay?.feature_importance && <FeatureImportance importance={delay.feature_importance} />}
        {m.reconciliation?.per_variant && <VariantRecall per_variant={m.reconciliation.per_variant} />}
      </div>

      <DetectorTable metrics={m} />

      {evaluation.field_feedback && <FieldFeedback feedback={evaluation.field_feedback} />}

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-text-primary">Methodology & limitations</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-text-secondary">
          {evaluation.methodology_notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </Card>
    </div>
  )
}
