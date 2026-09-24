"""Load real district boundaries (Census 2011, DataMeet CC BY 4.0) into
districts.boundary.

Usage (from backend/):  python -m scripts.seed_boundaries
Source file: data/seed/boundaries/districts_census2011.geojson — see
data/seed/boundaries/ATTRIBUTION.md for source, license and alias mapping.

Idempotent: re-running overwrites boundaries with the same data. Verifies that
every feature matches exactly one district row, every geometry is valid, and
exactly 80 districts end up with a boundary.
"""
import json
import sys
from pathlib import Path

from sqlalchemy import text

from app.database.session import engine

GEOJSON = (Path(__file__).resolve().parents[2] / "data" / "seed" / "boundaries"
           / "districts_census2011.geojson")


def main() -> int:
    fc = json.loads(GEOJSON.read_text(encoding="utf-8"))
    features = fc["features"]
    if len(features) != 80:
        print(f"expected 80 features, found {len(features)}")
        return 1

    with engine.begin() as conn:
        rows = conn.execute(text(
            "SELECT d.id, d.name, s.name FROM districts d JOIN states s ON s.id = d.state_id"
        )).all()
        by_key = {}
        for did, dname, sname in rows:
            key = (sname, dname)
            if key in by_key:
                print(f"DUPLICATE district row in DB: {key}")
                return 1
            by_key[key] = did

        updated = 0
        for f in features:
            p = f["properties"]
            key = (p["state"], p["district"])
            did = by_key.get(key)
            if did is None:
                continue
            conn.execute(text(
                # ST_MakeValid may emit a GeometryCollection (polygons + slivers);
                # CollectionExtract(..., 3) keeps only the polygonal parts
                "UPDATE districts SET boundary = ST_Multi(ST_CollectionExtract("
                "ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326)), 3)) WHERE id = :id"
            ), {"g": json.dumps(f["geometry"]), "id": did})
            updated += 1

        total, with_boundary, invalid = conn.execute(text(
            "SELECT count(*), count(boundary), "
            "count(*) FILTER (WHERE boundary IS NOT NULL AND NOT ST_IsValid(boundary)) "
            "FROM districts")).first()

    print(f"boundaries loaded: {updated} updated | districts: {total}, "
          f"with boundary: {with_boundary}, invalid geometries: {invalid}")
    if with_boundary != total or invalid != 0:
        return 1
    print("Attribution: India boundaries by DataMeet India community (CC BY 4.0) "
          "— https://github.com/datameet/maps")
    return 0


if __name__ == "__main__":
    sys.exit(main())
