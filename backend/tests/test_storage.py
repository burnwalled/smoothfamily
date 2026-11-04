"""Files stay in the family's own folder, whatever the key says."""

import io
import uuid

import pytest

from app.services.storage import LocalStorage


def test_a_key_stays_in_the_family_folder(tmp_path):
    storage = LocalStorage(str(tmp_path))
    family, other = uuid.uuid4(), uuid.uuid4()
    storage.save(family, "albums/a/b.jpg", io.BytesIO(b"mine"))
    assert storage.open(family, "albums/a/b.jpg").read_bytes() == b"mine"
    assert storage.exists(family, "albums/a/b.jpg")
    storage.save(other, "secret.jpg", io.BytesIO(b"theirs"))
    (tmp_path / "outside.txt").write_bytes(b"server")

    for key in ("../outside.txt", f"../{other}/secret.jpg", "a/../../outside.txt", str(tmp_path / "outside.txt"), "", "."):
        with pytest.raises(ValueError):
            storage.exists(family, key)
        with pytest.raises(ValueError):
            storage.delete(family, key)
        with pytest.raises(ValueError):
            storage.save(family, key, io.BytesIO(b"x"))
    assert (tmp_path / "outside.txt").read_bytes() == b"server"
    assert storage.open(other, "secret.jpg").read_bytes() == b"theirs"

    # Inside the folder, a detour is still the same file.
    assert storage.open(family, "albums/../albums/a/b.jpg").read_bytes() == b"mine"
    storage.delete(family, "albums/a/b.jpg")
    assert not storage.exists(family, "albums/a/b.jpg")
