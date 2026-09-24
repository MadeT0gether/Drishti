from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the repository root, one level above backend/
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str = "postgresql+psycopg://mplads:mplads_dev_password@localhost:5432/mplads"
    jwt_secret: str = "change-me-generate-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 8
    cors_origins: str = "http://localhost:5173"

    # Copilot LLM is OPTIONAL. With no key the Copilot runs in deterministic
    # evidence-based mode — no API call is ever attempted. Key/model come only
    # from the environment (.env, gitignored); never hardcode or expose them.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    # Groq (OpenAI-compatible) is a second optional provider; Anthropic wins
    # when both keys are configured.
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    copilot_timeout_seconds: float = 8.0

    # GeoTag-1 evidence upload settings
    # GEOTAG_MAX_FILE_MB controls the maximum accepted image size (per file).
    # GEOTAG_UPLOAD_DIR is relative to the backend/ directory.
    geotag_max_file_mb: int = 20
    geotag_upload_dir: str = "uploads/geotag"

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        # Railway/Heroku-style URLs use postgres:// or postgresql://, but the
        # psycopg v3 driver needs the explicit postgresql+psycopg:// scheme.
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return "postgresql+psycopg://" + v[len("postgres://"):]
            if v.startswith("postgresql://"):
                return "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
