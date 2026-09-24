from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.rbac import require_roles
from app.database.session import get_db
from app.models import Role, User
from app.schemas.misc import AuditEventOut
from app.services import misc_service

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("/{project_id}", response_model=list[AuditEventOut],
            summary="Audit trail for a project (AI assessments + user actions)")
def project_audit(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(
        Role.ministry, Role.state, Role.district, Role.officer)),
):
    """Viewers and MPs do not receive audit data; scoped roles only see
    projects inside their scope."""
    return misc_service.project_audit(db, user, project_id)
