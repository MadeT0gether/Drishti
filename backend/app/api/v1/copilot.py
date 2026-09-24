"""Copilot endpoints. Read-only over case evidence: the Copilot never mutates
case state; accepting a draft goes through PATCH /investigations/{id}."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.rbac import get_current_user, require_roles
from app.database.session import get_db
from app.models import Role, User
from app.schemas.copilot import CopilotAnswer, CopilotAsk, CopilotStatus
from app.services import copilot_service

ACT = (Role.ministry, Role.state, Role.district, Role.officer)

router = APIRouter(prefix="/investigations", tags=["Copilot"])
status_router = APIRouter(prefix="/copilot", tags=["Copilot"])


@router.post("/{investigation_id}/copilot/ask", response_model=CopilotAnswer,
             summary="Ask the grounded Copilot about this case")
def copilot_ask(investigation_id: int, body: CopilotAsk,
                db: Session = Depends(get_db), user: User = Depends(require_roles(*ACT))):
    """Grounded ONLY in verified facts for this case plus approved guideline
    excerpts. Falls back to the deterministic evidence engine automatically
    when no LLM is configured or the provider fails."""
    return copilot_service.ask(db, user, investigation_id, body.question)


@router.post("/{investigation_id}/copilot/summary", response_model=CopilotAnswer,
             summary="Draft a case summary (not persisted until the officer accepts)")
def copilot_summary(investigation_id: int, db: Session = Depends(get_db),
                    user: User = Depends(require_roles(*ACT))):
    return copilot_service.summary(db, user, investigation_id)


@status_router.get("/status", response_model=CopilotStatus,
                   summary="Copilot mode (llm or deterministic) — no silent substitution")
def copilot_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return copilot_service.status(db)
