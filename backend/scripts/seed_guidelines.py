"""Seed guideline_chunks from data/seed/guidelines/*.md for Copilot retrieval.

Usage (from backend/):  python -m scripts.seed_guidelines
Idempotent: chunks are keyed by content checksum; unchanged chunks are skipped,
removed ones are deleted. Embeddings are stored only when the
sentence-transformers backend is available; otherwise retrieval falls back to
lexical scoring at query time (recorded here in the output — no silent
substitution).
"""
import hashlib
import re
import sys
from pathlib import Path

from sqlalchemy import select, text

from app.database.session import SessionLocal, engine
from app.models import GuidelineChunk
from app.nlp.embeddings import embed_texts, get_backend

GUIDELINE_DIR = Path(__file__).resolve().parents[2] / "data" / "seed" / "guidelines"


def parse_chunks() -> list[dict]:
    """One chunk per '## Section' of each markdown file."""
    chunks = []
    for path in sorted(GUIDELINE_DIR.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        title_match = re.search(r"^# (.+)$", content, re.MULTILINE)
        doc_name = title_match.group(1).strip() if title_match else path.stem
        for m in re.finditer(r"^## (.+?)$\n(.*?)(?=^## |\Z)", content, re.MULTILINE | re.DOTALL):
            section, body = m.group(1).strip(), m.group(2).strip()
            if not body:
                continue
            chunk_text = f"{section}. {body}"
            chunks.append({
                "doc_name": doc_name[:120], "section": section[:120],
                "chunk_text": chunk_text,
                "checksum": hashlib.sha256(f"{doc_name}|{section}|{body}".encode()).hexdigest(),
            })
    return chunks


def main() -> int:
    chunks = parse_chunks()
    if not chunks:
        print(f"No guideline files found in {GUIDELINE_DIR}")
        return 1

    backend = get_backend()
    embeddings = embed_texts([c["chunk_text"] for c in chunks])

    db = SessionLocal()
    try:
        existing = {c.checksum: c for c in db.scalars(select(GuidelineChunk)).all()}
        wanted = {c["checksum"] for c in chunks}
        added = skipped = 0
        for i, c in enumerate(chunks):
            emb = embeddings[i].tolist() if embeddings is not None else None
            row = existing.get(c["checksum"])
            if row is not None:
                if emb is not None and row.embedding is None:
                    row.embedding = emb
                skipped += 1
                continue
            db.add(GuidelineChunk(**c, embedding=emb))
            added += 1
        removed = 0
        for checksum, row in existing.items():
            if checksum not in wanted:
                db.delete(row)
                removed += 1
        db.commit()
    finally:
        db.close()

    if embeddings is not None:
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_guideline_chunks_embedding ON guideline_chunks "
                "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)"))

    mode = "vector" if embeddings is not None else "lexical-only (no embedding backend)"
    print(f"Guideline chunks: +{added} added, {skipped} unchanged, {removed} removed "
          f"| retrieval mode: {mode} | embedding backend: {backend}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
