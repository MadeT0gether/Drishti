# Investigation & Decision Support Workflow (M06)

Authoritative reference for the investigation layer built on M03 risk engine
and M04 API outputs. Part of the MPLADS AI Risk Intelligence platform.

## 1. Purpose

Transform AI-detected risk into a structured, auditable investigation process:

```
AI detects risk
    ↓
Investigation priority (smart queue)
    ↓
Investigation case (opened by officer)
    ↓
Evidence review
    ↓
AI-recommended investigation actions
    ↓
Human officer decision (accept / modify / reject)
    ↓
Outcome
    ↓
Audit trail
```

The investigation layer does **not** create a second risk engine. It uses
existing M03 risk assessments, anomaly results, predictions, duplicate
candidates, network signals, and reconciliation results. The AI Copilot
generates grounded recommendations from this verified data.

## 2. Smart Investigation Queue

### Priority formula

```
investigation_priority = risk_score × financial_weight × evidence_weight
```

Where:

- **risk_score**: The M03 composite risk score (0–100), calibrated from
  contribution-capped detectors.
- **financial_weight**: Log-scaled expenditure against the P95 expenditure
  within the caller's authorized scope, floored at 0.6 so low-cost high-risk
  projects still surface.

  ```
  financial_weight = 0.6 + 0.4 × min(1, ln(1 + expenditure) / ln(1 + P95))
  ```

- **evidence_weight**: Discounts weakly-evidenced high scores so officers get
  defensible cases first. Values: low=0.75, medium=0.90, high=1.00.

The queue recomputes live from current risk assessments. When a case is opened,
the priority score and its full breakdown are **frozen** onto the case record
so "why was this prioritized?" remains answerable after risk scores change.

### API

`GET /api/v1/investigations/queue` — paginated, scope-enforced, filterable by
risk_level, state_id, district_id, has_open_case.

## 3. Investigation Case Lifecycle

### Schema

**investigations** table:

| Field | Type | Purpose |
|---|---|---|
| case_number | String(20) | Human-readable ID (e.g. `INV-2026-00042`) |
| project_id | BigInteger FK | The project under investigation |
| alert_id | BigInteger FK | Optional triggering alert |
| status | Enum | Current lifecycle state |
| priority_score | Numeric(6,2) | Frozen at open time |
| priority_breakdown | JSONB | Full formula breakdown |
| risk_assessment_id | BigInteger FK | Pinned risk snapshot |
| assigned_to_id | BigInteger FK | Current assignee |
| opened_by_id | BigInteger FK | Who opened the case |
| sla_due_at | DateTime | Deadline (7d critical, 14d high, 30d moderate/low) |
| summary | Text | Officer-written or Copilot-drafted (accepted by officer) |
| outcome | Enum | Final disposition (only on close) |
| outcome_note | Text | Officer's written justification |
| closed_at | DateTime | When outcome was recorded |

**Constraint**: One active (non-closed/dismissed) case per project (partial
unique index).

### State machine

```
open ──→ in_progress ──→ pending_info ──→ in_progress
  │           │                               │
  │           ├──→ closed (requires outcome)   │
  │           │                               ├──→ closed
  └──→ dismissed (requires outcome)           │
                                              └──→ ... (cycle)

closed ──→ in_progress (reopen: ministry/officer only)
dismissed ──→ in_progress (reopen: ministry/officer only)
```

Transitions are validated **server-side**. Invalid transitions → 422.

### Statuses

| Status | Meaning |
|---|---|
| `open` | Case created, not yet started |
| `in_progress` | Active review underway |
| `pending_info` | Waiting for information or documents |
| `closed` | Review completed with outcome |
| `dismissed` | No further action warranted, with outcome |

### Outcomes

| Value | Label | Meaning |
|---|---|---|
| `verified_issue` | Verified issue | A reviewable issue was confirmed from records |
| `no_issue_found` | No issue found | Flagged indicators were explained by verified records |
| `data_corrected` | Data corrected | The signals traced to record errors, now corrected |
| `escalated` | Escalated | Referred to the competent authority with documented evidence |
| `inconclusive` | Inconclusive | Required information could not be obtained |

Closing a case requires **both** an outcome and a written outcome note.

## 4. Investigation Actions

**investigation_actions** table — append-only (no updates, no deletes).

Every meaningful investigation event records:

- investigation_id, user_id, action_type
- reason (mandatory text)
- from_status / to_status (for transitions)
- detail (JSONB — structured metadata)
- created_at (timestamp)

### Action types

| Type | Created by | Notes |
|---|---|---|
| `opened` | System | On case creation |
| `assigned` | Officer | When case is assigned |
| `status_changed` | Officer | On state machine transition |
| `note_added` | Officer | Free-form investigative note |
| `evidence_reviewed` | Officer | Records that evidence was examined |
| `info_requested` | Officer | Documents or information requested |
| `playbook_step_completed` | Officer | Marks a playbook step as done |
| `copilot_queried` | System | Logs every Copilot consultation |
| `copilot_summary_accepted` | Officer | AI-drafted summary was accepted |
| `copilot_summary_rejected` | Officer | AI-drafted summary was rejected |
| `summary_updated` | Officer | Manual summary written |
| `outcome_recorded` | System | On case close with outcome |
| `reopened` | Officer | On reopen (ministry/officer only) |

User-created actions via `POST /actions`: `note_added`, `evidence_reviewed`,
`info_requested`, `playbook_step_completed`. All others are system-generated
through specific API endpoints (transition, assign, copilot).

## 5. RBAC & Scope

Investigation cases obey the same scope model as projects:

| Role | Scope | Can act on cases? |
|---|---|---|
| ministry | National | ✅ |
| state | Own state | ✅ |
| district | Own district | ✅ |
| officer | National | ✅ |
| mp | Own MP's projects | ❌ (read only) |
| viewer | National (read only) | ❌ (read only) |

Server-side enforcement:
- Queue and case lists are scope-filtered
- Case detail, actions, and Copilot access check scope
- Assignment validates the assignee's scope covers the project
- Viewers and MPs cannot create, transition, or add actions (403)
- Reopening requires ministry or officer role

## 6. Audit Trail

Every investigation event is mirrored to the existing `audit_logs` table
with `entity_type="project"` so the existing `/audit/{project_id}` endpoint
shows investigation history alongside all other project events.

Audit actions follow the pattern `investigation.<action_type>`, e.g.:
- `investigation.opened`
- `investigation.status_changed`
- `investigation.assigned`
- `investigation.copilot_queried`
- `investigation.outcome_recorded`

## 7. Investigation Playbooks

Playbooks are **versioned JSON files** in `backend/app/investigation/playbooks/`.
They are curated developer content, not user data. Per-case progress is tracked
in `investigation_actions` (action_type=`playbook_step_completed`).

### Available playbooks (9)

| ID | Applies to | Steps |
|---|---|---|
| `cost-anomaly-v1` | cost_anomaly | Compare peers → Review estimate → Verify site → Decision |
| `payment-anomaly-v1` | payment_anomaly | Review sanction → Payment pattern → Approval chain → Decision |
| `progress-mismatch-v1` | progress_payment_mismatch | Financial vs physical → Milestone review → Site visit → Decision |
| `delay-risk-v1` | delay_risk | Schedule review → Resource check → Contractor review → Decision |
| `duplicate-candidate-v1` | duplicate_candidate | Compare details → Location → Timing → Physical verify → Decision |
| `reconciliation-v1` | reconciliation_mismatch | Financial records → Transaction matching → Missing items → Decision |
| `data-quality-v1` | data_quality | Data inventory → Correction → Verification → Decision |
| `network-signal-v1` | network_signal | Relationship review → Pattern analysis → Evidence → Decision |
| `general-review-v1` | (fallback) | General evidence review for any case |

Each playbook step carries:
- `id`, `title`, `guidance`, optional `evidence_hint`

The case detail endpoint returns playbooks that match the case's risk factor
types, plus the general review playbook. Step completion status is computed
from the case's `investigation_actions`.

## 8. AI Investigation Copilot

### Architecture

```
Officer question
    ↓
Verified context builder (allow-listed DB facts, caller's scope only)
    ↓
Guideline retrieval (pgvector cosine; lexical fallback)
    ↓
LLM (if configured) OR deterministic engine
    ↓
Citation verification (every ref must exist in context)
    ↓
Vocabulary guard (no fraud/guilt assertions)
    ↓
Answer + disclaimer
```

### Mode A — Deterministic (always available)

Uses existing verified M03/M04 data to assemble structured responses:
- Lists contributing risk indicators with evidence
- Recommends review steps from matching playbooks
- Cites relevant guideline excerpts
- Requires **no external API key**

### Mode B — Optional Anthropic LLM

Activated only when `ANTHROPIC_API_KEY` is configured in the backend `.env`.
The LLM receives:
- A system prompt enforcing grounding rules
- Verified context (allow-listed facts only)
- A forced tool-call schema (no free-form output)

If the LLM response:
- Fails validation → deterministic fallback
- Contains banned vocabulary → deterministic fallback
- Has unverifiable citations → deterministic fallback
- Times out or errors → deterministic fallback

The fallback reason is always reported to the frontend.

### Grounding guarantees

1. **Allow-listed context**: The context builder explicitly selects permitted
   fields. `anomaly_ground_truth` is never imported.
2. **Scope enforcement**: Same `assert_project_access` as all endpoints.
3. **Citation verification**: Every cited `source_ref` must exist in the
   provided context. Fabricated citations are rejected.
4. **Vocabulary guard**: Regex patterns reject assertions of fraud, guilt,
   corruption, or collusion (neutral mentions in disclaimers pass).
5. **Read-only**: The Copilot never modifies case state. Drafts are only
   persisted through the officer's explicit summary-update call.
6. **Structured output**: The LLM is forced through a tool-call schema.
   Response format: `{answer, citations[], cannot_answer}`.

### Prompt-injection protection

All project text (titles, descriptions, notes) within `<verified_context>`
is treated as **DATA, not instructions**. The system prompt explicitly
instructs the model to ignore any instruction-like text found in the data
block.

### Configuration

```env
# .env (gitignored, never committed)
ANTHROPIC_API_KEY=         # leave empty for deterministic mode
ANTHROPIC_MODEL=claude-sonnet-5
```

## 9. Responsible AI

The investigation layer follows the same responsible-AI principles as the
rest of the platform:

- **AI identifies risk indicators; it does not establish guilt**
- Terminology: "requires review", "potential anomaly", "recommended
  verification", "risk indicator", "duplicate candidate"
- Never: "fraud confirmed", "corruption confirmed", "collusion confirmed"
- The standard disclaimer appears on all Copilot responses and the frontend
- All AI-generated content is clearly labeled as decision support
- Officer decisions are always explicitly distinguished from AI recommendations
- The Copilot **never** automatically accuses anyone, establishes fraud,
  closes or escalates a case, or modifies investigation state

## 10. API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/investigations/queue` | Smart queue (ranked, paginated, filtered) |
| GET | `/api/v1/investigations/playbooks` | All playbooks |
| GET | `/api/v1/investigations/playbooks/{id}` | Single playbook |
| GET | `/api/v1/investigations` | List cases (filtered, sorted, paginated) |
| POST | `/api/v1/investigations` | Open a case (reason required) |
| GET | `/api/v1/investigations/{id}` | Case detail with risk snapshot + playbooks |
| GET | `/api/v1/investigations/{id}/actions` | Action timeline |
| POST | `/api/v1/investigations/{id}/actions` | Record an action (reason required) |
| POST | `/api/v1/investigations/{id}/transition` | State machine transition |
| POST | `/api/v1/investigations/{id}/assign` | Assign to an officer |
| PATCH | `/api/v1/investigations/{id}` | Update case summary |
| POST | `/api/v1/investigations/{id}/copilot/ask` | Ask the Copilot |
| POST | `/api/v1/investigations/{id}/copilot/summary` | Draft a case summary |
| GET | `/api/v1/copilot/status` | Copilot mode/status |

## 11. Frontend Pages

| Route | Component | Purpose |
|---|---|---|
| `/investigations/queue` | InvestigationQueue | Smart queue with priority breakdown |
| `/investigations` | CaseList | Case list with filters |
| `/investigations/:id` | CaseDetail | Full case detail with Copilot |

Navigation: Sidebar entries for "Investigation Queue" and "Cases" in the
AppShell. Project detail page includes an "InvestigationEntry" component
linking to the project's case or the queue.

## 12. Database Migration

Alembic migration `0005_investigations` creates:
- `investigations` table with partial unique index
- `investigation_actions` table (append-only)
- `guideline_chunks` table with pgvector embedding support
- PostgreSQL enums: `investigation_status`, `investigation_outcome`
