"""Storage abstraction for media files.

STORAGE_PROVIDER=local is the only supported provider. The interface is
designed so that future providers (Google Drive, OneDrive — phase K) can slot
in without changing callers.
"""
import shutil
import uuid
from pathlib import Path
from typing import IO, Protocol

from app.config import get_settings


class StorageProvider(Protocol):
    """Interface that all storage backends must implement."""

    def save(self, family_id: uuid.UUID, key: str, data: IO[bytes]) -> None:
        """Persist *data* under *key* within the family's namespace."""
        ...

    def open(self, family_id: uuid.UUID, key: str) -> Path:
        """Return a local file path suitable for streaming to a client."""
        ...

    def delete(self, family_id: uuid.UUID, key: str) -> None:
        """Remove the file. No error if it does not exist."""
        ...

    def exists(self, family_id: uuid.UUID, key: str) -> bool:
        ...


class LocalStorage:
    """Stores files under MEDIA_ROOT/<family_id>/..."""

    def __init__(self, root: str | None = None) -> None:
        self._root = Path(root or get_settings().media_root)

    def _path(self, family_id: uuid.UUID, key: str) -> Path:
        return self._root / str(family_id) / key

    def save(self, family_id: uuid.UUID, key: str, data: IO[bytes]) -> None:
        dest = self._path(family_id, key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            shutil.copyfileobj(data, f)

    def open(self, family_id: uuid.UUID, key: str) -> Path:
        p = self._path(family_id, key)
        if not p.exists():
            raise FileNotFoundError(f"Media file not found: {key}")
        return p

    def delete(self, family_id: uuid.UUID, key: str) -> None:
        p = self._path(family_id, key)
        if p.exists():
            p.unlink()

    def exists(self, family_id: uuid.UUID, key: str) -> bool:
        return self._path(family_id, key).exists()


def get_storage() -> LocalStorage:
    """Factory — returns the configured storage provider."""
    provider = get_settings().storage_provider.lower().strip()
    if provider != "local":
        raise ValueError(
            f"Unsupported STORAGE_PROVIDER '{provider}'. "
            "Only 'local' is supported in this phase."
        )
    return LocalStorage()
