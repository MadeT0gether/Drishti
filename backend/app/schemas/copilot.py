from pydantic import BaseModel, Field


class CopilotAsk(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class Citation(BaseModel):
    source_ref: str
    note: str | None = None


class CopilotAnswer(BaseModel):
    investigation_id: int
    question: str
    answer: str
    citations: list[Citation]
    cannot_answer: bool
    mode: str  # "llm" | "deterministic"
    model_version: str
    retrieval_method: str  # "vector" | "lexical"
    fallback_reason: str | None = None
    disclaimer: str


class CopilotStatus(BaseModel):
    mode: str
    model: str
    provider: str | None = None
    key_configured: bool
    sdk_installed: bool
    retrieval_method: str
    disclaimer: str
