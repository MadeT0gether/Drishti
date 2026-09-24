"""Public Programme Report PDFs — citizen-friendly, for the public portal.

One generic engine renders four published products: the national Monthly
Summary, the Quarterly Benchmark (with a state comparison table), the
State-wise monthly report, and the Annual report. Unlike the Executive
Summary (dense, official, risk-oriented), these are written for the ordinary
reader: large headline numbers, plain-language sentences, and short lists of
real works. No risk/anomaly/officer data.
"""
import calendar
from datetime import date
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import District, Payment, Project, Recommendation, Sanction, State, User
from app.services.scope import scoped_projects

NAVY   = colors.HexColor("#0b1220")
ACCENT = colors.HexColor("#1a56db")
MUTED  = colors.HexColor("#5a7290")
BORDER = colors.HexColor("#d1d9e3")
GREEN  = colors.HexColor("#047857")
CARD_BLUE  = colors.HexColor("#eff6ff")
CARD_GREEN = colors.HexColor("#ecfdf5")
CARD_AMBER = colors.HexColor("#fffbeb")
CARD_SLATE = colors.HexColor("#f8fafc")

FOOTNOTE = (
    "Data published through the DRISHTI Public Transparency Portal. "
    "Prototype environment — figures render from synthetic data. "
    "Amounts are as reported by implementing agencies."
)


# ── Formatting for ordinary readers ──────────────────────────────────────────
def _amt(n) -> str:
    """12,34,567 -> '12.3 L'; crores as 'X.X Cr'. Plain-reader friendly."""
    if n is None:
        return "—"
    n = float(n)
    if n >= 1e7:
        return f"Rs {n / 1e7:,.1f} Cr"
    if n >= 1e5:
        return f"Rs {n / 1e5:,.1f} L"
    return f"Rs {n:,.0f}"


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def _quarter_bounds(year: int, quarter: int) -> tuple[date, date]:
    m0 = (quarter - 1) * 3 + 1
    return date(year, m0, 1), _month_bounds(year, m0 + 2)[1]


# ── Data collection ──────────────────────────────────────────────────────────
def _collect(db: Session, user: User, start: date, end: date,
             state_id: int | None = None, with_states: bool = False) -> dict:
    """Everything the PDF needs for one period (optionally one state)."""
    base_stmt = scoped_projects(select(Project.id), user)
    if state_id is not None:
        base_stmt = base_stmt.where(Project.state_id == state_id)
    base = base_stmt.subquery()
    in_scope = Project.id.in_(select(base.c.id))

    completed_q = db.execute(
        select(Project.title, Project.expenditure, Project.actual_end,
               District.name, State.name)
        .join(District, District.id == Project.district_id)
        .join(State, State.id == Project.state_id)
        .where(in_scope, Project.status == "completed",
               Project.actual_end.between(start, end))
        .order_by(Project.expenditure.desc())
    ).all()

    recommended_q = db.execute(
        select(Project.title, Recommendation.amount, Recommendation.date,
               District.name, State.name)
        .join(Recommendation, Recommendation.project_id == Project.id)
        .join(District, District.id == Project.district_id)
        .join(State, State.id == Project.state_id)
        .where(in_scope, Recommendation.date.between(start, end))
        .order_by(Recommendation.amount.desc())
    ).all()

    pay_sum, pay_count = db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0), func.count())
        .join(Project, Project.id == Payment.project_id)
        .where(in_scope, Payment.date.between(start, end))
    ).first()

    sanction_sum, sanction_count = db.execute(
        select(func.coalesce(func.sum(Sanction.amount), 0), func.count())
        .join(Project, Project.id == Sanction.project_id)
        .where(in_scope, Sanction.date.between(start, end))
    ).first()

    total, done, sanctioned, spent = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(case((Project.status == "completed", 1), else_=0)), 0),
            func.coalesce(func.sum(Project.sanctioned_cost), 0),
            func.coalesce(func.sum(Project.expenditure), 0),
        ).where(in_scope)
    ).first()

    data = {
        "completed": [
            {"title": t, "amount": float(a or 0), "date": d,
             "place": f"{dn}, {sn}"}
            for t, a, d, dn, sn in completed_q
        ],
        "recommended": [
            {"title": t, "amount": float(a or 0), "date": d,
             "place": f"{dn}, {sn}"}
            for t, a, d, dn, sn in recommended_q
        ],
        "payments": {"total": float(pay_sum or 0), "count": int(pay_count or 0)},
        "sanctions": {"total": float(sanction_sum or 0), "count": int(sanction_count or 0)},
        "portfolio": {
            "total_projects": int(total or 0),
            "completed": int(done or 0),
            "sanctioned": float(sanctioned or 0),
            "spent": float(spent or 0),
        },
    }

    if with_states:
        # Per-state benchmark for the period: completions + money paid out.
        completed_by_state = dict(db.execute(
            select(Project.state_id, func.count())
            .where(in_scope, Project.status == "completed",
                   Project.actual_end.between(start, end))
            .group_by(Project.state_id)
        ).all())
        paid_by_state = dict(db.execute(
            select(Project.state_id, func.coalesce(func.sum(Payment.amount), 0))
            .join(Payment, Payment.project_id == Project.id)
            .where(in_scope, Payment.date.between(start, end))
            .group_by(Project.state_id)
        ).all())
        totals_by_state = db.execute(
            select(Project.state_id, State.name, func.count(),
                   func.coalesce(func.sum(Project.sanctioned_cost), 0),
                   func.coalesce(func.sum(Project.expenditure), 0))
            .join(State, State.id == Project.state_id)
            .where(in_scope)
            .group_by(Project.state_id, State.name)
        ).all()
        states = []
        for sid, name, n, sanc, sp in totals_by_state:
            states.append({
                "name": name,
                "total_works": int(n),
                "completed_period": int(completed_by_state.get(sid, 0)),
                "paid_period": float(paid_by_state.get(sid, 0) or 0),
                "utilization": round(float(sp) / float(sanc) * 100, 1) if sanc else 0,
            })
        states.sort(key=lambda s: s["completed_period"], reverse=True)
        data["states"] = states

    return data


def available_months(db: Session, user: User) -> list[dict]:
    """Months (newest first) for which any payment exists."""
    base = scoped_projects(select(Project.id), user).subquery()
    in_scope_pay = Payment.project_id.in_(select(base.c.id))
    lo, hi = db.execute(
        select(func.min(Payment.date), func.max(Payment.date)).where(in_scope_pay)
    ).first()
    if lo is None:
        return []
    today = date.today()
    if hi > today:
        hi = today
    months, y, m = [], hi.year, hi.month
    while (y, m) >= (lo.year, lo.month):
        months.append({"year": y, "month": m,
                       "label": f"{calendar.month_name[m]} {y}"})
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return months


def available_quarters(db: Session, user: User) -> list[dict]:
    seen, out = set(), []
    for m in available_months(db, user):
        q = (m["month"] - 1) // 3 + 1
        if (m["year"], q) not in seen:
            seen.add((m["year"], q))
            out.append({"year": m["year"], "quarter": q,
                        "label": f"Q{q} {m['year']}"})
    return out


def available_years(db: Session, user: User) -> list[dict]:
    seen, out = set(), []
    for m in available_months(db, user):
        if m["year"] not in seen:
            seen.add(m["year"])
            out.append({"year": m["year"], "label": str(m["year"])})
    return out


# ── PDF rendering ────────────────────────────────────────────────────────────
def _styles():
    ss = getSampleStyleSheet()
    return {
        "brand": ParagraphStyle("brand", parent=ss["BodyText"], fontSize=8,
                                textColor=MUTED, fontName="Helvetica-Bold"),
        "title": ParagraphStyle("title", parent=ss["Title"], fontSize=22,
                                textColor=NAVY, fontName="Helvetica-Bold",
                                spaceAfter=2, alignment=0),
        "subtitle": ParagraphStyle("sub", parent=ss["BodyText"], fontSize=12,
                                   textColor=ACCENT, fontName="Helvetica-Bold"),
        "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontSize=12,
                             textColor=NAVY, fontName="Helvetica-Bold",
                             spaceBefore=14, spaceAfter=5),
        "card_label": ParagraphStyle("cl", parent=ss["BodyText"], fontSize=7.5,
                                     textColor=MUTED, fontName="Helvetica-Bold"),
        "card_big": ParagraphStyle("cb", parent=ss["BodyText"], fontSize=19,
                                   leading=22, textColor=NAVY,
                                   fontName="Helvetica-Bold"),
        "card_note": ParagraphStyle("cn", parent=ss["BodyText"], fontSize=7.5,
                                    textColor=MUTED, fontName="Helvetica"),
        "body": ParagraphStyle("body", parent=ss["BodyText"], fontSize=10,
                               leading=15, fontName="Helvetica"),
        "item_title": ParagraphStyle("it", parent=ss["BodyText"], fontSize=9.5,
                                     leading=12, fontName="Helvetica-Bold",
                                     textColor=NAVY),
        "item_meta": ParagraphStyle("im", parent=ss["BodyText"], fontSize=8,
                                    leading=11, textColor=MUTED,
                                    fontName="Helvetica"),
        "small": ParagraphStyle("sm", parent=ss["BodyText"], fontSize=7.5,
                                leading=10, textColor=MUTED,
                                fontName="Helvetica"),
        "th": ParagraphStyle("th", parent=ss["BodyText"], fontSize=7.5,
                             textColor=MUTED, fontName="Helvetica-Bold"),
        "td": ParagraphStyle("td", parent=ss["BodyText"], fontSize=8.5,
                             leading=11, fontName="Helvetica"),
    }


def _stat_cards(cards, st):
    """2x2 grid of big-number cards: (label, value, note, bg)."""
    def cell(label, value, note, _bg):
        return [Paragraph(label.upper(), st["card_label"]),
                Spacer(1, 3),
                Paragraph(value, st["card_big"]),
                Spacer(1, 2),
                Paragraph(note, st["card_note"])]

    rows = [[cell(*cards[0]), cell(*cards[1])], [cell(*cards[2]), cell(*cards[3])]]
    t = Table(rows, colWidths=[89 * mm, 89 * mm], hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER),
    ]
    for i, (r, c) in enumerate([(0, 0), (0, 1), (1, 0), (1, 1)]):
        style.append(("BACKGROUND", (c, r), (c, r), cards[i][3]))
    t.setStyle(TableStyle(style))
    return t


def _works_list(items, st, date_label):
    rows = []
    for w in items:
        d = w["date"].strftime("%d %b %Y") if w.get("date") else "—"
        rows.append([
            [Paragraph(w["title"], st["item_title"]),
             Paragraph(f"{w['place']}  ·  {date_label}: {d}", st["item_meta"])],
            Paragraph(f"<b>{_amt(w['amount'])}</b>", st["item_title"]),
        ])
    t = Table(rows, colWidths=[140 * mm, 38 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _state_table(states, st, period_word):
    header = [Paragraph(h, st["th"]) for h in
              ["STATE", f"COMPLETED THIS {period_word.upper()}",
               f"PAID OUT THIS {period_word.upper()}", "TOTAL WORKS", "FUNDS USED"]]
    rows = [header]
    for s in states:
        rows.append([
            Paragraph(f"<b>{s['name']}</b>", st["td"]),
            Paragraph(f"{s['completed_period']:,}", st["td"]),
            Paragraph(_amt(s["paid_period"]), st["td"]),
            Paragraph(f"{s['total_works']:,}", st["td"]),
            Paragraph(f"{s['utilization']}%", st["td"]),
        ])
    t = Table(rows, colWidths=[52 * mm, 34 * mm, 34 * mm, 28 * mm, 30 * mm],
              repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), CARD_BLUE),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _footer_factory(report_title):
    def _footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 6.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(15 * mm, 10 * mm,
                          f"DRISHTI · Public Transparency Portal — {report_title}")
        canvas.drawRightString(195 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()
    return _footer


def render_pdf(data: dict, report_title: str, period_name: str,
               period_word: str = "month", scope_name: str | None = None) -> bytes:
    st = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=16 * mm, bottomMargin=18 * mm,
        title=f"DRISHTI {report_title} — {period_name}",
        author="DRISHTI Public Transparency Portal",
    )

    p = data["portfolio"]
    completed = data["completed"]
    recommended = data["recommended"]
    month_spent = sum(w["amount"] for w in completed)
    util = round(p["spent"] / p["sanctioned"] * 100, 1) if p["sanctioned"] else 0
    done_rate = round(p["completed"] / p["total_projects"] * 100, 1) if p["total_projects"] else 0

    subtitle = period_name if not scope_name else f"{scope_name} · {period_name}"
    el = [
        Paragraph("DRISHTI · PUBLIC TRANSPARENCY PORTAL", st["brand"]),
        Spacer(1, 4),
        Paragraph(report_title, st["title"]),
        Paragraph(subtitle, st["subtitle"]),
        Spacer(1, 10),
    ]

    # ── This period at a glance ──────────────────────────────────────────────
    where = f" in {scope_name}" if scope_name else ""
    el.append(Paragraph(f"What happened in {period_name}{where}", st["h2"]))
    el.append(_stat_cards([
        ("Works completed", f"{len(completed):,}",
         f"worth {_amt(month_spent)} in total", CARD_GREEN),
        ("Money paid out", _amt(data["payments"]["total"]),
         f"across {data['payments']['count']:,} payments to implementing agencies", CARD_BLUE),
        ("New works recommended", f"{len(recommended):,}",
         f"new public works proposed this {period_word}", CARD_AMBER),
        ("Funds sanctioned", _amt(data["sanctions"]["total"]),
         f"approved through {data['sanctions']['count']:,} sanction orders", CARD_SLATE),
    ], st))
    el.append(Spacer(1, 4))

    # ── Plain-language explanation ───────────────────────────────────────────
    if completed or recommended or data["payments"]["count"]:
        sentence = (
            f"In {period_name}{where}, <b>{len(completed):,} public work"
            f"{'s were' if len(completed) != 1 else ' was'} completed</b> and "
            f"<b>{_amt(data['payments']['total'])}</b> was paid out for ongoing works. "
            f"<b>{len(recommended):,} new work{'s were' if len(recommended) != 1 else ' was'} "
            f"recommended</b> for future development."
        )
    else:
        sentence = (f"No completions, payments, or new recommendations were "
                    f"recorded in {period_name}{where}.")
    el.append(Paragraph(sentence, st["body"]))

    # ── Programme so far ─────────────────────────────────────────────────────
    scope_word = scope_name or "the programme"
    el.append(Paragraph(f"{scope_word.title() if not scope_name else scope_name} so far",
                        st["h2"]))
    el.append(_stat_cards([
        ("Total works", f"{p['total_projects']:,}",
         "recommended under the programme to date", CARD_SLATE),
        ("Works completed", f"{p['completed']:,}",
         f"{done_rate}% of all works are finished", CARD_GREEN),
        ("Total money approved", _amt(p["sanctioned"]),
         "sanctioned for public works so far", CARD_BLUE),
        ("Total money spent", _amt(p["spent"]),
         f"{util}% of approved funds have been used", CARD_AMBER),
    ], st))

    # ── State benchmark (quarterly/annual) ───────────────────────────────────
    states = data.get("states") or []
    if states:
        el.append(Paragraph(f"How the states compare — {period_name}", st["h2"]))
        el.append(_state_table(states[:15], st, period_word))
        if len(states) > 15:
            el.append(Spacer(1, 3))
            el.append(Paragraph(
                f"…and {len(states) - 15} more states/UTs. Full figures are on "
                f"the portal under Geography.", st["small"]))

    # ── Works completed this period ──────────────────────────────────────────
    if completed:
        el.append(Paragraph(f"Works completed in {period_name}{where}", st["h2"]))
        el.append(_works_list(completed[:8], st, "Completed"))
        if len(completed) > 8:
            el.append(Spacer(1, 3))
            el.append(Paragraph(
                f"…and {len(completed) - 8:,} more completed works. The full list is "
                f"available on the portal under Projects.", st["small"]))

    # ── New recommendations ──────────────────────────────────────────────────
    if recommended:
        el.append(Paragraph(f"New works recommended in {period_name}{where}", st["h2"]))
        el.append(_works_list(recommended[:6], st, "Recommended"))
        if len(recommended) > 6:
            el.append(Spacer(1, 3))
            el.append(Paragraph(
                f"…and {len(recommended) - 6:,} more recommended works.", st["small"]))

    el.append(Spacer(1, 12))
    el.append(Paragraph(FOOTNOTE, st["small"]))

    doc.build(el, onFirstPage=_footer_factory(report_title),
              onLaterPages=_footer_factory(report_title))
    return buf.getvalue()


# ── Public entry points ──────────────────────────────────────────────────────
def generate(db: Session, user: User, year: int, month: int) -> bytes:
    start, end = _month_bounds(year, month)
    data = _collect(db, user, start, end)
    return render_pdf(data, "Monthly Programme Report",
                      f"{calendar.month_name[month]} {year}")


def generate_quarterly(db: Session, user: User, year: int, quarter: int) -> bytes:
    start, end = _quarter_bounds(year, quarter)
    data = _collect(db, user, start, end, with_states=True)
    return render_pdf(data, "Quarterly Benchmark Report",
                      f"Q{quarter} {year} ({start.strftime('%b')}–{end.strftime('%b %Y')})",
                      period_word="quarter")


def generate_state(db: Session, user: User, state_id: int, year: int, month: int) -> bytes:
    state_name = db.scalar(select(State.name).where(State.id == state_id)) or "Unknown State"
    start, end = _month_bounds(year, month)
    data = _collect(db, user, start, end, state_id=state_id)
    return render_pdf(data, "State Expenditure & Progress Report",
                      f"{calendar.month_name[month]} {year}",
                      scope_name=state_name)


def generate_annual(db: Session, user: User, year: int) -> bytes:
    data = _collect(db, user, date(year, 1, 1), date(year, 12, 31), with_states=True)
    return render_pdf(data, "Annual Programme Report", str(year),
                      period_word="year")
