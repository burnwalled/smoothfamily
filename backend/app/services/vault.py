"""The family's document key: numbers and files in the document vault are encrypted with it.

Each family has its own random key (Fernet), stored encrypted with the server's key. A stolen copy
of the media folder or a database dump alone can't be read. A family move carries the key in the
passphrase-protected move file and encrypts it again with the new server's key.
"""
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Family
from app.services.crypto import decrypt_token, encrypt_token


async def family_fernet(db: AsyncSession, family: Family) -> Fernet:
    if not family.vault_key_encrypted:
        family.vault_key_encrypted = encrypt_token(Fernet.generate_key().decode())
        await db.flush()
    return Fernet(decrypt_token(family.vault_key_encrypted).encode())


def plain_key(family_row: dict) -> str | None:
    """For the move file: the family's key in plain text (the file itself is encrypted)."""
    value = family_row.get("vault_key_encrypted")
    return decrypt_token(value) if value else None


def sealed_key(plain: str | None) -> str | None:
    """After a move: the key encrypted with this server's key."""
    return encrypt_token(plain) if plain else None
