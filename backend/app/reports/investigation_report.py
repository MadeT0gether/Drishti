"""Investigation Package PDF — built ONLY from existing scoped service outputs.

No new queries against source tables: every section reuses the same functions
the API serves, so RBAC/scope, responsible-AI vocabulary and the
ground-truth firewall are inherited, not re-implemented. Missing data renders
as "Not available" — nothing is ever fabricated.
"""
from datetime import datetime, timezone

from fastapi import HTTPException
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import User
from app.services import intel_service, investigation_service, misc_service, projects_service

NA = "Not available"

DISCLAIMER = (
    "AI-generated decision-support content. Risk scores, anomaly indicators and "
    "AI-drafted text in this report are decision-support signals produced by the "
    "MPLADS prototype on synthetic data. They do not constitute findings of fraud, "
    "misconduct, corruption, or legal liability. Final decisions remain with "
    "authorized officials."
)

ACCENT = colors.HexColor("#312e81")
MUTED = colors.HexColor("#64748b")
BORDER = colors.HexColor("#cbd5e1")


def build_report_data(db: Session, user: User, investigation_id: int) -> dict:
    """Collect every section from the existing scoped services."""
    case = investigation_service.get_case(db, user, investigation_id)
    actions = investigation_service.list_actions(db, user, investigation_id,
                                                 page=1, page_size=200)["items"]
    project = projects_service.get_project_detail(db, user, case["project_id"])

    def maybe(fn, *args):
        try:
            return fn(db, user, case["project_id"], *args)
        except HTTPException:
            return None

    risk = maybe(intel_service.get_risk)
    anomalies = maybe(intel_service.get_anomalies) or []
    similar = maybe(intel_service.get_similar) or []
    reconciliation = maybe(intel_service.get_reconciliation)
    relationships = maybe(intel_service.get_relationships)
    predictions = maybe(intel_service.get_predictions)
    audit = misc_service.project_audit(db, user, case["project_id"])

    dataset_version = db.execute(text(
        "SELECT version FROM dataset_versions ORDER BY created_at DESC LIMIT 1")).scalar()

    opening = next((a for a in actions if a["action_type"] == "opened"), None)
    summary_provenance = None
    for a in reversed(actions):
        if a["action_type"] == "copilot_summary_accepted":
            summary_provenance = f"AI-drafted, reviewed and accepted by {a['user']}"
            break
        if a["action_type"] == "summary_updated":
            summary_provenance = f"Written by {a['user']}"
            break

    return {
        "case": case, "actions": actions, "project": project, "risk": risk,
        "anomalies": anomalies, "similar": similar, "reconciliation": reconciliation,
        "relationships": relationships, "predictions": predictions, "audit": audit,
        "dataset_version": dataset_version, "opening_reason": opening["reason"] if opening else None,
        "summary_provenance": summary_provenance,
        "generated_at": datetime.now(timezone.utc), "generated_by": user.email,
    }


# ── rendering ─────────────────────────────────────────────────────────────
def _styles():
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=ss["Title"], fontSize=17, textColor=ACCENT,
                                spaceAfter=2),
        "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontSize=11.5, textColor=ACCENT,
                             spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("b", parent=ss["BodyText"], fontSize=8.5, leading=11.5),
        "small": ParagraphStyle("s", parent=ss["BodyText"], fontSize=7.5, leading=10,
                                textColor=MUTED),
        "banner": ParagraphStyle("bn", parent=ss["BodyText"], fontSize=8, leading=10.5,
                                 textColor=colors.HexColor("#92400e")),
    }


def _fmt(v, suffix=""):
    if v is None or v == "":
        return NA
    if isinstance(v, float):
        v = f"{v:,.1f}".rstrip("0").rstrip(".")
    return f"{v}{suffix}"


def _inr(v):
    return f"Rs {v:,.0f}" if v is not None else NA


def _kv_table(pairs, st, col_width=52 * mm):
    rows = [[Paragraph(f"<b>{k}</b>", st["body"]), Paragraph(str(v), st["body"])]
            for k, v in pairs]
    t = Table(rows, colWidths=[col_width, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    return t


def _grid_table(header, rows, st, widths=None):
    data = [[Paragraph(f"<b>{h}</b>", st["small"]) for h in header]]
    for r in rows:
        data.append([Paragraph(str(c), st["small"]) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 6.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(15 * mm, 10 * mm,
                      "AI content is decision support only — final decisions remain with "
                      "authorized officials. Prototype - Synthetic Data.")
    canvas.drawRightString(195 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def render_pdf(data: dict) -> bytes:
    import io

    st = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=16 * mm,
                            title=f"Investigation Package {data['case']['case_number']}")
    el = []
    c, p = data["case"], data["project"]

    # ── cover / header ────────────────────────────────────────────────────
    el.append(Paragraph(f"Investigation Package — {c['case_number']}", st["title"]))
    el.append(Paragraph("MPLADS AI Risk Intelligence · Prototype Dataset — Synthetic Data",
                        st["small"]))
    el.append(Spacer(1, 4))
    el.append(Paragraph(DISCLAIMER, st["banner"]))
    el.append(Spacer(1, 6))

    gen = data["generated_at"].strftime("%Y-%m-%d %H:%M UTC")
    el.append(_kv_table([
        ("Generated at", gen),
        ("Generated by", data["generated_by"]),
        ("Dataset version", _fmt(data["dataset_version"])),
        ("Risk model version", data["risk"]["model_version"] if data["risk"] else NA),
    ], st))

    # ── case summary ──────────────────────────────────────────────────────
    el.append(Paragraph("1. Case", st["h2"]))
    bd = c.get("priority_breakdown") or {}
    el.append(_kv_table([
        ("Case number", c["case_number"]),
        ("Status", c["status"].replace("_", " ").title()),
        ("Opened", _fmt(str(c["created_at"])[:16])),
        ("Opened by", _fmt(c["opened_by"])),
        ("Assigned officer", _fmt(c["assigned_to"])),
        ("SLA due", _fmt(str(c["sla_due_at"])[:16] if c["sla_due_at"] else None)),
        ("Priority at open", f"{c['priority_score']} "
         f"(risk {bd.get('risk_score', NA)} x financial {bd.get('financial_weight', NA)} "
         f"x evidence {bd.get('evidence_weight', NA)})"),
        ("Reason for investigation", _fmt(data["opening_reason"])),
        ("Outcome", _fmt((c["outcome"] or "").replace("_", " ").title() or None)),
        ("Outcome note", _fmt(c["outcome_note"])),
    ], st))

    if c.get("summary"):
        el.append(Paragraph("Case summary"
                            + (f" ({data['summary_provenance']})" if data["summary_provenance"] else ""),
                            st["h2"]))
        el.append(Paragraph(c["summary"].replace("\n", "<br/>"), st["body"]))

    # ── project ───────────────────────────────────────────────────────────
    el.append(Paragraph("2. Project", st["h2"]))
    fin_prog = p.get("financial_progress_pct")
    el.append(_kv_table([
        ("Code", p["code"]),
        ("Title", p["title"]),
        ("Status", p["status"].replace("_", " ").title()),
        ("District / State", f"{_fmt(p['district'])}, {_fmt(p['state'])}"),
        ("Constituency", _fmt(p["constituency"])),
        ("MP", _fmt(p["mp"])),
        ("Implementing agency", _fmt(p["agency"])),
        ("Vendor", _fmt(p["vendor"])),
        ("Sanction", f"{_inr(p['sanctioned_cost'])}"
         + (f" (No. {p['sanction_no']}, {p['sanction_date']})" if p.get("sanction_no") else "")),
        ("Expenditure", _inr(p["expenditure"])),
        ("Physical progress", _fmt(p["physical_progress_pct"], "%")),
        ("Financial progress", _fmt(fin_prog, "%")),
        ("Planned period", f"{_fmt(p['planned_start'])} to {_fmt(p['planned_end'])}"),
    ], st))

    # ── risk assessment ───────────────────────────────────────────────────
    el.append(Paragraph("3. AI Risk Assessment (decision-support)", st["h2"]))
    r = data["risk"]
    if r:
        el.append(_kv_table([
            ("Risk score", f"{r['risk_score']} / 100 ({r['risk_level'].title()})"),
            ("Evidence strength", r["evidence_strength"].title()),
            ("Signals", r["signal_count"]),
            ("Data completeness", _fmt(r["data_completeness_pct"], "%")),
            ("Predicted delay", _fmt(r["predicted_delay_days"], " days")
             if r["predicted_delay_days"] is not None else NA),
            ("Delay risk", _fmt(r["delay_risk"])),
            ("Overrun risk", _fmt(r["overrun_risk"])),
        ], st))
        if r["factors"]:
            el.append(Spacer(1, 4))
            el.append(_grid_table(
                ["Factor", "Pts", "Severity", "Explanation (incl. peer evidence)"],
                [[f["factor_type"], f["contribution"], f["severity"], f["explanation"]]
                 for f in r["factors"]],
                st, widths=[30 * mm, 10 * mm, 16 * mm, None]))
    else:
        el.append(Paragraph(NA + " — this project has no current risk assessment.", st["body"]))

    # ── anomalies ─────────────────────────────────────────────────────────
    el.append(Paragraph("4. Anomaly Indicators", st["h2"]))
    if data["anomalies"]:
        el.append(_grid_table(
            ["Detector", "Score", "Severity", "Explanation"],
            [[a["detector"], a["score"], a["severity"], a["explanation"]]
             for a in data["anomalies"]],
            st, widths=[26 * mm, 12 * mm, 16 * mm, None]))
    else:
        el.append(Paragraph("No anomaly indicators recorded.", st["body"]))

    # ── duplicates ────────────────────────────────────────────────────────
    el.append(Paragraph("5. Duplicate Candidates (human verification required)", st["h2"]))
    if data["similar"]:
        el.append(_grid_table(
            ["Project", "Classification", "Composite", "Text sim", "Distance km"],
            [[f"{s['code']} — {s['title'][:60]}", s["classification"].replace("_", " "),
              s["composite_score"], s["text_similarity"], _fmt(s["geo_distance_km"])]
             for s in data["similar"][:10]],
            st, widths=[70 * mm, 28 * mm, 18 * mm, 16 * mm, 20 * mm]))
    else:
        el.append(Paragraph("No duplicate candidates recorded.", st["body"]))

    # ── reconciliation ────────────────────────────────────────────────────
    el.append(Paragraph("6. Cross-System Reconciliation", st["h2"]))
    rec = data["reconciliation"]
    if rec:
        el.append(_kv_table([
            ("Status", f"{rec['status']} ({rec['status_group']})"),
            ("Project-side total", _inr(rec["project_side_total"])),
            ("Matched total", _inr(rec["matched_total"])),
            ("Mismatch amount", _inr(rec["mismatch_amount"])),
        ], st))
    else:
        el.append(Paragraph(NA, st["body"]))

    # ── relationships ─────────────────────────────────────────────────────
    el.append(Paragraph("7. Relationship Signals", st["h2"]))
    rel = data["relationships"]
    if rel and (rel["edges"] or rel["signals"]):
        rows = [[e["relationship_type"].replace("_", " "), e["entity_name"],
                 "; ".join(f"{k}: {v}" for k, v in e["detail"].items())]
                for e in rel["edges"]]
        rows += [[f"signal: {s['signal_type']}", f"score {s['score']} ({s['severity']})",
                  "; ".join(f"{k}: {v}" for k, v in list(s["detail"].items())[:4])]
                 for s in rel["signals"]]
        el.append(_grid_table(["Relationship", "Entity / strength", "Detail"], rows, st,
                              widths=[34 * mm, 50 * mm, None]))
        el.append(Paragraph("Relationship signals are potential patterns for review — "
                            "never findings of collusion.", st["small"]))
    else:
        el.append(Paragraph("No relationship signals recorded.", st["body"]))

    # ── playbooks ─────────────────────────────────────────────────────────
    el.append(Paragraph("8. Playbook Progress", st["h2"]))
    pbs = c.get("playbooks") or []
    if pbs:
        rows = []
        for pb in pbs:
            done = sum(1 for s in pb["steps"] if s.get("completed"))
            rows.append([pb["title"], f"{done}/{len(pb['steps'])} steps completed"])
        el.append(_grid_table(["Playbook", "Progress"], rows, st, widths=[80 * mm, None]))
    else:
        el.append(Paragraph(NA, st["body"]))

    # ── actions ───────────────────────────────────────────────────────────
    el.append(Paragraph("9. Investigation Actions (append-only record)", st["h2"]))
    if data["actions"]:
        el.append(_grid_table(
            ["When", "Action", "By", "Reason / note"],
            [[str(a["created_at"])[:16], a["action_type"].replace("_", " "),
              a["user"], a["reason"]] for a in data["actions"]],
            st, widths=[24 * mm, 28 * mm, 34 * mm, None]))
    else:
        el.append(Paragraph(NA, st["body"]))

    # ── audit ─────────────────────────────────────────────────────────────
    el.append(Paragraph("10. Audit Timeline (project-level)", st["h2"]))
    if data["audit"]:
        el.append(_grid_table(
            ["When", "Source", "Actor", "Event"],
            [[str(e["timestamp"])[:16], e["source"], e["actor"], e["action"]]
             for e in data["audit"][-40:]],
            st, widths=[24 * mm, 24 * mm, 40 * mm, None]))
    else:
        el.append(Paragraph(NA, st["body"]))

    el.append(Spacer(1, 8))
    el.append(Paragraph(DISCLAIMER, st["banner"]))

    doc.build(el, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def generate(db: Session, user: User, investigation_id: int) -> tuple[bytes, str]:
    data = build_report_data(db, user, investigation_id)
    pdf = render_pdf(data)
    return pdf, data["case"]["case_number"]
