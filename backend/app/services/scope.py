"""Server-side scope enforcement. Every project-scoped query MUST pass through
these helpers — query parameters supplied by the client can only NARROW the
user's permitted scope, never widen it.

ministry / officer / viewer -> national
state                       -> own state only
district                    -> own district only
mp                          -> own MP's projects only
"""
from fastapi import HTTPException, status
from sqlalchemy import Select

from app.models import Project, Role, User

NATIONAL_ROLES = {Role.ministry, Role.officer, Role.viewer}


def scoped_projects(stmt: Select, user: User) -> Select:
    """Applies the user's mandatory scope filter to a Project select."""
    if user.role in NATIONAL_ROLES:
        return stmt
    if user.role == Role.state and user.state_id:
        return stmt.where(Project.state_id == user.state_id)
    if user.role == Role.district and user.district_id:
        return stmt.where(Project.district_id == user.district_id)
    if user.role == Role.mp and user.mp_id:
        return stmt.where(Project.mp_id == user.mp_id)
    # scoped role without a scope assignment sees nothing
    return stmt.where(Project.id.is_(None))


def assert_project_access(project: Project | None, user: User) -> Project:
    """404 if missing; 403 if outside the user's scope."""
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if user.role in NATIONAL_ROLES:
        return project
    permitted = (
        (user.role == Role.state and project.state_id == user.state_id)
        or (user.role == Role.district and project.district_id == user.district_id)
        or (user.role == Role.mp and project.mp_id == user.mp_id)
    )
    if not permitted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project is outside your authorized scope",
        )
    return project


def scope_label(user: User) -> str:
    if user.role == Role.state:
        return "state"
    if user.role == Role.district:
        return "district"
    if user.role == Role.mp:
        return "mp"
    return "national"
