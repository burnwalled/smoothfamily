"""Brute-force protection for the login endpoint.

Failed attempts are counted per username and per client IP inside a sliding
window; once a limit is hit, further attempts are refused (HTTP 429) until the
window has passed. Kept in process memory: the API runs as a single uvicorn
worker, and losing the counters on restart is harmless.
"""
import time
from collections import defaultdict, deque

from fastapi import Request

WINDOW_SECONDS = 15 * 60
MAX_FAILURES_PER_USER = 8
MAX_FAILURES_PER_IP = 25
# From outside the countries sign-ins are allowed from (3.4.1): fewer tries, and they count longer.
STRICT_WINDOW_SECONDS = 60 * 60
STRICT_FAILURES_PER_USER = 3
STRICT_FAILURES_PER_IP = 10

_failures: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    # Behind Caddy -> Next.js the left-most X-Forwarded-For entry is the real
    # client (Caddy overwrites whatever an untrusted client sends).
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _recent(key: str, now: float, window: int = WINDOW_SECONDS) -> deque[float]:
    attempts = _failures[key]
    # The longest window keeps the attempts; a shorter one just looks at the recent ones.
    while attempts and attempts[0] <= now - STRICT_WINDOW_SECONDS:
        attempts.popleft()
    since = now - window
    return deque(t for t in attempts if t > since)


def _wait(attempts: deque[float], limit: int, window: int, now: float) -> int:
    if len(attempts) >= limit:
        return int(attempts[0] + window - now) + 1
    return 0


def retry_after(username: str, ip: str, strict: bool = False) -> int:
    """Seconds until a new attempt is allowed (0 = allowed now). Strict: from outside the allowed
    countries – three tries per name, ten per address, counted over an hour."""
    now = time.monotonic()
    window = STRICT_WINDOW_SECONDS if strict else WINDOW_SECONDS
    per_user = STRICT_FAILURES_PER_USER if strict else MAX_FAILURES_PER_USER
    per_ip = STRICT_FAILURES_PER_IP if strict else MAX_FAILURES_PER_IP
    waits = [_wait(_recent(f"user:{username}", now, window), per_user, window, now), _wait(_recent(f"ip:{ip}", now, window), per_ip, window, now)]
    return max(waits)


def ip_retry_after(ip: str, strict: bool = False) -> int:
    """Like retry_after, for attempts that aren't tied to a username (passkeys, links)."""
    now = time.monotonic()
    window = STRICT_WINDOW_SECONDS if strict else WINDOW_SECONDS
    return _wait(_recent(f"ip:{ip}", now, window), STRICT_FAILURES_PER_IP if strict else MAX_FAILURES_PER_IP, window, now)


def record_ip_failure(ip: str) -> None:
    _failures[f"ip:{ip}"].append(time.monotonic())


def record_failure(username: str, ip: str) -> None:
    now = time.monotonic()
    _failures[f"user:{username}"].append(now)
    _failures[f"ip:{ip}"].append(now)


def record_success(username: str) -> None:
    _failures.pop(f"user:{username}", None)


def reset() -> None:
    _failures.clear()
