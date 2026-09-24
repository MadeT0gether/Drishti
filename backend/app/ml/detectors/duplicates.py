"""Duplicate / near-duplicate detection.

Stage 1 (recall): pgvector cosine ANN per project, same district + category.
Stage 2 (precision): composite RANKING that combines lexical similarity
(SequenceMatcher on titles — separates true clones from template look-alikes
far better than embeddings alone), embedding similarity, PostGIS proximity,
cost similarity, agency and time overlap.

Output rows are CANDIDATES ordered by composite score — human verification
remains necessary. Composite >= 85 ranks as strong; 70-85 as review-worthy.
"""
from difflib import SequenceMatcher

import pandas as pd
from sqlalchemy import text

from app.database.session import engine
from app.ml.risk_config import DUP_GEO_KM_MAX, DUP_STORE_MIN, DUP_TEXT_SIM_MIN

# composite weights (documented methodology; tuned on demo-v2, see metrics.json).
# Cost similarity is deliberately down-weighted: same-category projects naturally
# cluster in cost, so near-equal cost is weak evidence on its own.
W_LEX, W_EMB, W_COST, W_GEO, W_AGENCY, W_TIME = 0.35, 0.20, 0.15, 0.20, 0.05, 0.05

CANDIDATE_SQL = """
SELECT p.id AS id_a, c.id AS id_b,
       p.title AS title_a, c.title AS title_b,
       1 - (p.description_embedding <=> c.description_embedding) AS emb_sim,
       ST_Distance(la.geom, lc.geom) / 1000.0 AS geo_km,
       p.sanctioned_cost::float8 AS cost_a, c.sanctioned_cost::float8 AS cost_b,
       (p.agency_id = c.agency_id) AS same_agency,
       (p.planned_start, p.planned_end) OVERLAPS (c.planned_start, c.planned_end) AS time_overlap
FROM projects p
JOIN project_locations la ON la.project_id = p.id
CROSS JOIN LATERAL (
    SELECT c.id, c.title, c.description_embedding, c.sanctioned_cost, c.agency_id,
           c.planned_start, c.planned_end
    FROM projects c
    WHERE c.district_id = p.district_id AND c.category_id = p.category_id
      AND c.id > p.id AND c.description_embedding IS NOT NULL
    ORDER BY c.description_embedding <=> p.description_embedding
    LIMIT 6
) c
JOIN project_locations lc ON lc.project_id = c.id
WHERE p.description_embedding IS NOT NULL
  AND 1 - (p.description_embedding <=> c.description_embedding) >= :emb_sim_min
"""


def detect() -> list[dict]:
    with engine.connect() as conn:
        pairs = pd.read_sql(text(CANDIDATE_SQL), conn, params={"emb_sim_min": DUP_TEXT_SIM_MIN})
    if pairs.empty:
        return []

    pairs["lex_sim"] = [
        SequenceMatcher(None, a.lower(), b.lower()).ratio()
        for a, b in zip(pairs["title_a"], pairs["title_b"])
    ]
    cost_lo = pairs[["cost_a", "cost_b"]].min(axis=1)
    cost_hi = pairs[["cost_a", "cost_b"]].max(axis=1)
    cost_sim = (cost_lo / cost_hi).where(cost_hi > 0)
    geo_score = (1 - (pairs["geo_km"] / DUP_GEO_KM_MAX).clip(0, 1)).fillna(0)

    composite = 100 * (
        W_LEX * pairs["lex_sim"]
        + W_EMB * pairs["emb_sim"]
        + W_COST * cost_sim.fillna(0.5)
        + W_GEO * geo_score
        + W_AGENCY * pairs["same_agency"].astype(float)
        + W_TIME * pairs["time_overlap"].astype(float)
    )
    pairs = pairs.assign(cost_sim=cost_sim, composite=composite.round(2))
    hits = pairs[pairs["composite"] >= DUP_STORE_MIN]

    out = []
    for _, r in hits.iterrows():
        out.append({
            "project_id_a": int(r["id_a"]), "project_id_b": int(r["id_b"]),
            "text_sim": round(float(r["lex_sim"]), 4),  # lexical similarity (primary text signal)
            "geo_km": round(float(r["geo_km"]), 3) if pd.notna(r["geo_km"]) else None,
            "cost_sim": round(float(r["cost_sim"]), 4) if pd.notna(r["cost_sim"]) else None,
            "same_category": True, "same_agency": bool(r["same_agency"]),
            "time_overlap": bool(r["time_overlap"]),
            "composite_score": float(r["composite"]), "status": "candidate",
        })
    return out
