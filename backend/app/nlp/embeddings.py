"""Text embeddings for duplicate detection, stored in pgvector (projects.description_embedding).

Primary backend: sentence-transformers all-MiniLM-L6-v2 (384-d).
Fallback backend: TF-IDF char 3-5-grams -> TruncatedSVD to 384-d (scikit-learn),
used automatically if torch is unavailable on this Python version. The backend
actually used is recorded in model_versions params — no silent substitution.
"""
import numpy as np
from sqlalchemy import text

from app.database.session import engine

DIM = 384


_ST_MODEL = None


def _st_model():
    # cached: query-time embedding (Copilot guideline retrieval) must not
    # reload the model on every request
    global _ST_MODEL
    if _ST_MODEL is None:
        from sentence_transformers import SentenceTransformer

        _ST_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _ST_MODEL


def _embed_sentence_transformers(texts: list[str]) -> np.ndarray:
    return np.asarray(_st_model().encode(texts, batch_size=256, show_progress_bar=False,
                                         normalize_embeddings=True))


def _embed_tfidf_svd(texts: list[str]) -> np.ndarray:
    from sklearn.decomposition import TruncatedSVD
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.preprocessing import normalize

    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, max_features=200_000)
    X = vec.fit_transform(texts)
    svd = TruncatedSVD(n_components=DIM, random_state=42)
    return normalize(svd.fit_transform(X))


def get_backend() -> str:
    try:
        import sentence_transformers  # noqa: F401
        import torch  # noqa: F401
        return "sentence-transformers/all-MiniLM-L6-v2"
    except Exception:
        return "tfidf-char35-svd384"


def embed_texts(texts: list[str]) -> np.ndarray | None:
    """Embed arbitrary texts (guideline chunks, Copilot queries) with the
    sentence-transformers backend. Returns None when only the TF-IDF fallback is
    available — TF-IDF/SVD is corpus-fitted, so it cannot embed a lone query into
    a stored space; callers must fall back to lexical retrieval instead."""
    if not get_backend().startswith("sentence-transformers"):
        return None
    return _embed_sentence_transformers(texts)


def compute_and_store_embeddings() -> dict:
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT p.id, p.title || ' ' || COALESCE(l.village, '') AS txt "
            "FROM projects p LEFT JOIN project_locations l ON l.project_id = p.id ORDER BY p.id"
        )).all()
    ids = [r[0] for r in rows]
    texts = [r[1] for r in rows]

    backend = get_backend()
    if backend.startswith("sentence-transformers"):
        emb = _embed_sentence_transformers(texts)
    else:
        emb = _embed_tfidf_svd(texts)

    with engine.begin() as conn:
        for i in range(0, len(ids), 1000):
            conn.execute(
                text("UPDATE projects SET description_embedding = CAST(:e AS vector) WHERE id = :id"),
                [{"id": pid, "e": "[" + ",".join(f"{x:.6f}" for x in emb[j]) + "]"}
                 for j, pid in enumerate(ids[i:i + 1000], start=i)],
            )
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_projects_embedding ON projects "
            "USING ivfflat (description_embedding vector_cosine_ops) WITH (lists = 100)"
        ))
    return {"backend": backend, "count": len(ids), "dim": emb.shape[1]}
