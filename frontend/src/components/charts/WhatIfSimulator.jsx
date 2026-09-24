import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { modelsApi } from '../../services/api'
import { Card, CardHeader, QueryBoundary, Skeleton } from '../ui'
import { formatNumber } from '../../utils/format'

/** Risk-threshold what-if. SIMULATION ONLY: slides a hypothetical review
 *  threshold over the real (scoped) score distribution. Never touches
 *  production scores, levels or queue priorities. */
export default function WhatIfSimulator() {
  const sim = useQuery({
    queryKey: ['risk-simulation'],
    queryFn: modelsApi.riskSimulation,
    staleTime: 300_000,
  })
  return (
    <Card>
      <CardHeader
        title={<span>What-if: review threshold
          <span className="ml-2 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            Simulation
          </span></span>}
        subtitle="Hypothetical only — production risk scores, levels and queue priorities are not changed" />
      <QueryBoundary query={sim} skeleton={<Skeleton className="m-4 h-40" />}>
        {(data) => <SimulatorBody data={data} />}
      </QueryBoundary>
    </Card>
  )
}

function SimulatorBody({ data }) {
  const currentHighMin = data.level_boundaries.find((b) => b.level === 'high')?.min_score ?? 61
  const [threshold, setThreshold] = useState(80)

  // slider values are bucket-aligned (multiples of 5), so this sum is exact
  const simulated = useMemo(
    () => data.histogram.reduce((n, h) => n + (h.bucket_start >= threshold ? h.count : 0), 0),
    [data, threshold])
  const current = data.current_high_or_critical
  const diff = simulated - current

  return (
    <div className="space-y-4 p-5">
      <label className="block text-xs font-medium text-text-secondary">
        Simulated review threshold: score ≥{' '}
        <span className="text-sm font-bold tabular-nums text-text-primary">{threshold}</span>
        <input type="range" min="30" max="100" step="5" value={threshold}
               onChange={(e) => setThreshold(Number(e.target.value))}
               aria-label="Simulated risk threshold"
               className="mt-2 w-full accent-[#4f46e5]" />
      </label>
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-text-muted">Current (high+critical, ≥ {currentHighMin})</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-text-primary">{formatNumber(current)}</dd>
        </div>
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
          <dt className="text-xs text-text-muted">Simulated (≥ {threshold})</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-accent">{formatNumber(simulated)}</dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-text-muted">Difference</dt>
          <dd className={`mt-1 text-lg font-bold tabular-nums ${diff > 0 ? 'text-risk-high' : 'text-text-primary'}`}>
            {diff > 0 ? '+' : ''}{formatNumber(diff)}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-text-muted">
        {formatNumber(data.total_assessed)} assessed projects in your scope · counts use
        5-point buckets · {data.note}
      </p>
    </div>
  )
}
