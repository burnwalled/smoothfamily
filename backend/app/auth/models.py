import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base

if TYPE_CHECKING:
    from app.families.models import Family, UserFamilyMembership


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    clerk_user_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    locale: Mapped[str] = mapped_column(String(10), default="sv")
    timezone: Mapped[str] = mapped_column(String(50), default="Europe/Stockholm")
    theme_preference: Mapped[str] = mapped_column(String(30), default="light")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owned_families: Mapped[list["Family"]] = relationship(
        "Family", backref="owner", foreign_keys="Family.owner_user_id"
    )
    memberships: Mapped[list["UserFamilyMembership"]] = relationship(
        "UserFamilyMembership", backref="user", cascade="all, delete-orphan"
    )
