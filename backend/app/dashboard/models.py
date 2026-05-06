import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class DashboardWidgetLayout(Base):
    __tablename__ = "dashboard_widget_layouts"
    __table_args__ = (
        UniqueConstraint(
            "family_id",
            "user_id",
            "widget_type",
            name="uq_dashboard_widget_layout_family_user_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    widget_type: Mapped[str] = mapped_column(String(80), index=True)
    size: Mapped[str] = mapped_column(String(20), default="large")
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
