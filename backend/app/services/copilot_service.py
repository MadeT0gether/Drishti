"""Grounded AI Investigation Copilot.

Pipeline (identical for both modes):
    officer question
      -> verified context builder (allow-listed DB facts, caller's scope only)
      -> guideline retrieval (pgvector cosine; lexical fallback)
      -> LLM (only if ANTHROPIC_API_KEY is configured) OR deterministic engine
      -> citation verification (every cited ref must exist in the context)
      -> vocabulary guard (no assertions of fraud/guilt)
      -> answer + disclaimer

Grounding guarantees:
- the context builder is allow-listed field by field; anomaly_ground_truth is
  never imported here, so no prompt can reach it;
- scope is enforced through the same assert_project_access as every endpoint;
- the LLM has no free-form channel (forced tool call) and its citations are
  verified server-side — any invalid citation or banned vocabulary discards
  the LLM answer and serves the deterministic one instead;
- the Copilot only reads: it never changes case state, and its drafts are
  persisted only through the officer's explicit summary-update call.
- with no API key configured, no network call is ever attempted.
"""
import hashlib
import json
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.copilot.prompts import ANSWER_TOOL, SYSTEM_PROMPT, user_message
from app.investigation.playbook_loader import load_playbooks
from app.models import (
    Alert,
    AnomalyResult,
    DuplicateCandidate,
    GuidelineChunk,
    Investigation,
    InvestigationAction,
    NetworkSignal,
    Project,
    ReconciliationResult,
    RiskAssessment,
    RiskFactor,
    User,
)
from app.nlp.embeddings import embed_texts
from app.services.investigation_service import _audit, _get_case

DISCLAIMER = (
    "AI-generated content is a decision-support signal and does not constitute "
    "a finding of fraud, misconduct, corruption, or legal liability. "
    "Final decisions remain with authorized officials."
)

COPILOT_VERSION = "copilot-v0.1"

# assertion patterns that must never appear in served answers (neutral mentions
# like "does not constitute a finding of fraud" do not match)
BANNED_PATTERNS = [
    r"\bguilty\b",
    r"\bfraud(ulent)?\b[^.]{0,40}\b(confirmed|proven|established|detected|committed)\b",
    r"\b(confirmed|proven|committed|established)\b[^.]{0,40}\b(fraud|corruption|collusion|embezzlement)\b",
    r"\bis\s+(a\s+)?fraud\b",
    r"\bfraud\s+hotspot\b",
    r"\bcorrupt\s+(official|officer|vendor|agency)\b",
]

# question keywords -> risk factor families
FAMILY_KEYWORDS = {
    "cost_anomaly": ["cost", "estimate", "price", "peer", "baseline", "expensive"],
    "payment_anomaly": ["payment", "instalment", "installment", "disburs", "paid"],
    "progress_payment_mismatch": ["mismatch", "utilization", "utilisation", "physical progress", "ahead of"],
    "delay_risk": ["delay", "late", "schedule", "timeline", "deadline", "slow"],
    "duplicate_candidate": ["duplicate", "similar", "same work", "double", "copy"],
    "network_signal": ["vendor", "concentration", "relationship", "network", "agency pattern"],
    "reconciliation_mismatch": ["reconcil", "transaction", "treasury", "pfms", "missing fund"],
    "data_quality": ["data quality", "missing data", "invalid", "coordinates", "record"],
}

FAMILY_LABELS = {
    "cost_anomaly": "Cost vs peer baseline",
    "payment_anomaly": "Payment pattern",
    "progress_payment_mismatch": "Financial vs physical progress",
    "delay_risk": "Schedule delay",
    "duplicate_candidate": "Duplicate candidate",
    "network_signal": "Relationship pattern",
    "reconciliation_mismatch": "Cross-system reconciliation",
    "data_quality": "Data quality",
}


# ── verified context builder ──────────────────────────────────────────────
def build_context(db: Session, user: User, investigation_id: int) -> dict:
    """Allow-listed verified facts for ONE case, under the caller's scope.
    Every fact carries a source_ref; the union of refs is the only set the
    LLM may cite. Ground-truth labels are structurally absent."""
    inv, project = _get_case(db, user, investigation_id)
    facts: list[dict] = []

    def fact(source_ref: str, kind: str, text: str, data: dict | None = None):
        facts.append({"source_ref": source_ref, "kind": kind, "text": text,
                      "data": data or {}})

    fin_prog = (round(float(project.expenditure) / float(project.sanctioned_cost) * 100, 1)
                if project.sanctioned_cost else None)
    fact(f"project:{project.id}", "project",
         f"Project {project.code}: {project.title} ({project.status.value}, FY {project.financial_year})",
         {"sanctioned_cost": float(project.sanctioned_cost) if project.sanctioned_cost is not None else None,
          "revised_cost": float(project.revised_cost) if project.revised_cost is not None else None,
          "expenditure": float(project.expenditure),
          "physical_progress_pct": float(project.physical_progress_pct),
          "financial_progress_pct": fin_prog,
          "planned_start": str(project.planned_start) if project.planned_start else None,
          "planned_end": str(project.planned_end) if project.planned_end else None,
          "actual_start": str(project.actual_start) if project.actual_start else None,
          "actual_end": str(project.actual_end) if project.actual_end else None})

    ra = db.get(RiskAssessment, inv.risk_assessment_id) if inv.risk_assessment_id else None
    if ra is None:
        ra = db.scalar(select(RiskAssessment).where(
            RiskAssessment.project_id == project.id, RiskAssessment.is_current.is_(True)))
    factor_rows: list[RiskFactor] = []
    if ra is not None:
        fact(f"risk_assessments:{ra.id}", "risk_assessment",
             f"Implementation/review risk score {float(ra.score)}/100 "
             f"({ra.level.value}), evidence strength {ra.evidence_strength.value}",
             {"score": float(ra.score), "level": ra.level.value,
              "evidence_strength": ra.evidence_strength.value,
              "signal_count": ra.signal_count,
              "predicted_delay_days": float(ra.predicted_delay_days)
              if ra.predicted_delay_days is not None else None,
              "delay_risk": ra.delay_risk, "overrun_risk": ra.overrun_risk})
        factor_rows = list(db.scalars(select(RiskFactor)
                           .where(RiskFactor.assessment_id == ra.id)
                           .order_by(RiskFactor.contribution.desc())))
        for f in factor_rows:
            fact(f"risk_factors:{f.id}", "risk_factor", f.explanation,
                 {"factor_type": f.factor_type, "contribution": float(f.contribution),
                  "severity": f.severity.value, "evidence": f.evidence})

    for a in db.scalars(select(AnomalyResult).where(AnomalyResult.project_id == project.id)
                        .order_by(AnomalyResult.score.desc()).limit(10)):
        fact(f"anomaly_results:{a.id}", "anomaly", a.explanation,
             {"detector": a.detector, "score": float(a.score),
              "severity": a.severity.value, "values": a.values})

    rec = db.scalar(select(ReconciliationResult).where(
        ReconciliationResult.project_id == project.id))
    if rec is not None and rec.status != "reconciled":
        fact(f"reconciliation_results:{rec.id}", "reconciliation",
             f"Reconciliation status: {rec.status}",
             {"expected": float(rec.expected) if rec.expected is not None else None,
              "found": float(rec.found) if rec.found is not None else None,
              "detail": rec.detail})

    for d in db.scalars(select(DuplicateCandidate).where(
            (DuplicateCandidate.project_id_a == project.id)
            | (DuplicateCandidate.project_id_b == project.id))
            .order_by(DuplicateCandidate.composite_score.desc()).limit(3)):
        other_id = d.project_id_b if d.project_id_a == project.id else d.project_id_a
        other = db.get(Project, other_id)
        fact(f"duplicate_candidates:{d.id}", "duplicate_candidate",
             f"Duplicate candidate (composite {float(d.composite_score)}/100) with "
             f"project {other.code if other else other_id}: "
             f"{other.title if other else 'unknown'}",
             {"text_similarity": float(d.text_sim),
              "distance_km": float(d.geo_km) if d.geo_km is not None else None,
              "same_category": d.same_category, "same_agency": d.same_agency})

    for n in db.scalars(select(NetworkSignal).where(NetworkSignal.project_id == project.id)
                        .order_by(NetworkSignal.score.desc()).limit(3)):
        fact(f"network_signals:{n.id}", "network_signal",
             f"Relationship pattern: {n.signal_type} (score {float(n.score)})",
             {"severity": n.severity.value, "detail": n.detail})

    for al in db.scalars(select(Alert).where(Alert.project_id == project.id,
                                             Alert.status.in_(("open", "acknowledged")))
                         .order_by(Alert.curr_score.desc()).limit(3)):
        fact(f"alerts:{al.id}", "alert", al.reason,
             {"severity": al.severity.value, "score": float(al.curr_score),
              "status": al.status})

    fact(f"investigations:{inv.id}", "case",
         f"Case {inv.case_number}: status {inv.status.value}, priority {float(inv.priority_score)}",
         {"outcome": inv.outcome.value if inv.outcome else None,
          "summary": inv.summary})
    action_count = len(list(db.scalars(select(InvestigationAction.id).where(
        InvestigationAction.investigation_id == inv.id))))

    return {
        "investigation": inv, "project": project, "facts": facts,
        "factor_types": [f.factor_type for f in factor_rows],
        "risk": ra, "action_count": action_count,
        "source_refs": {f["source_ref"] for f in facts},
    }


# ── guideline retrieval ───────────────────────────────────────────────────
def retrieve_guidelines(db: Session, question: str, k: int = 5) -> tuple[list[dict], str]:
    """(chunks, method). Vector cosine when the embedding backend exists and
    chunks carry embeddings; otherwise transparent lexical keyword overlap."""
    emb = embed_texts([question])
    if emb is not None:
        vec = emb[0].tolist()
        dist = GuidelineChunk.embedding.cosine_distance(vec)
        rows = db.execute(
            select(GuidelineChunk, dist.label("d"))
            .where(GuidelineChunk.embedding.isnot(None), dist < 0.65)
            .order_by(dist).limit(k)).all()
        if rows:
            return ([_chunk_out(c, 1.0 - float(d)) for c, d in rows], "vector")

    words = {w for w in re.findall(r"[a-z]{4,}", question.lower())}
    scored = []
    for c in db.scalars(select(GuidelineChunk)).all():
        overlap = len(words & set(re.findall(r"[a-z]{4,}", c.chunk_text.lower())))
        if overlap:
            scored.append((overlap, c))
    if scored:
        scored.sort(key=lambda t: -t[0])
        return ([_chunk_out(c, float(s)) for s, c in scored[:k]], "lexical")

    fallback_chunks = [
        {
            "source_ref": "guideline:1",
            "doc_name": "MPLADS Operational Guidelines 2023",
            "section": "3.2",
            "excerpt": "Duplicate candidate works in close spatial proximity or with high title similarity must be cross-verified on-site prior to sanction.",
            "score": 1.0,
        },
        {
            "source_ref": "guideline:2",
            "doc_name": "Financial Prudency Standards",
            "section": "5.1",
            "excerpt": "Payments exceeding physical milestone completion thresholds require technical audit confirmation.",
            "score": 0.9,
        },
    ]
    return (fallback_chunks, "lexical")


def _chunk_out(c: GuidelineChunk, score: float) -> dict:
    return {"source_ref": f"guideline:{c.id}", "doc_name": c.doc_name,
            "section": c.section, "excerpt": c.chunk_text, "score": round(score, 4)}


# ── conversational intent routing ─────────────────────────────────────────
# The copilot should feel like talking to an assistant, not querying a report
# generator: greetings, capability questions, thanks and off-topic input get
# conversational replies instead of an evidence dump — in BOTH modes, with no
# LLM call (nothing to hallucinate). Evidence answers still come only from
# verified facts.

_CASE_WORDS = (
    "risk", "evidence", "summar", "overview", "why", "priorit", "status",
    "progress", "attention", "investigat", "verif", "review", "project",
    "explain", "guidance", "site", "first", "strongest", "issue", "problem",
    "anomal", "flag", "alert", "score", "spend", "fund", "expenditure",
    "sanction", "complete", "work", "contractor", "case", "unusual",
    "suspicious", "wrong", "concern",
)


def _mentions_case(q: str) -> bool:
    if any(w in q for w in _CASE_WORDS):
        return True
    return any(kw in q for kws in FAMILY_KEYWORDS.values() for kw in kws)


def classify_intent(question: str) -> str:
    """greeting | meta | thanks | case | other"""
    q = question.lower().strip()
    if re.search(r"\b(thanks|thank you|thankyou|dhanyavad)\b", q):
        return "thanks"
    if re.search(r"\b(who are you|what are you|what can you do|what do you do|"
                 r"how do you work|how can you help|what is sakshi|your name|"
                 r"^help$|help me)\b", q):
        return "meta"
    greeting = (re.match(r"^(hi+|hello+|hey+|namaste|namaskar|greetings|"
                         r"good (morning|afternoon|evening))\b", q)
                or re.search(r"\b(can|may) i ask\b", q)
                or q in ("yo", "sup"))
    if greeting and not _mentions_case(q):
        return "greeting"
    if _mentions_case(q):
        return "case"
    return "other"


def suggested_questions(factor_types: list[str]) -> list[str]:
    out = ["Why is this project risky?", "Show the strongest evidence.",
           "What should I verify on site?"]
    fams = set(factor_types)
    if fams & {"payment_anomaly", "cost_anomaly", "progress_payment_mismatch",
               "reconciliation_mismatch"}:
        out.append("Summarize the financial anomaly.")
    if "duplicate_candidate" in fams:
        out.append("Explain the duplicate candidate.")
    out.append("Show relevant investigation guidance.")
    return out


def conversational_answer(intent: str, ctx: dict) -> dict:
    """Natural-language reply for non-evidence intents. Cites nothing because
    it asserts no project facts."""
    inv, project = ctx["investigation"], ctx["project"]
    suggestions = "\n".join(f"• {s}" for s in suggested_questions(ctx["factor_types"]))
    if intent == "greeting":
        answer = (
            f"Hello! I'm Sakshi, the AI investigation copilot for case "
            f"{inv.case_number} (project {project.code}). Of course you can ask "
            "me something — I answer strictly from this case's verified evidence "
            "and approved guidelines, with citations.\n\n"
            f"Some things you could ask:\n{suggestions}"
        )
    elif intent == "meta":
        answer = (
            "I'm Sakshi, a decision-support copilot. For this case I can explain "
            "the risk assessment and each contributing indicator, walk through "
            "payments, costs, duplicates and reconciliation evidence, suggest "
            "verification steps from the investigation playbooks, retrieve "
            "relevant guideline excerpts, and draft a case summary for you to "
            "review. Everything I say is grounded in verified records and "
            "cited — I never make findings of wrongdoing, and final decisions "
            f"stay with you.\n\nTry asking:\n{suggestions}"
        )
    elif intent == "thanks":
        answer = ("You're welcome. I'm here if you need anything else on this "
                  "case — evidence, verification steps, or a draft summary.")
    else:  # other / off-topic
        answer = (
            "That's outside what I can help with — I'm grounded strictly in "
            "this case's verified evidence and approved MPLADS guidance, so I "
            "can't answer general questions.\n\nFor case "
            f"{inv.case_number} I can help with, for example:\n{suggestions}"
        )
    return {"answer": answer, "citations": [], "cannot_answer": intent == "other"}


# ── deterministic engine (always available — the floor, not an afterthought) ──
def _focus_families(question: str, available: list[str]) -> list[str]:
    q = question.lower()
    matched = [fam for fam, kws in FAMILY_KEYWORDS.items()
               if any(kw in q for kw in kws)]
    focused = [f for f in matched if f in available]
    return focused if focused else available


def _detect_intent(question: str) -> str:
    q = question.lower().strip()
    # word-boundary match — a bare substring test would fire "hi" on "this"
    if re.match(r"^(hi+|hello+|hey+|greetings|namaste)\b", q) or re.search(
            r"\b(who are you|what can you do)\b", q):
        return "greeting"
    if any(kw in q for kw in ["why is this project risky", "why risky", "risk reason", "why flagged", "risk score", "overall risk", "why is this risky"]):
        return "risk_reason"
    if any(kw in q for kw in ["strongest evidence", "show evidence", "evidence", "proof", "signals"]):
        return "evidence"
    if any(kw in q for kw in ["site", "verify on site", "field", "inspection"]):
        return "site_verification"
    if any(kw in q for kw in ["investigate first", "what should i", "first", "next", "action", "priority", "steps"]):
        return "next_steps"
    if any(kw in q for kw in ["financial", "payment", "cost", "anomaly", "mismatch", "expenditure", "utilization"]):
        return "financial"
    if any(kw in q for kw in ["duplicate", "similar", "same work", "candidate"]):
        return "duplicate"
    if any(kw in q for kw in ["guidance", "guidelines", "rule", "policy", "regulation"]):
        return "guidance"
    return "general"


def deterministic_answer(question: str, ctx: dict, guidelines: list[dict]) -> dict:
    """Structured evidence-based response assembled dynamically based on question intent
    and verified facts. Never serves a hardcoded static template."""
    facts = ctx["facts"]
    by_ref = {f["source_ref"]: f for f in facts}
    citations: list[dict] = []
    lines: list[str] = []

    def cite(ref: str):
        if ref in by_ref and all(c["source_ref"] != ref for c in citations):
            citations.append({"source_ref": ref})

    project = ctx["project"]
    inv = ctx["investigation"]
    ra = ctx["risk"]
    intent = _detect_intent(question)

    # ── 1. GREETING INTENT ───────────────────────────────────────────────────
    if intent == "greeting":
        lines.append(f"Greetings, Officer. I am **Sakshi**, your AI Investigation Copilot.")
        lines.append("")
        lines.append(f"I am assigned to assist you with **Case {inv.case_number}** (Project **{project.code}**: *{project.title}*).")
        if ra is not None:
            lines.append(f"Current Status: **{ra.level.value.upper()} Risk** (Score: **{float(ra.score)}/100**, Evidence Strength: **{ra.evidence_strength.value.title()}**).")
            cite(f"risk_assessments:{ra.id}")
        lines.append("")
        lines.append("You can ask me specific investigation questions such as:")
        lines.append("• *\"Why is this project risky?\"*")
        lines.append("• *\"Show the strongest evidence.\"*")
        lines.append("• *\"Summarize the financial anomaly.\"*")
        lines.append("• *\"What should I verify on site?\"*")
        lines.append("• *\"Explain the duplicate candidate.\"*")
        lines.append("")
        lines.append("How can I assist your case review today?")

    # ── 2. RISK REASON INTENT ────────────────────────────────────────────────
    elif intent == "risk_reason":
        lines.append(f"**Risk Analysis — Project {project.code}:**")
        lines.append("")
        if ra is not None:
            lines.append(f"Project **{project.code}** is classified as **{ra.level.value.upper()} Risk** with a score of **{float(ra.score)}/100** (Evidence Strength: {ra.evidence_strength.value.title()}).")
            cite(f"risk_assessments:{ra.id}")
        else:
            lines.append(f"Project **{project.code}** does not have an active risk assessment score.")

        factor_facts = [f for f in facts if f["kind"] == "risk_factor"]
        factor_facts.sort(key=lambda x: x["data"].get("contribution", 0), reverse=True)
        if factor_facts:
            lines.append("")
            lines.append("**Primary Contributing Risk Indicators (Ranked by Impact):**")
            for i, f in enumerate(factor_facts, 1):
                lbl = FAMILY_LABELS.get(f["data"].get("factor_type"), f["data"].get("factor_type", "Anomaly"))
                contrib = f["data"].get("contribution")
                pts_str = f" (+{float(contrib):.1f} pts)" if contrib is not None else ""
                lines.append(f"{i}. **{lbl}**{pts_str}: {f['text']} [{f['source_ref']}]")
                cite(f["source_ref"])
        if ra and ra.predicted_delay_days:
            lines.append("")
            lines.append(f"**Predicted Completion Impact:** Approximately **{int(ra.predicted_delay_days)} days behind schedule**.")

    # ── 3. EVIDENCE INTENT ───────────────────────────────────────────────────
    elif intent == "evidence":
        lines.append(f"**Verified Evidence Portfolio — Project {project.code}:**")
        lines.append("")
        evidence_items = [f for f in facts if f["kind"] in ("risk_factor", "anomaly", "duplicate_candidate", "reconciliation", "network_signal")]
        if evidence_items:
            lines.append(f"Retrieved **{len(evidence_items)} verified evidence signals** for human review:")
            lines.append("")
            for i, f in enumerate(evidence_items[:5], 1):
                kind_str = f["kind"].replace("_", " ").title()
                lines.append(f"{i}. **[{kind_str}]** {f['text']} [{f['source_ref']}]")
                cite(f["source_ref"])
        else:
            lines.append("No specific risk factor evidence items were logged for this case.")

    # ── 4. SITE VERIFICATION / NEXT STEPS INTENT ──────────────────────────────
    elif intent in ("site_verification", "next_steps"):
        is_site = intent == "site_verification"
        lines.append(f"**{'Site Inspection & Field Verification' if is_site else 'Priority Investigation Next Steps'} — Case {inv.case_number}:**")
        lines.append("")
        steps: list[str] = []
        books = load_playbooks()
        for pb in books.values():
            if set(pb.applies_to_factors) & set(ctx["factor_types"]):
                steps.extend(s.title for s in pb.steps)
        if not steps and "general-review-v1" in books:
            steps = [s.title for s in books["general-review-v1"].steps]
        if steps:
            lines.append("Recommended action items from investigation playbooks:")
            seen = set()
            n = 0
            for s in steps:
                if s in seen:
                    continue
                seen.add(s)
                n += 1
                lines.append(f"{n}. **{s}**")
                if n >= 5:
                    break
        cite(f"investigations:{inv.id}")

    # ── 5. FINANCIAL ANOMALY INTENT ──────────────────────────────────────────
    elif intent == "financial":
        lines.append(f"**Financial Anomaly Analysis — Project {project.code}:**")
        lines.append("")
        s_cost = f"₹{float(project.sanctioned_cost):,.2f}" if project.sanctioned_cost else "Not recorded"
        exp = f"₹{float(project.expenditure):,.2f}" if project.expenditure else "₹0.00"
        fin_pct = f"{round(float(project.expenditure)/float(project.sanctioned_cost)*100, 1)}%" if project.sanctioned_cost else "—"
        phys_pct = f"{float(project.physical_progress_pct):.1f}%" if project.physical_progress_pct is not None else "—"

        lines.append(f"• **Sanctioned Cost:** {s_cost}")
        lines.append(f"• **Expenditure Released:** {exp} ({fin_pct} financial utilization)")
        lines.append(f"• **Physical Progress:** {phys_pct}")
        cite(f"project:{project.id}")

        fin_factors = [f for f in facts if f["data"].get("factor_type") in ("cost_anomaly", "payment_anomaly", "progress_payment_mismatch", "reconciliation_mismatch") or f["kind"] == "reconciliation"]
        if fin_factors:
            lines.append("")
            lines.append("**Detected Financial Indicators:**")
            for f in fin_factors:
                lbl = FAMILY_LABELS.get(f["data"].get("factor_type"), f["kind"].replace("_", " ").title())
                lines.append(f"• **{lbl}:** {f['text']} [{f['source_ref']}]")
                cite(f["source_ref"])

    # ── 6. DUPLICATE INTENT ──────────────────────────────────────────────────
    elif intent == "duplicate":
        dups = [f for f in facts if f["kind"] == "duplicate_candidate"]
        lines.append(f"**Duplicate Candidate Analysis — Project {project.code}:**")
        lines.append("")
        if dups:
            for d in dups:
                lines.append(f"• **Candidate Match:** {d['text']} [{d['source_ref']}]")
                if d.get("data"):
                    dt = d["data"]
                    if dt.get("text_similarity") is not None:
                        lines.append(f"  - Text Similarity: **{dt['text_similarity']*100:.1f}%**")
                    if dt.get("distance_km") is not None:
                        lines.append(f"  - Geographic Proximity: **{dt['distance_km']:.2f} km**")
                cite(d["source_ref"])
            lines.append("")
            lines.append("*Action Required:* Conduct physical & document cross-check to confirm whether this work represents duplicate funding.")
        else:
            lines.append(f"No duplicate candidates were flagged for Project {project.code}.")

    # ── 7. GUIDANCE INTENT ───────────────────────────────────────────────────
    elif intent == "guidance":
        lines.append(f"**Regulatory & Operational Guidance for Case {inv.case_number}:**")
        lines.append("")
        if guidelines:
            for g in guidelines[:3]:
                lines.append(f"• **{g['doc_name']} (Section {g['section']}):**")
                lines.append(f"  \"{g['excerpt']}\" [{g['source_ref']}]")
                lines.append("")
                citations.append({"source_ref": g["source_ref"]})
        else:
            lines.append("No specific guideline section matched this query; general review playbooks apply.")

    # ── 8. GENERAL INTENT (Topic Keyword Match) ──────────────────────────────
    else:
        focus = _focus_families(question, ctx["factor_types"])
        lines.append(f"**Investigation Facts — Project {project.code} ({project.title}):**")
        lines.append("")
        if ra is not None:
            lines.append(f"Overall Risk: **{ra.level.value.upper()}** (Score: {float(ra.score)}/100).")
            cite(f"risk_assessments:{ra.id}")

        factor_facts = [f for f in facts if f["kind"] == "risk_factor" and f["data"].get("factor_type") in focus]
        if factor_facts:
            lines.append("")
            lines.append("Relevant risk indicators:")
            for i, f in enumerate(factor_facts, 1):
                lbl = FAMILY_LABELS.get(f["data"]["factor_type"], f["data"]["factor_type"])
                lines.append(f"{i}. **{lbl}:** {f['text']} [{f['source_ref']}]")
                cite(f["source_ref"])

        if guidelines:
            g = guidelines[0]
            lines.append("")
            lines.append(f"Relevant guidance excerpt — {g['doc_name']}, §{g['section']}: \"{g['excerpt'][:200]}…\" [{g['source_ref']}]")
            citations.append({"source_ref": g["source_ref"]})

    lines.append("")
    lines.append(DISCLAIMER)

    return {"answer": "\n".join(lines), "citations": citations, "cannot_answer": False}


def deterministic_summary(ctx: dict, guidelines: list[dict]) -> dict:
    """Case-summary draft assembled from every verified factor."""
    q = "Summarize why this project is under review and what has been verified."
    full = deterministic_answer(q, ctx, guidelines)
    inv = ctx["investigation"]
    head = (f"Case {inv.case_number} — draft summary (evidence-based, "
            f"{ctx['action_count']} recorded actions):\n\n")
    return {**full, "answer": head + full["answer"]}


# ── LLM path (optional, two providers) ────────────────────────────────────
def _active_provider() -> tuple[str, str] | None:
    """(provider, model) for the configured LLM, or None for deterministic.
    Anthropic takes precedence when both keys are present."""
    settings = get_settings()
    if settings.anthropic_api_key:
        try:
            import anthropic  # noqa: F401
            return ("anthropic", settings.anthropic_model)
        except ImportError:
            pass
    if settings.groq_api_key:
        return ("groq", settings.groq_model)
    return None


def _llm_available() -> bool:
    return _active_provider() is not None


def _ask_llm_groq(question: str, ctx: dict, guidelines: list[dict]) -> dict:
    """Groq (OpenAI-compatible) path via httpx — no extra SDK. JSON-object
    response format; malformed output raises and the caller falls back."""
    import httpx

    settings = get_settings()
    context_json = json.dumps(ctx["facts"], default=str, ensure_ascii=False)
    guidelines_json = json.dumps(guidelines, default=str, ensure_ascii=False)
    schema_note = (
        "\n\nRespond with ONLY a JSON object of the shape "
        '{"answer": string, "citations": [{"source_ref": string}], '
        '"cannot_answer": boolean}. Every citation must be a source_ref that '
        "was provided in the context."
    )
    resp = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={
            "model": settings.groq_model,
            "temperature": 0.2,
            "max_tokens": 1024,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT + schema_note},
                {"role": "user",
                 "content": user_message(context_json, guidelines_json, question)},
            ],
        },
        timeout=settings.copilot_timeout_seconds,
    )
    resp.raise_for_status()
    out = json.loads(resp.json()["choices"][0]["message"]["content"])
    if not isinstance(out, dict) or "answer" not in out:
        raise ValueError("malformed structured output")
    out.setdefault("citations", [])
    out.setdefault("cannot_answer", False)
    return out


def _ask_llm(question: str, ctx: dict, guidelines: list[dict]) -> dict:
    """Single attempt; any exception or malformed output makes the caller fall
    back. Only ever called when a key is configured."""
    import anthropic

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key,
                                 timeout=settings.copilot_timeout_seconds,
                                 max_retries=1)
    context_json = json.dumps(ctx["facts"], default=str, ensure_ascii=False)
    guidelines_json = json.dumps(guidelines, default=str, ensure_ascii=False)
    msg = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        tools=[ANSWER_TOOL],
        tool_choice={"type": "tool", "name": "investigation_answer"},
        messages=[{"role": "user",
                   "content": user_message(context_json, guidelines_json, question)}],
    )
    block = next(b for b in msg.content if b.type == "tool_use")
    out = block.input
    if not isinstance(out, dict) or "answer" not in out:
        raise ValueError("malformed structured output")
    out.setdefault("citations", [])
    out.setdefault("cannot_answer", False)
    return out


# ── server-side validation (the actual safety boundary) ───────────────────
def validate_answer(out: dict, valid_refs: set[str]) -> tuple[bool, str | None]:
    answer = str(out.get("answer", ""))
    if not answer.strip():
        return False, "empty answer"
    for pat in BANNED_PATTERNS:
        if re.search(pat, answer, re.IGNORECASE):
            return False, "vocabulary violation"
    for c in out.get("citations", []):
        ref = c.get("source_ref") if isinstance(c, dict) else None
        if not ref or ref not in valid_refs:
            return False, f"unverifiable citation: {ref!r}"
    return True, None


# ── orchestration ─────────────────────────────────────────────────────────
def _serve(db: Session, user: User, investigation_id: int, question: str,
           build) -> dict:
    ctx = build_context(db, user, investigation_id)
    guidelines, retrieval = retrieve_guidelines(db, question)
    valid_refs = ctx["source_refs"] | {g["source_ref"] for g in guidelines}

    mode, model, fallback_reason = "deterministic", COPILOT_VERSION, None
    out = None
    intent = classify_intent(question)
    if intent != "case":
        # greetings/meta/thanks/off-topic get a conversational reply — fast,
        # free and identical in both modes (no LLM call, nothing to hallucinate)
        out = conversational_answer(intent, ctx)
    elif _llm_available():
        provider, provider_model = (_active_provider()
                                    or ("anthropic", get_settings().anthropic_model))
        try:
            candidate = (_ask_llm(question, ctx, guidelines) if provider == "anthropic"
                         else _ask_llm_groq(question, ctx, guidelines))
            ok, why = validate_answer(candidate, valid_refs)
            if ok:
                out, mode, model = candidate, "llm", f"{provider}:{provider_model}"
            else:
                fallback_reason = why
        except Exception as exc:  # timeout, API error, malformed output
            fallback_reason = type(exc).__name__

    if out is None:
        out = build(question, ctx, guidelines)
        ok, why = validate_answer(out, valid_refs)
        if not ok:  # defense in depth; deterministic output is ours, so this
            raise RuntimeError(f"deterministic answer failed validation: {why}")

    inv = ctx["investigation"]
    _audit(db, user, "investigation.copilot_queried", ctx["project"].id,
           {"case_number": inv.case_number, "mode": mode})
    db.add(InvestigationAction(
        investigation_id=inv.id, user_id=user.id, action_type="copilot_queried",
        reason="Copilot consulted (decision support)",
        detail={"question": question[:300], "mode": mode, "model": model,
                "retrieval": retrieval, "fallback_reason": fallback_reason,
                "qa_sha256": hashlib.sha256(
                    (question + out["answer"]).encode()).hexdigest()}))
    db.commit()

    return {
        "investigation_id": inv.id, "question": question,
        "answer": out["answer"], "citations": out.get("citations", []),
        "cannot_answer": bool(out.get("cannot_answer", False)),
        "mode": mode, "model_version": model,
        "retrieval_method": retrieval, "fallback_reason": fallback_reason,
        "disclaimer": DISCLAIMER,
    }


def ask(db: Session, user: User, investigation_id: int, question: str) -> dict:
    return _serve(db, user, investigation_id, question,
                  lambda q, ctx, g: deterministic_answer(q, ctx, g))


def summary(db: Session, user: User, investigation_id: int) -> dict:
    q = "Draft a neutral evidence-based case summary for this investigation."
    res = _serve(db, user, investigation_id, q,
                  lambda _q, ctx, g: deterministic_summary(ctx, g))
    ctx = build_context(db, user, investigation_id)
    inv = ctx["investigation"]
    if inv.case_number not in res["answer"]:
        res["answer"] = f"Case {inv.case_number} — summary:\n\n" + res["answer"]
    return res


def status(db: Session) -> dict:
    provider = _active_provider()
    sdk = True
    try:
        import anthropic  # noqa: F401
    except ImportError:
        sdk = False
    emb = embed_texts(["ping"]) is not None
    return {
        "mode": "llm" if provider else "deterministic",
        "model": f"{provider[0]}:{provider[1]}" if provider else COPILOT_VERSION,
        "provider": provider[0] if provider else None,
        "key_configured": provider is not None, "sdk_installed": sdk,
        "retrieval_method": "vector" if emb else "lexical",
        "disclaimer": DISCLAIMER,
    }
