"""Single source of truth for the smart-queue priority formula (documented in
docs/INVESTIGATION_WORKFLOW.md).

    priority = risk_score × financial_weight × evidence_weight

- risk_score: the current M03 composite (0-100) — the calibrated base signal.
- financial_weight = FLOOR + SPAN · min(1, ln(1+expenditure) / ln(1+P95)):
  log-scaled against the P95 expenditure of the caller's scope so one
  mega-project doesn't flatten the ranking; floored so low-cost high-risk
  projects still surface.
- evidence_weight discounts weakly-evidenced scores so "high score, high
  evidence" outranks "high score, low evidence" — officers get defensible
  cases first.

The queue recomputes live; the value and its breakdown are frozen onto the
case at open time (investigations.priority_score / priority_breakdown) so
"why was this prioritized" stays answerable after risk scores move.
"""
FINANCIAL_FLOOR = 0.6
FINANCIAL_SPAN = 0.4

EVIDENCE_WEIGHTS = {"low": 0.75, "medium": 0.90, "high": 1.0}

# case SLA in days by risk level at open time
SLA_DAYS = {"critical": 7, "high": 14, "moderate": 30, "low": 30}


def financial_weight(expenditure: float, p95: float) -> float:
    import math

    if p95 is None or p95 <= 0:
        return 1.0
    ratio = min(1.0, math.log(1.0 + max(expenditure, 0.0)) / math.log(1.0 + p95))
    return FINANCIAL_FLOOR + FINANCIAL_SPAN * ratio


def priority_breakdown(risk_score: float, expenditure: float, p95: float,
                       evidence_strength: str) -> dict:
    fw = financial_weight(expenditure, p95)
    ew = EVIDENCE_WEIGHTS.get(evidence_strength, 1.0)
    return {
        "risk_score": round(risk_score, 2),
        "financial_weight": round(fw, 4),
        "evidence_weight": ew,
        "scope_p95_expenditure": round(p95, 2) if p95 else None,
        "priority": round(risk_score * fw * ew, 2),
        "formula": "risk_score x financial_weight x evidence_weight",
    }
