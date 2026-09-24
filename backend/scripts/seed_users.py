"""Seed demo users (one per role) plus minimal geo scaffolding for scoped roles.

Usage (from backend/):  python -m scripts.seed_users
Idempotent: re-running updates nothing and skips existing rows.

Demo credentials are for the synthetic prototype only.
"""
import sys

from sqlalchemy import select, text

from app.auth.hashing import hash_password
from app.database.session import SessionLocal
from app.models import Constituency, District, MP, Role, State, User
from app.models.geo import ConstituencyType

DEMO_PASSWORD = "Demo@1234"

USERS = [
    ("ministry@mplads.demo", "Ministry Admin", Role.ministry),
    ("state.mh@mplads.demo", "Maharashtra State Authority", Role.state),
    ("district.pune@mplads.demo", "Pune District Authority", Role.district),
    ("officer@mplads.demo", "Monitoring Officer", Role.officer),
]


def get_or_create(db, model, defaults=None, **filters):
    obj = db.scalar(select(model).filter_by(**filters))
    if obj:
        return obj
    obj = model(**filters, **(defaults or {}))
    db.add(obj)
    db.flush()
    return obj


def main() -> int:
    db = SessionLocal()
    try:
        # Clean up removed accounts if present in DB
        removed_emails = ["mp.pune@mplads.demo", "viewer@mplads.demo"]
        for email in removed_emails:
            u = db.scalar(select(User).where(User.email == email))
            if u:
                db.execute(text("DELETE FROM audit_logs WHERE user_id = :uid"), {"uid": u.id})
                db.delete(u)
                db.flush()

        mh = get_or_create(db, State, name="Maharashtra", defaults={"code": "MH"})
        pune = get_or_create(db, District, state_id=mh.id, name="Pune")

        scope = {
            Role.state: {"state_id": mh.id},
            Role.district: {"state_id": mh.id, "district_id": pune.id},
        }

        created = 0
        for email, name, role in USERS:
            if db.scalar(select(User).where(User.email == email)):
                continue
            db.add(User(
                email=email,
                full_name=name,
                role=role,
                password_hash=hash_password(DEMO_PASSWORD),
                **scope.get(role, {}),
            ))
            created += 1
        db.commit()
        print(f"Seed complete: {created} user(s) created, {len(USERS) - created} already existed.")
        print(f"Demo password for all users: {DEMO_PASSWORD}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
