# Investigation Reporting

## Endpoints

| Endpoint | Format | Roles |
|---|---|---|
| `GET /api/v1/investigations/{id}/report.pdf` | PDF (primary) | ministry, state, district, officer |
| `GET /api/v1/investigations/{id}/report.xlsx` | XLSX (secondary, tabular) | same |

Viewers and MPs receive 403. Scope is enforced through the case's project —
a district officer cannot export another district's case (403; unknown → 404).
Every export writes a `report_generated` case action **and** an
`investigation.report_generated` audit event. Exports are allowed on closed
cases (exporting a closed package is normal practice).

## Architecture

`app/reports/investigation_report.py` (PDF, ReportLab) and
`investigation_xlsx.py` (openpyxl) share one data builder,
`build_report_data()`, which calls **only the existing scoped services**
(investigation, project detail, risk, anomalies, similar, reconciliation,
relationships, audit). Consequences by construction:

- RBAC/scope identical to the API — no separate query path to audit;
- all narrative text is the stored detector/factor explanations, so the
  responsible-AI vocabulary rules are inherited, not re-implemented;
- the ground-truth ledger is structurally unreachable;
- missing data renders as **"Not available"** — nothing is fabricated.

## PDF structure (10 sections)

1. Header: case number, generated at/by, dataset version, risk model version,
   "Prototype Dataset — Synthetic Data", responsible-AI banner.
2. Case: status, SLA, priority with frozen breakdown, opening reason,
   outcome + note; case summary with provenance ("AI-drafted, reviewed and
   accepted by …" vs "Written by …").
3. Project: identity, geography (district/state/constituency/MP), agency,
   vendor, sanction record, costs, expenditure, progress, schedule.
4. AI Risk Assessment (labeled decision-support): score, level, evidence
   strength, predictions, factor table with evidence (incl. peer statistics).
5. Anomaly indicators. 6. Duplicate candidates (human verification required).
7. Reconciliation. 8. Relationship signals (with the never-a-finding note).
9. Playbook progress. 10. Investigation actions + audit timeline.

Every page footer repeats: AI content is decision support only; final
decisions remain with authorized officials.

## XLSX sheets

Summary · Financials · Risk Factors · Anomalies · Investigation Actions ·
Audit Trail. The Summary sheet carries the responsible-AI notice.

## Limitations

- Reports snapshot generation time; they are not stored server-side (the
  audit trail records that and when an export happened, not the bytes).
- Styling is deliberately utilitarian; the PDF is a working document, not a
  designed publication.
