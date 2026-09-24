import enum

from geoalchemy2 import Geography, Geometry
from sqlalchemy import BigInteger, Date, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class State(TimestampMixin, Base):
    __tablename__ = "states"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)

    districts = relationship("District", back_populates="state")


class District(TimestampMixin, Base):
    __tablename__ = "districts"
    __table_args__ = (UniqueConstraint("state_id", "name", name="uq_district_state_name"),)

    state_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("states.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    centroid = mapped_column(Geography("POINT", srid=4326), nullable=True)
    boundary = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)

    state = relationship("State", back_populates="districts")


class ConstituencyType(str, enum.Enum):
    lok_sabha = "lok_sabha"
    rajya_sabha = "rajya_sabha"


class Constituency(TimestampMixin, Base):
    __tablename__ = "constituencies"
    __table_args__ = (UniqueConstraint("state_id", "name", name="uq_constituency_state_name"),)

    state_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("states.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[ConstituencyType] = mapped_column(
        Enum(ConstituencyType, name="constituency_type"), nullable=False
    )

    state = relationship("State")
    mps = relationship("MP", back_populates="constituency")


class MP(TimestampMixin, Base):
    __tablename__ = "mps"

    constituency_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("constituencies.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    house: Mapped[str] = mapped_column(String(20), nullable=False)  # "lok_sabha" | "rajya_sabha"
    term_start = mapped_column(Date, nullable=True)
    term_end = mapped_column(Date, nullable=True)

    constituency = relationship("Constituency", back_populates="mps")
