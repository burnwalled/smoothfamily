"""Reports from the browser when the Content-Security-Policy stopped – or, in report mode, would have
stopped – something (2.9.0). Logged briefly, without query strings; never stored."""
import logging
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

from fastapi import APIRouter, Request, Response

from app.services import login_throttle

router = APIRouter(prefix="/api", tags=["csp"])
log = logging.getLogger("csp")
_recent: dict[str, deque] = defaultdict(deque)
PER_MINUTE = 20


def _short(url: str) -> str:
    parts = urlparse(url or "")
    return f"{parts.scheme}://{parts.netloc}{parts.path}" if parts.scheme else (url or "")[:40]


@router.post("/csp-report", status_code=204)
async def csp_report(request: Request) -> Response:
    ip = login_throttle.client_ip(request)
    now = time.monotonic()
    seen = _recent[ip]
    while seen and now - seen[0] > 60:
        seen.popleft()
    if len(seen) < PER_MINUTE:
        seen.append(now)
        try:
            body = await request.json()
        except Exception:
            body = {}
        report = body.get("csp-report", body) if isinstance(body, dict) else {}
        log.warning(
            "CSP %s on %s: %s",
            report.get("violated-directive") or report.get("effective-directive"),
            _short(str(report.get("document-uri", ""))),
            _short(str(report.get("blocked-uri", ""))),
        )
    return Response(status_code=204)
