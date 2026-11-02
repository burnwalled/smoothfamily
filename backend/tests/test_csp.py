"""2.9.0: the browser's Content-Security-Policy reports – accepted without signing in, logged
briefly and limited per address."""
import logging

import pytest

pytestmark = pytest.mark.asyncio


async def test_reports_are_logged_without_query_strings_and_limited(client, caplog):
    from app.routers import csp

    csp._recent.clear()
    report = {"csp-report": {"document-uri": "https://family.example/vault?token=secret", "violated-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?a=1"}}
    with caplog.at_level(logging.WARNING, logger="csp"):
        for _ in range(25):
            assert (await client.post("/api/csp-report", json=report)).status_code == 204
    lines = [r.getMessage() for r in caplog.records if r.name == "csp"]
    assert len(lines) == csp.PER_MINUTE
    assert "script-src-elem" in lines[0] and "https://evil.example/x.js" in lines[0] and "secret" not in lines[0]
    assert (await client.post("/api/csp-report", content=b"not json", headers={"content-type": "application/csp-report"})).status_code == 204
