from datetime import date, datetime

from pydantic import BaseModel


class CategoryOut(BaseModel):
    id: int
    name: str
    sector: str


class AgencyOut(BaseModel):
    id: int
    name: str
    type: str


class ProjectListItem(BaseModel):
    id: int
    code: str
    title: str
    status: str
    category: str | None = None
    state: str | None = None
    district: str | None = None
    financial_year: str
    sanctioned_cost: float | None = None
    expenditure: float
    physical_progress_pct: float
    risk_score: float | None = None
    risk_level: str | None = None


class LocationOut(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    village: str | None = None
    address: str | None = None


class ProjectDetail(BaseModel):
    id: int
    code: str
    title: str
    description: str | None = None
    status: str
    data_source: str
    financial_year: str
    category: str | None = None
    state: str | None = None
    district: str | None = None
    constituency: str | None = None
    mp: str | None = None
    agency: str | None = None
    vendor: str | None = None
    location: LocationOut | None = None
    recommended_cost: float | None = None
    sanctioned_cost: float | None = None
    revised_cost: float | None = None
    expenditure: float
    physical_progress_pct: float
    financial_progress_pct: float | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    recommendation_date: date | None = None
    recommendation_amount: float | None = None
    sanction_no: str | None = None
    sanction_date: date | None = None
    sanction_amount: float | None = None
    created_at: datetime
