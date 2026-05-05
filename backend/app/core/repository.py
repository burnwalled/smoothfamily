"""Base repository pattern enforcing tenant isolation.

CRITICAL: All repositories that access family-scoped data MUST inherit from
TenantScopedRepository or follow its pattern. The family_id parameter is
mandatory and never optional. This is non-negotiable for security.

See CLAUDE.md → "Tenant isolation" for the full design rationale.
"""

from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class TenantScopedRepository(Generic[ModelType]):
    """Base repository for any model that has family_id (i.e., almost all of them).

    Subclasses MUST set the model class attribute and ensure their model has
    a family_id column.
    """

    model: type[ModelType]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_for_family(self, family_id: UUID) -> list[ModelType]:
        """List all records for a specific family.

        Always filters on family_id. Never returns data from other families.
        """
        stmt = select(self.model).where(self.model.family_id == family_id)  # type: ignore[attr-defined]
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, *, record_id: UUID, family_id: UUID) -> ModelType | None:
        """Get a single record by ID, scoped to a family.

        Even when fetching by primary key, we ALWAYS include family_id in the
        filter. This prevents IDOR (Insecure Direct Object Reference) attacks
        where a user might guess another family's record ID.
        """
        stmt = select(self.model).where(
            self.model.id == record_id,  # type: ignore[attr-defined]
            self.model.family_id == family_id,  # type: ignore[attr-defined]
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> ModelType:
        """Create a new record. The caller MUST include family_id in kwargs.

        We don't enforce family_id presence at the type level (yet) because
        kwargs is dynamic, but tests will catch missing family_id.
        """
        if "family_id" not in kwargs:
            raise ValueError(
                f"family_id is required when creating {self.model.__name__}. "
                "This is a tenant isolation requirement."
            )
        instance = self.model(**kwargs)  # type: ignore[arg-type]
        self.db.add(instance)
        await self.db.flush()
        return instance

    async def delete(self, *, record_id: UUID, family_id: UUID) -> bool:
        """Delete a record, scoped to a family. Returns True if deleted."""
        record = await self.get_by_id(record_id=record_id, family_id=family_id)
        if record is None:
            return False
        await self.db.delete(record)
        await self.db.flush()
        return True
