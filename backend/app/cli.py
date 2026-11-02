"""Server-side commands. Run inside the backend container:

    docker compose exec backend python -m app.cli reset-mfa <username>
    docker compose exec backend python -m app.cli reset-password <username> <new-password>
    docker compose exec backend python -m app.cli backup
    docker compose exec backend python -m app.cli check
    docker compose exec -it backend python -m app.cli unseal <file> <out-file>

backup makes a backup like the app's schedule (sealed with the backup key when there is one) and
removes the old ones; backup.sh runs it. unseal opens a sealed backup file with the private key
("SFKEY-…"), asked for so it never lands in the shell's history (or from SF_BACKUP_KEY).

(`docker-compose` instead of `docker compose` on Synology DSM 6.)
"""
import asyncio
import sys

from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models import User, WebAuthnCredential
from app.security import hash_password


async def _reset_mfa(username: str) -> None:
    async with SessionLocal() as db:
        user = (await db.execute(select(User).where(User.username == username.lower()))).scalar_one_or_none()
        if user is None:
            sys.exit(f"No user named {username!r}")
        user.totp_secret_encrypted = None
        user.totp_pending_encrypted = None
        user.totp_last_step = None
        await db.execute(delete(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
        await db.commit()
        print(f"Removed authenticator and passkeys for {user.username}.")


async def _reset_password(username: str, password: str) -> None:
    if len(password) < 4:
        sys.exit("Password must be at least 4 characters")
    async with SessionLocal() as db:
        user = (await db.execute(select(User).where(User.username == username.lower()))).scalar_one_or_none()
        if user is None:
            sys.exit(f"No user named {username!r}")
        user.password_hash = hash_password(password)
        await db.commit()
        print(f"Password changed for {user.username}.")


async def _backup() -> None:
    from app.services import backups

    async with SessionLocal() as db:
        key = await backups.get_key(db)
        schedule = await backups.get_schedule(db)
    made = await backups.create_backup(key)
    removed = backups.prune(schedule["keep_days"])
    print(f"Backup {made.stamp} made{' and sealed' if key else ''}; {removed} old removed.")
    if not key:
        print("WARNING: the backup is NOT encrypted. Make a backup key in Server settings → Backups and moving.")


def _unseal(src: str, dst: str) -> None:
    import getpass
    import os

    from app.services import backup_crypto

    text = os.environ.get("SF_BACKUP_KEY") or getpass.getpass("Backup key (SFKEY-…): ")
    try:
        key = backup_crypto.private_key_from_text(text)
        with open(src, "rb") as fin, open(dst, "wb") as fout:
            backup_crypto.unseal_stream(fin, fout, key)
    except backup_crypto.BackupKeyError as exc:
        os.remove(dst) if os.path.exists(dst) else None
        sys.exit(str(exc))
    print(f"Opened {src} → {dst}")


async def _check() -> None:
    """For update.sh: the backend reaches the database (exit 1 if not)."""
    from sqlalchemy import text

    try:
        async with SessionLocal() as db:
            await db.execute(text("SELECT 1"))
    except Exception as exc:
        sys.exit(f"The database doesn't answer: {exc.__class__.__name__}")
    print("ok")


def main(argv: list[str]) -> None:
    if len(argv) == 2 and argv[0] == "reset-mfa":
        asyncio.run(_reset_mfa(argv[1]))
    elif len(argv) == 3 and argv[0] == "reset-password":
        asyncio.run(_reset_password(argv[1], argv[2]))
    elif argv == ["backup"]:
        asyncio.run(_backup())
    elif argv == ["check"]:
        asyncio.run(_check())
    elif len(argv) == 3 and argv[0] == "unseal":
        _unseal(argv[1], argv[2])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
