"""2.9.0: backups sealed with a key made in the browser – the server can write them, never read them.
The server's backups carry its secrets inside the seal; a family can seal its own with its own key."""
import gzip
import io
import tarfile

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

from app.services import backup_crypto

pytestmark = pytest.mark.asyncio


def _keys() -> tuple[bytes, str, str]:
    """A key pair as the browser makes it: private bytes, its text and the public half (base64)."""
    import base64

    priv = X25519PrivateKey.generate().private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    return priv, backup_crypto.private_key_to_text(priv), base64.b64encode(backup_crypto.public_from_private(priv)).decode()


def test_the_key_text_catches_typos_and_the_seal_catches_damage():
    priv, text, _ = _keys()
    assert backup_crypto.private_key_from_text(text.lower().replace("-", " ")) == priv
    with pytest.raises(backup_crypto.BackupKeyError):
        backup_crypto.private_key_from_text(text[:-1] + ("Q" if text[-1] != "Q" else "R"))
    pub = backup_crypto.public_from_private(priv)
    sealed = backup_crypto.seal_bytes(b"x" * (backup_crypto.CHUNK + 10), pub)
    assert backup_crypto.unseal_bytes(sealed, priv) == b"x" * (backup_crypto.CHUNK + 10)
    for broken in (sealed[:-1], sealed[:60] + bytes([sealed[60] ^ 1]) + sealed[61:], sealed + b"!"):
        with pytest.raises(backup_crypto.BackupKeyError):
            backup_crypto.unseal_bytes(broken, priv)
    other, _, _ = _keys()
    with pytest.raises(backup_crypto.BackupKeyError, match="another key"):
        backup_crypto.unseal_bytes(sealed, other)


async def test_server_backups_are_sealed_with_the_secrets_inside(client, db_session, tmp_path, monkeypatch):
    from app.config import get_settings
    from app.services import backups

    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path / "backup"))
    media = tmp_path / "media"
    (media / "fam").mkdir(parents=True)
    (media / "fam" / "photo.jpg").write_bytes(b"jpeg")
    monkeypatch.setattr(get_settings(), "media_root", str(media))

    async def fake_dump(dest, key=None):
        sink, raw = backups._sink(dest, key)
        with gzip.GzipFile(fileobj=sink, mode="wb") as out:
            out.write(b"-- PostgreSQL database dump\n")
        sink.close()
        raw.close()

    monkeypatch.setattr(backups, "_dump_database", fake_dump)
    monkeypatch.setattr(backups, "available", lambda: True)
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"})

    priv, text, pub = _keys()
    assert (await client.put("/api/admin/backups/key", json={"public_key": "not a key"})).status_code == 422
    out = (await client.put("/api/admin/backups/key", json={"public_key": pub})).json()
    assert out["key_id"] == backup_crypto.key_id(backup_crypto.public_from_private(priv)).hex()

    made = await backups.create_backup(await backups.get_key(db_session))
    assert made.encrypted and made.database.endswith(".sfenc") and made.secrets
    folder = tmp_path / "backup"
    # Nothing readable lies in the folder.
    for f in folder.iterdir():
        assert f.read_bytes().startswith(b"SFENC1"), f.name
    key = backup_crypto.private_key_from_text(text)
    assert gzip.decompress(backup_crypto.unseal_bytes((folder / made.database).read_bytes(), key)).startswith(b"-- PostgreSQL")
    with tarfile.open(fileobj=io.BytesIO(backup_crypto.unseal_bytes((folder / made.media).read_bytes(), key)), mode="r:gz") as tar:
        assert "fam/photo.jpg" in tar.getnames()
    secrets = backup_crypto.unseal_bytes((folder / made.secrets).read_bytes(), key).decode()
    assert f"SECRET_KEY={get_settings().secret_key}" in secrets

    listed = (await client.get("/api/admin/backups")).json()
    assert listed["backups"][0]["encrypted"] and listed["key_id"]
    download = await client.get(f"/api/admin/backups/files/{made.secrets}")
    assert download.status_code == 200 and download.content.startswith(b"SFENC1")
    backups.delete_backup(made.stamp)
    assert list(folder.iterdir()) == []


async def test_a_family_seals_its_backups_with_its_own_key(client, db_session, tmp_path, monkeypatch):
    from app.config import get_settings
    from app.services import family_backups

    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path / "backup"))
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"})
    me = (await client.get("/api/auth/me")).json()
    family_id = __import__("uuid").UUID(me["family_id"])
    priv, text, pub = _keys()
    assert (await client.get("/api/family/backup-key")).json() == {"key_id": None, "latest_sealed": None}
    assert (await client.put("/api/family/backup-key", json={"public_key": pub})).json()["key_id"]

    made = await family_backups.create(db_session, family_id)
    assert made.sealed
    latest = await client.get("/api/family/backup-key/latest")
    assert latest.status_code == 200 and latest.content.startswith(b"SFENC1")
    # The server can't open it without the family's key.
    blob = backup_crypto.unseal_bytes(latest.content, backup_crypto.private_key_from_text(text))
    assert blob and not blob.startswith(b"SFENC1")
    with pytest.raises(Exception, match="family's own key"):
        await family_backups.restore(db_session, family_id, made.stamp)
