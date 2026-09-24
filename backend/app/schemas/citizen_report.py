"""Schemas for Citizen Issue Reports (DRISHTI Transparency Portal)."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class CitizenReportCreate(BaseModel):
    issue_type: str = Field(
        ...,
        description="Issue category e.g. incorrect_info, project_missing, work_not_happening, work_incomplete, incorrect_location, funding_concern, other",
    )
    project_id: Optional[int] = None
    custom_project_name: Optional[str] = None
    state_id: Optional[int] = None
    district_id: Optional[int] = None
    village_locality: Optional[str] = None
    description: str = Field(..., min_length=10, max_length=5000)
    photos: list[dict[str, Any]] = Field(default_factory=list)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_confirmed: bool = True
    observation_datetime: Optional[datetime] = None
    reporter_name: Optional[str] = None
    reporter_mobile: Optional[str] = None
    reporter_email: Optional[str] = None
    reporter_relationship: Optional[str] = None


class CitizenReportPublicStatus(BaseModel):
    reference_id: str
    issue_type: str
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    project_title: Optional[str] = None
    project_code: Optional[str] = None
    district_name: Optional[str] = None
    state_name: Optional[str] = None
    resolution_remarks: Optional[str] = None


class CitizenReportOut(BaseModel):
    id: int
    reference_id: str
    issue_type: str
    project_id: Optional[int] = None
    project_code: Optional[str] = None
    project_title: Optional[str] = None
    custom_project_name: Optional[str] = None
    state_id: Optional[int] = None
    state_name: Optional[str] = None
    district_id: Optional[int] = None
    district_name: Optional[str] = None
    village_locality: Optional[str] = None
    description: str
    photos: list[dict[str, Any]]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_confirmed: bool
    observation_datetime: Optional[datetime] = None
    # Restricted info for authorized officials
    reporter_name: Optional[str] = None
    reporter_mobile: Optional[str] = None
    reporter_email: Optional[str] = None
    reporter_relationship: Optional[str] = None
    status: str
    assigned_to_id: Optional[int] = None
    assigned_to_name: Optional[str] = None
    resolution_remarks: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CitizenReportUpdate(BaseModel):
    status: Optional[str] = Field(
        None,
        pattern="^(submitted|under_review|verification_required|resolved|dismissed)$",
    )
    assigned_to_id: Optional[int] = None
    resolution_remarks: Optional[str] = Field(None, max_length=3000)
