from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, health, ingest
from app.api.v1 import v1_router
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MPLADS AI Risk Intelligence Platform",
        description=(
            "Decision-support prototype (SIH 2026, PS 26102). "
            "AI-generated risk assessments are decision-support signals and do not "
            "constitute findings of fraud, misconduct, corruption, or legal liability."
        ),
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    # main application API
    app.include_router(v1_router)
    # legacy unversioned paths kept for M01/M02 tooling compatibility
    # (frontend must use /api/v1/*; these mirror the same handlers)
    app.include_router(auth.router, include_in_schema=False)
    app.include_router(ingest.router, include_in_schema=False)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # Never leak stack traces to clients.
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @app.on_event("startup")
    def warm_embedding_model():
        # The sentence-transformer loads lazily on first use (~10-30s), which
        # made the FIRST Copilot query/status call after boot crawl. Warm it in
        # a daemon thread so startup stays fast and the first user isn't the
        # one paying the load. No-op when only the TF-IDF fallback exists.
        import threading

        def _warm():
            try:
                from app.nlp.embeddings import embed_texts
                embed_texts(["warmup"])
            except Exception:
                pass  # degraded retrieval is handled at call time

        threading.Thread(target=_warm, name="embedding-warmup", daemon=True).start()

    return app


app = create_app()
