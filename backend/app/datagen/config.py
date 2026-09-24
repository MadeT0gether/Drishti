"""Generation parameters. All randomness flows from `seed`; identical
(seed, n_projects, as_of, rates) => identical dataset."""
from dataclasses import dataclass, field
from datetime import date


@dataclass
class AnomalyRates:
    cost_anomaly: float = 0.015
    payment_anomaly: float = 0.010
    progress_payment_mismatch: float = 0.010
    delay_anomaly: float = 0.015
    cost_overrun: float = 0.010
    duplicate_project: float = 0.004        # fraction of projects that get a duplicate clone
    near_duplicate_project: float = 0.004
    geographic_duplicate: float = 0.003
    duplicate_hard_negative: float = 0.004  # legitimate similar pairs, ground_truth_label=False
    reconciliation_mismatch: float = 0.015
    data_quality: float = 0.015
    vendor_concentration_districts: int = 10
    relationship_clusters: int = 8
    compound_cases: int = 30  # projects carrying several correlated anomalies at once


@dataclass
class GenConfig:
    n_projects: int = 25000
    seed: int = 42
    dataset_version: str = "demo-v1"
    as_of: date = date(2026, 8, 24)  # reference "today" for progress/status logic
    rates: AnomalyRates = field(default_factory=AnomalyRates)

    def params_dict(self) -> dict:
        return {
            "n_projects": self.n_projects,
            "seed": self.seed,
            "as_of": self.as_of.isoformat(),
            "rates": {k: v for k, v in vars(self.rates).items()},
        }


# (name, sector, cost_min ₹, cost_max ₹, base_duration_days, asset noun)
CATEGORIES = [
    ("Road Construction", "infrastructure", 500_000, 5_000_000, 240, "cement concrete road"),
    ("Community Hall", "community", 1_000_000, 6_000_000, 360, "community hall"),
    ("School Building", "education", 800_000, 5_000_000, 330, "additional classroom block"),
    ("Drinking Water Facility", "water", 300_000, 2_500_000, 180, "drinking water facility"),
    ("Drainage Works", "infrastructure", 400_000, 3_000_000, 200, "drainage line"),
    ("Street Lighting", "infrastructure", 200_000, 1_500_000, 120, "solar street lights"),
    ("Health Sub-Centre", "health", 1_200_000, 7_000_000, 400, "health sub-centre"),
    ("Anganwadi Centre", "community", 600_000, 2_500_000, 270, "anganwadi centre building"),
    ("Public Library", "education", 500_000, 3_000_000, 300, "public library building"),
    ("Sports Facility", "community", 400_000, 4_000_000, 270, "open gym and sports ground"),
    ("Crematorium Upgradation", "community", 300_000, 2_000_000, 210, "crematorium shed"),
    ("Bus Shelter", "infrastructure", 150_000, 800_000, 90, "passenger bus shelter"),
]

FINANCIAL_YEARS = ["2022-23", "2023-24", "2024-25", "2025-26"]
FY_WEIGHTS = [0.15, 0.20, 0.30, 0.35]

VILLAGE_PREFIXES = [
    "Ram", "Shiv", "Krishna", "Ganga", "Deo", "Chand", "Sundar", "Bhim", "Laxmi", "Hari",
    "Gopal", "Kamal", "Nand", "Pratap", "Raj", "Anand", "Vijay", "Kishan", "Mohan", "Balaji",
]
VILLAGE_SUFFIXES = ["pur", "gaon", "nagar", "wadi", "palli", "garh", "ganj", "khera", "halli", "puram"]

# Regional flavor: which suffixes dominate village names per state code.
VILLAGE_SUFFIX_BY_STATE = {
    "MH": ["wadi", "gaon", "pur", "nagar"],
    "UP": ["pur", "ganj", "khera", "nagar"],
    "KA": ["halli", "pur", "nagar", "palli"],
    "TN": ["puram", "palli", "nagar", "ur"],
    "RJ": ["pur", "garh", "khera", "nagar"],
    "GJ": ["pur", "nagar", "gadh", "wada"],
    "WB": ["pur", "ganj", "gram", "nagar"],
    "MP": ["pur", "gaon", "khera", "nagar"],
    "BR": ["pur", "ganj", "gaon", "nagar"],
    "KL": ["puram", "kara", "adu", "ssery"],
}

AGENCY_TYPES = ["Zilla Parishad", "PWD Division", "Municipal Council", "Gram Panchayat Samiti"]
VENDOR_WORDS = [
    "Constructions", "Infra Projects", "Builders", "Engineering Works", "Associates",
    "Enterprises", "Infrastructure", "Civil Works", "Developers", "Contractors",
]
