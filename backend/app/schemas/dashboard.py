from pydantic import BaseModel


class OverviewOut(BaseModel):
    total_projects: int
    total_sanctioned: float
    total_expenditure: float
    status_counts: dict
    delayed_projects: int
    risk_distribution: dict
    high_risk_count: int
    critical_count: int
    open_alerts: int
    anomaly_counts: dict
    data_quality_issues: int
    scope: str  # which slice this user is seeing (national / state / district / mp)
    dataset_note: str = "Prototype Dataset — Synthetic Data"


class StateAggOut(BaseModel):
    state_id: int
    state: str
    project_count: int
    sanctioned: float
    expenditure: float
    utilization_pct: float | None = None
    completion_rate_pct: float | None = None
    delay_rate_pct: float | None = None
    avg_risk: float | None = None
    high_risk_count: int
    critical_count: int
    anomaly_count: int


class DistrictAggOut(BaseModel):
    district_id: int
    district: str
    state_id: int
    state: str
    project_count: int
    sanctioned: float
    expenditure: float
    utilization_pct: float | None = None
    completion_rate_pct: float | None = None
    delay_rate_pct: float | None = None
    avg_risk: float | None = None
    high_risk_count: int
    critical_count: int
    anomaly_count: int


class DistrictHealthOut(BaseModel):
    district_id: int
    district: str
    state: str
    health_score: float | None = None  # null only when no component is computable
    band: str | None = None            # steady | watch | needs_attention (neutral labels)
    confidence: str | None = None      # full | low (small portfolio)
    score_breakdown: dict | None = None  # subscores, weights, contributions, formula
    components: dict
    project_count: int
    disclaimer: str


class MapDistrictPoint(BaseModel):
    district_id: int
    district: str
    state_id: int
    state: str
    latitude: float | None = None
    longitude: float | None = None
    project_count: int
    avg_risk: float | None = None
    high_risk_count: int
    critical_count: int
    moderate_count: int = 0
    low_count: int = 0
    expenditure: float = 0
    active_investigations: int = 0


class BoundaryFeature(BaseModel):
    type: str
    properties: dict
    geometry: dict


class BoundariesOut(BaseModel):
    type: str
    attribution: str
    features: list[BoundaryFeature]


class MapProjectPoint(BaseModel):
    project_id: int
    code: str
    latitude: float
    longitude: float
    risk_score: float | None = None
    risk_level: str | None = None
    district_id: int
    state_id: int


class MapOut(BaseModel):
    mode: str  # districts | projects
    districts: list[MapDistrictPoint] = []
    projects: list[MapProjectPoint] = []
    truncated: bool = False
