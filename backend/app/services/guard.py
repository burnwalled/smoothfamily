"""Two small guards on every request (3.4.1), with no database and no state.

Cross-site writes are refused: a browser sends `Origin` with every POST/PUT/PATCH/DELETE, and the
app's own pages are the only ones that may change anything – the session cookie is SameSite already;
this is the second lock on the same door. A request without `Origin` (the app's own tests, curl, a
kiosk's fetch from the same page) passes: the cookie wouldn't be sent cross-site anyway.

What the links give (guests, kiosks, shares, wishes, parties, co-parents, invitations) is marked
`no-store`, so that no cache between the browser and the server keeps a copy."""
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Pages whose answers must not be cached by anything on the way.
NO_STORE_PREFIXES = ("/api/guest/", "/api/kiosk/", "/api/wishes/", "/api/share/", "/api/party/", "/api/party-portal/", "/api/party-help/", "/api/coparent/", "/api/invite/")
# CSP reports come with the page's origin as the browser sees it; passkey ceremonies bind the browser's
# origin themselves (WebAuthn checks it against the relying party), so the guard leaves them be.
ORIGIN_EXEMPT = ("/api/csp-report", "/api/auth/passkeys/")


def _header(headers: list[tuple[bytes, bytes]], name: bytes) -> str:
    for key, value in headers:
        if key == name:
            return value.decode("latin-1")
    return ""


def allowed_origins(scope: Scope) -> set[str]:
    """Where the request's own pages live: as the proxy says, as the Host says, and as configured."""
    headers = scope.get("headers", [])
    proto = _header(headers, b"x-forwarded-proto").split(",")[0].strip() or scope.get("scheme", "http")
    out = set()
    for host in (_header(headers, b"x-forwarded-host").split(",")[0].strip(), _header(headers, b"host")):
        if host:
            out.add(f"{proto}://{host.lower()}")
            # Behind a proxy that didn't say its scheme, either is the app's own page.
            out.add(f"https://{host.lower()}")
    public = get_settings().public_url
    if public:
        parts = urlsplit(public)
        if parts.scheme and parts.netloc:
            out.add(f"{parts.scheme}://{parts.netloc.lower()}")
    return out


def cross_site_write(scope: Scope) -> bool:
    if scope.get("type") != "http" or scope.get("method") not in WRITE_METHODS:
        return False
    if scope.get("path", "").startswith(ORIGIN_EXEMPT):
        return False
    origin = _header(scope.get("headers", []), b"origin").strip().lower()
    if not origin:
        return False
    return origin not in allowed_origins(scope)


class RequestGuard:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        if cross_site_write(scope):
            body = b'{"detail":"Cross-site request refused"}'
            await send({"type": "http.response.start", "status": 403, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})
            return
        if not scope.get("path", "").startswith(NO_STORE_PREFIXES):
            await self.app(scope, receive, send)
            return

        async def send_no_store(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                if not any(k.lower() == b"cache-control" for k, _ in headers):
                    headers.append((b"cache-control", b"no-store, private"))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_no_store)
