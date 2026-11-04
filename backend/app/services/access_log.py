"""The access log without the keys: links for guests, kiosks, shares, invitations and parties carry their
secret in the address, and the log is read by whoever can read the server's logs – so the secret is
masked before the line is written."""
import logging
import re

# Paths whose next segment is a secret.
_PATH = re.compile(r"^(/api/(?:kiosk|guest|wishes|share|invite|coparent/invite|party|party-portal|party-help)/)[^/?]+")
_QUERY = re.compile(r"([?&](?:key|wish_key|token)=)[^&]+")


def mask(path: str) -> str:
    return _QUERY.sub(r"\1…", _PATH.sub(r"\1…", path))


class MaskSecrets(logging.Filter):
    """uvicorn's access record: args = (client, method, path, http version, status)."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            record.args = (*args[:2], mask(args[2]), *args[3:])
        return True


def install() -> None:
    logging.getLogger("uvicorn.access").addFilter(MaskSecrets())
