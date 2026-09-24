import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { copilotApi, investigationsApi } from '../../services/api'
import { Card, CardHeader } from '../ui'
import SakshiLoader from '../ui/SakshiLoader'
import MarkdownLite from '../ui/MarkdownLite'

/** Grounded AI Copilot panel. Both modes are first-class: "llm" answers come
 *  from the configured model, "deterministic" answers from the verified
 *  evidence engine — the badge always says which. Drafts are only persisted
 *  when the officer explicitly accepts them. */
// quick prompts; entries with `factor` only appear when that risk-factor
// family is present on the case
const QUICK_PROMPTS = [
  { text: 'Why is this project risky?' },
  { text: 'Show the strongest evidence.' },
  { text: 'What should I investigate first?' },
  { text: 'Summarize the financial anomaly.',
    factor: ['payment_anomaly', 'cost_anomaly', 'progress_payment_mismatch', 'reconciliation_mismatch'] },
  { text: 'Explain the duplicate candidate.', factor: ['duplicate_candidate'] },
  { text: 'What should I verify on site?' },
  { text: 'Show relevant investigation guidance.' },
]

export default function CopilotPanel({ investigationId, canAct, factorTypes = [] }) {
  const qc = useQueryClient()
  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState([])
  const [draft, setDraft] = useState(null)

  const status = useQuery({
    queryKey: ['copilot-status'],
    queryFn: copilotApi.status,
    staleTime: 5 * 60_000,
  })
  const modeLabel = (mode) => mode === 'llm'
    ? `AI model (${status.data?.model ?? 'groq/llama-3.3-70b-versatile'})`
    : 'Deterministic — verified project evidence'

  const invalidateTimeline = () => {
    qc.invalidateQueries({ queryKey: ['investigation', String(investigationId)] })
    qc.invalidateQueries({ queryKey: ['investigation-actions', String(investigationId)] })
  }

  const ask = useMutation({
    mutationFn: (q) => copilotApi.ask(investigationId, q),
    onSuccess: (answer, q) => {
      setExchanges((prev) => [...prev, { q, answer }])
      setQuestion('')
      invalidateTimeline()
    },
  })
  const summarize = useMutation({
    mutationFn: () => copilotApi.summary(investigationId),
    onSuccess: (answer) => {
      setDraft(answer)
      invalidateTimeline()
    },
  })
  const acceptDraft = useMutation({
    mutationFn: () => investigationsApi.updateSummary(investigationId, {
      summary: draft.answer.slice(0, 8000),
      reason: 'Accepted the AI-drafted case summary after review.',
      source: 'copilot',
    }),
    onSuccess: () => {
      setDraft(null)
      invalidateTimeline()
    },
  })

  const submit = (e) => {
    e.preventDefault()
    const q = question.trim()
    if (q.length >= 3 && !ask.isPending && !summarize.isPending) ask.mutate(q)
  }

  return (
    <Card>
      <CardHeader
        title="Sakshi — AI Investigation Copilot"
        subtitle={status.data
          ? `Mode: ${modeLabel(status.data.mode)}`
          : 'Checking Copilot mode…'}
        action={canAct && (
          <button onClick={() => summarize.mutate()} disabled={summarize.isPending || ask.isPending}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-border-strong hover:text-text-primary disabled:opacity-40">
            {summarize.isPending ? 'Drafting…' : 'Draft case summary'}
          </button>
        )}
      />

      <div className="space-y-4 p-5">
        {exchanges.length === 0 && !draft && !ask.isPending && !summarize.isPending && (
          <p className="text-sm text-text-muted">
            Ask about this case — answers are grounded only in verified project
            evidence and approved guidelines, with citations.
          </p>
        )}

        <div aria-live="polite" className="space-y-4">
          {exchanges.map((x, i) => (
            <div key={i} className="space-y-2 motion-safe:animate-[fade-slide-in_200ms_ease-out]">
              <p className="text-sm font-medium text-text-primary">Q: {x.q}</p>
              <AnswerBlock answer={x.answer} modeLabel={modeLabel} />
            </div>
          ))}
          {ask.isPending && (
            <SakshiLoader message="Analyzing case evidence & approved guidelines..." />
          )}
          {summarize.isPending && (
            <SakshiLoader message="Drafting comprehensive case summary..." />
          )}
        </div>

        {draft && (
          <div className="rounded-md border border-accent/40 bg-accent/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Draft summary — not saved until you accept it
              </p>
              <span className="text-xs text-text-muted">{modeLabel(draft.mode)}</span>
            </div>
            <MarkdownLite text={draft.answer} className="mt-2 font-sans text-sm text-text-secondary" />
            {canAct && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => acceptDraft.mutate()} disabled={acceptDraft.isPending}
                        className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                  {acceptDraft.isPending ? 'Saving…' : 'Accept as case summary'}
                </button>
                <button onClick={() => setDraft(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
                  Discard
                </button>
              </div>
            )}
          </div>
        )}

        {(ask.isError || summarize.isError) && (
          <p className="text-xs font-medium text-danger" role="alert">
            {(ask.error ?? summarize.error)?.response?.data?.detail ?? 'The Copilot request failed.'}
          </p>
        )}

        {canAct && (
          <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
            {QUICK_PROMPTS
              .filter((q) => !q.factor || q.factor.some((f) => factorTypes.includes(f)))
              .map((q) => (
                <button key={q.text} type="button" disabled={ask.isPending}
                        onClick={() => !ask.isPending && ask.mutate(q.text)}
                        className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-40">
                  {q.text}
                </button>
              ))}
          </div>
        )}

        {canAct ? (
          <form onSubmit={submit} className="flex gap-2">
            <label htmlFor="copilot-q" className="sr-only">Ask the Copilot</label>
            <input id="copilot-q" value={question} onChange={(e) => setQuestion(e.target.value)}
                   placeholder="e.g. Why is this project high risk? Are the payments unusual?"
                   maxLength={500}
                   className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-text-muted focus:border-accent" />
            <button type="submit" disabled={question.trim().length < 3 || ask.isPending}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {ask.isPending ? 'Thinking…' : 'Ask'}
            </button>
          </form>
        ) : (
          <p className="text-xs text-text-muted">Your role has read-only access; the Copilot is available to acting officers.</p>
        )}

        <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-text-muted">
          {exchanges[exchanges.length - 1]?.answer.disclaimer ?? status.data?.disclaimer ??
            'AI-generated content is decision support only; final decisions remain with authorized officials.'}
        </p>
      </div>
    </Card>
  )
}

function AnswerBlock({ answer, modeLabel }) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          AI Copilot
        </span>
        <span className="text-xs text-text-muted">{modeLabel(answer.mode)}</span>
        {answer.fallback_reason && (
          <span className="text-xs text-text-muted">· served by fallback ({answer.fallback_reason})</span>
        )}
      </div>
      <MarkdownLite text={answer.answer} className="mt-2 font-sans text-sm text-text-secondary" />
      {answer.citations?.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          Evidence: {answer.citations.map((c) => c.source_ref).join(' · ')}
        </p>
      )}
    </div>
  )
}
