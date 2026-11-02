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

_failures: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    # Behind Caddy -> Next.js the left-most X-Forwarded-For entry is the real
    # client (Caddy overwrites whatever an untrusted client sends).
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _recent(key: str, now: float) -> deque[float]:
    attempts = _failures[key]
    while attempts and attempts[0] <= now - WINDOW_SECONDS:
        attempts.popleft()
    return attempts


def retry_after(username: str, ip: str) -> int:
    """Seconds until a new attempt is allowed (0 = allowed now)."""
    now = time.monotonic()
    waits = []
    for key, limit in ((f"user:{username}", MAX_FAILURES_PER_USER), (f"ip:{ip}", MAX_FAILURES_PER_IP)):
        attempts = _recent(key, now)
        if len(attempts) >= limit:
            waits.append(int(attempts[0] + WINDOW_SECONDS - now) + 1)
    return max(waits, default=0)


def ip_retry_after(ip: str) -> int:
    """Like retry_after, for attempts that aren't tied to a username (passkeys)."""
    now = time.monotonic()
    attempts = _recent(f"ip:{ip}", now)
    if len(attempts) >= MAX_FAILURES_PER_IP:
        return int(attempts[0] + WINDOW_SECONDS - now) + 1
    return 0


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
