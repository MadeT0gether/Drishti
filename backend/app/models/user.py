import enum

from sqlalchemy import BigInteger, Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class Role(str, enum.Enum):
    ministry = "ministry"
    state = "state"
    district = "district"
    mp = "mp"
    officer = "officer"
    viewer = "viewer"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Scope columns: which slice of data this user may see (enforced in services).
    # ministry/viewer → all NULL; state role → state_id; district role → district_id; mp role → mp_id.
    state_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("states.id"), nullable=True)
    district_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("districts.id"), nullable=True)
    mp_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("mps.id"), nullable=True)

    state = relationship("State")
    district = relationship("District")
    mp = relationship("MP")
