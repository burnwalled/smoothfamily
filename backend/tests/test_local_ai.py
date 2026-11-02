"""Local AI: settings only at home, the queue that waits for the computer, review before use,
hosted families' opt-in, Wake-on-LAN and the sleep helper. Ollama itself is faked here."""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


class FakeOllama:
    def __init__(self):
        self.online = False
        self.calls: list[dict] = []
        self.answers: dict[str, dict] = {}
        self.woken: list[str] = []

    async def version(self, url):
        return "0.30.7" if self.online else None

    async def models(self, url):
        return [{"name": "gpt-oss:20b", "size": 1}, {"name": "qwen3-vl:8b", "size": 1}]

    async def chat(self, url, model, prompt, schema, images=None):
        self.calls.append({"model": model, "prompt": prompt, "images": len(images or [])})
        if schema is self.lines_schema:
            return {"store": "ICA", "lines": ["ARLA MJÖLK 3% 1L 16,95", "PANT 2,00"]}
        kind = next(k for k, v in self.schemas.items() if v is schema)
        return self.answers[kind]

    def wol(self, mac, broadcast="255.255.255.255"):
        self.woken.append(mac)

    def patches(self):
        from app.services import ai

        self.schemas = ai.SCHEMAS
        self.lines_schema = ai.LINES_SCHEMA
        return [
            patch("app.services.ai.version", self.version),
            patch("app.services.ai.models", self.models),
            patch("app.services.ai.chat", self.chat),
            patch("app.services.ai.wake_on_lan", self.wol),
        ]


@pytest.fixture
def ollama(tmp_path, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "media_root", str(tmp_path))
    fake = FakeOllama()
    patches = fake.patches()
    for p in patches:
        p.start()
    yield fake
    for p in patches:
        p.stop()


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )


async def _configure(client, **extra):
    body = {"url": "http://192.168.1.20:11434", "text_model": "gpt-oss:20b", "vision_model": "qwen3-vl:8b", "poll_minutes": 5, **extra}
    resp = await client.put("/api/server/ai", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_settings_only_at_home(client, ollama):
    await _setup(client)
    assert (await client.get("/api/ai/status")).json()["available"] is False
    assert (await client.post("/api/ai/jobs", json={"kind": "quick_add", "text": "milk"})).status_code == 409
    for url in ("https://api.openai.com", "http://8.8.8.8:11434", "ftp://192.168.1.20"):
        assert (await client.put("/api/server/ai", json={"url": url, "text_model": "x"})).status_code == 422, url
    cfg = await _configure(client)
    assert cfg["helper_key"] and cfg["url"] == "http://192.168.1.20:11434"
    ollama.online = True
    found = (await client.post("/api/server/ai/test", json={"url": "http://ai-pc.local:11434"})).json()
    assert [m["name"] for m in found["models"]] == ["gpt-oss:20b", "qwen3-vl:8b"]
    assert (await client.get("/api/ai/status")).json()["available"] is True


async def test_queue_waits_for_the_computer(client, db_session, ollama):
    from app.services import ai

    await _setup(client)
    await _configure(client, wol_enabled=True, wol_mac="3C:7C:3F:12:34:56")
    shop = (await client.post("/api/lists", json={"name": "Shopping"})).json()
    job = (await client.post("/api/ai/jobs", json={"kind": "quick_add", "text": "mjölk, 2 paket smör och bröd", "list_id": shop["id"]})).json()
    assert job["status"] == "queued" and job["position"] == 1

    # The computer is off: woken once (not every tick), and the job waits.
    now = datetime.now(timezone.utc)
    assert await ai.tick(db_session, now) == 0
    assert await ai.tick(db_session, now + timedelta(minutes=1)) == 0
    assert ollama.woken == ["3C:7C:3F:12:34:56"]
    assert (await client.get(f"/api/ai/jobs/{job['id']}")).json()["status"] == "queued"

    # It is on: the job runs, the member is told, and nothing is added until they say so.
    ollama.online = True
    ollama.answers["quick_add"] = {"items": [{"name": "Mjölk", "category": "dairy"}, {"name": "2 paket smör", "category": "dairy"}, {"name": "Bröd", "category": "bread"}]}
    assert await ai.tick(db_session, now + timedelta(minutes=2)) == 1
    done = (await client.get(f"/api/ai/jobs/{job['id']}")).json()
    assert done["status"] == "done" and len(done["result"]["items"]) == 3
    assert ollama.calls[0]["model"] == "gpt-oss:20b" and "mjölk" in ollama.calls[0]["prompt"]
    [note] = (await client.get("/api/notifications")).json()
    assert note["kind"] == "ai" and note["body"] == "3 items ready for the list"
    assert (await client.get(f"/api/lists/{shop['id']}/items")).json() == []

    # Looked at and changed: one dropped.
    kept = [{"name": "Mjölk", "category": "dairy"}, {"name": "Smör", "category": "dairy"}]
    await client.post(f"/api/ai/jobs/{job['id']}/apply/list", json={"list_id": shop["id"], "items": kept})
    assert [i["name"] for i in (await client.get(f"/api/lists/{shop['id']}/items")).json()] == ["Mjölk", "Smör"]
    assert (await client.post(f"/api/ai/jobs/{job['id']}/apply/list", json={"list_id": shop["id"], "items": kept})).status_code == 409


async def test_receipt_into_the_pantry(client, db_session, tmp_path, ollama):
    from app.services import ai

    await _setup(client)
    await _configure(client)
    job = (await client.post("/api/ai/jobs/upload?kind=receipt", files={"file": ("kvitto.jpg", b"\xff\xd8fake-jpeg", "image/jpeg")})).json()
    assert list(tmp_path.rglob("*.img"))
    ollama.online = True
    ollama.answers["receipt"] = {"store": "ICA", "items": [{"name": "Mjölk", "amount": 1, "unit": "l", "place": "fridge", "keeps_days": 7, "food": True}, {"name": "Pant", "place": "pantry", "food": False}]}
    await ai.tick(db_session)
    # The picture model reads the lines, the text model sorts them out.
    assert [(c["model"], c["images"]) for c in ollama.calls] == [("qwen3-vl:8b", 1), ("gpt-oss:20b", 0)]
    assert "ARLA MJÖLK" in ollama.calls[1]["prompt"]
    assert not list(tmp_path.rglob("*.img"))  # the picture is gone once read
    [note] = (await client.get("/api/notifications")).json()
    assert note["body"] == "The receipt is read – 1 items to look at"
    lines = [{"name": "Mjölk", "amount": 1, "unit": "l", "place": "fridge", "best_before": str((datetime.now().date() + timedelta(days=7)))}]
    await client.post(f"/api/ai/jobs/{job['id']}/apply/receipt", json={"items": lines})
    assert [(i["name"], i["place"]) for i in (await client.get("/api/pantry")).json()] == [("Mjölk", "fridge")]


async def test_failure_expiry_cancel(client, db_session, ollama):
    from app.services import ai

    await _setup(client)
    await _configure(client, keep_days=2)
    failing = (await client.post("/api/ai/jobs", json={"kind": "recipe", "text": "Pannkakor: mjöl, mjölk, ägg"})).json()
    ollama.online = True

    async def broken(*a, **k):
        raise ai.AiError("The AI's answer wasn't valid JSON")

    with patch("app.services.ai.chat", broken):
        await ai.tick(db_session)
    job = (await client.get(f"/api/ai/jobs/{failing['id']}")).json()
    assert job["status"] == "failed" and "JSON" in job["error"]
    assert (await client.delete(f"/api/ai/jobs/{failing['id']}")).json()["status"] == "dismissed"

    ollama.online = False
    old = (await client.post("/api/ai/jobs", json={"kind": "cook_ideas"})).json()
    assert await ai.expire_old(db_session, await ai.config(db_session), datetime.now(timezone.utc) + timedelta(days=3)) == 1
    assert (await client.get(f"/api/ai/jobs/{old['id']}")).json()["status"] == "expired"
    waiting = (await client.post("/api/ai/jobs", json={"kind": "cook_ideas"})).json()
    assert (await client.delete(f"/api/ai/jobs/{waiting['id']}")).json()["status"] == "cancelled"


async def test_hosted_family_must_opt_in(client, db_session, ollama):
    from app.main import app
    from app.services import ai

    await _setup(client)
    await _configure(client)
    invite = (await client.post("/api/server/invitations", json={"label": "Guests", "days": 7})).json()
    guest = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    await guest.post(
        f"/api/invite/{invite['url'].rsplit('/', 1)[1]}/family",
        json={"family_name": "Other", "display_name": "Olle", "username": "olle", "password": "guestpass1", "email": "o@example.com"},
    )
    assert (await guest.get("/api/ai/family")).json() == {"enabled": False, "allowed": False, "hosted": True}
    assert (await guest.get("/api/ai/status")).json()["available"] is False
    await _configure(client, allow_hosted=True)
    assert (await guest.get("/api/ai/family")).json()["allowed"] is True
    assert (await guest.get("/api/ai/status")).json()["available"] is False  # still their own choice
    await guest.put("/api/ai/family", json={"enabled": True})
    status = (await guest.get("/api/ai/status")).json()
    assert status["available"] is True and status["hosted"] is True
    # The server admin sees how much waits, never what.
    await guest.post("/api/ai/jobs", json={"kind": "quick_add", "text": "secret shopping"})
    cfg = (await client.get("/api/server/ai")).json()
    assert cfg["queue"] == {"queued": 1} and "secret" not in str(cfg)
    assert (await client.get("/api/ai/jobs")).json() == []  # nor in their own list
    await guest.aclose()


async def test_sleep_helper(client, db_session, ollama):
    from app.services import ai

    await _setup(client)
    cfg = await _configure(client, wol_enabled=True, wol_mac="3C:7C:3F:12:34:56")
    assert (await client.get("/api/ai/helper?key=wrong")).status_code == 404
    key = cfg["helper_key"]
    assert (await client.get(f"/api/ai/helper?key={key}")).json()["woken_by_server"] is False
    await client.post("/api/server/ai/wake")
    assert ollama.woken
    await client.post("/api/ai/jobs", json={"kind": "cook_ideas"})
    st = (await client.get(f"/api/ai/helper?key={key}")).json()
    assert st == {**st, "busy": True, "woken_by_server": True}
    ollama.online = True
    ollama.answers["cook_ideas"] = {"ideas": [{"title": "Pasta", "uses": ["Grädde"], "recipe": None, "why": "Grädden går ut"}]}
    await ai.tick(db_session)
    assert (await client.get(f"/api/ai/helper?key={key}")).json()["busy"] is False
    await client.post(f"/api/ai/helper/slept?key={key}")
    assert (await client.get(f"/api/ai/helper?key={key}")).json()["woken_by_server"] is False


async def test_week_of_dinners_and_chores_by_the_local_ai(client, db_session, ollama):
    from app.services import ai

    await _setup(client)
    await _configure(client)
    ollama.online = True
    # The copy-the-prompt way stays.
    assert (await client.get("/api/meals/prompt?week_start=2026-11-02")).status_code == 200
    assert (await client.post("/api/ai/jobs", json={"kind": "meal_plan"})).status_code == 422
    job = (await client.post("/api/ai/jobs", json={"kind": "meal_plan", "week_start": "2026-11-04", "servings": 3, "preferences": "no fish"})).json()
    assert job["input"]["week_start"] == "2026-11-02"
    ollama.answers["meal_plan"] = {
        "meals": [
            {"weekday": d, "name": f"Dinner {d}", "servings": 3, "ingredients": [{"name": "pasta", "amount": 400, "unit": "g", "category": "pantry"}], "steps": ["Cook it."]}
            for d in range(7)
        ]
    }
    assert await ai.tick(db_session, datetime.now(timezone.utc)) == 1
    assert "no fish" in ollama.calls[-1]["prompt"]
    done = (await client.post(f"/api/ai/jobs/{job['id']}/apply/meal_plan", json={"weekdays": [0, 2, 4]})).json()
    assert done == {"week_start": "2026-11-02", "meals": 3}
    plan = (await client.get("/api/meals/plan?week_start=2026-11-02")).json()
    assert sorted(m["name"] for m in plan["meals"]) == ["Dinner 0", "Dinner 2", "Dinner 4"]

    chores = (await client.post("/api/ai/jobs", json={"kind": "chores"})).json()
    ollama.answers["chores"] = {"chores": [{"title": "Vacuum", "points": 10, "recurrence": "weekly", "weekday": 5}, {"title": "Water the plants", "points": 5, "recurrence": "weekly", "weekday": 2}]}
    assert await ai.tick(db_session, datetime.now(timezone.utc)) == 1
    made = (await client.post(f"/api/ai/jobs/{chores['id']}/apply/chores", json={"keep": [1]})).json()
    assert made["imported"] == 1
    assert [t["title"] for t in (await client.get("/api/tasks")).json()] == ["Water the plants"]


async def test_a_question_answered_from_the_web(client, db_session, ollama, monkeypatch):
    """2.8.4: only the question's words go to the server's own web search; the AI answers from the hits."""
    from app.services import ai, recipe_search

    await _setup(client)
    await _configure(client)
    sent: list[str] = []

    async def fake_search(base_url, words, language="en", recipe=True):
        sent.append(words)
        return [recipe_search.Hit(title="Däcktryck Volvo V70", url="https://example.se/v70", site="example.se", snippet="2,3 bar fram")]

    monkeypatch.setattr(recipe_search, "search", fake_search)
    ask = {"kind": "web_question", "text": "Vilket däcktryck har en Volvo V70 2012?"}
    assert (await client.post("/api/ai/jobs", json=ask)).status_code == 409  # search is off
    await recipe_search.set_url(db_session, "http://searxng:8080")
    job = (await client.post("/api/ai/jobs", json=ask)).json()
    assert sent == ["Vilket däcktryck har en Volvo V70 2012?"] and job["input"]["sources"][0]["url"] == "https://example.se/v70"

    ollama.online = True
    ollama.answers["web_question"] = {"answer": "2,3 bar fram [1]", "sources": [1]}
    assert await ai.tick(db_session) == 1
    assert "2,3 bar fram" in ollama.calls[-1]["prompt"]
    assert (await client.get(f"/api/ai/jobs/{job['id']}")).json()["result"]["answer"] == "2,3 bar fram [1]"


async def test_the_ai_reads_a_receipt_in_the_vault(client, db_session, ollama):
    """2.8.4: a receipt kept in the vault is read (store, total, date, category); its photo stays."""
    import io

    from PIL import Image

    from app.services import ai

    await _setup(client)
    await _configure(client)
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (255, 255, 255)).save(buf, "PNG")
    photo = (await client.post("/api/vault/receipts", files={"file": ("r.png", buf.getvalue(), "image/png")})).json()
    receipt = (await client.post("/api/receipts", json={"media_id": photo["id"]})).json()["receipt"]
    assert (await client.post("/api/ai/jobs", json={"kind": "receipt_info"})).status_code == 422
    job = (await client.post("/api/ai/jobs", json={"kind": "receipt_info", "receipt_id": receipt["id"]})).json()

    ollama.online = True
    ollama.answers["receipt_info"] = {"store": "ICA Kvantum", "total": 312.5, "currency": "SEK", "purchased_on": "2026-10-29", "category": "food"}
    assert await ai.tick(db_session) == 1
    done = (await client.get(f"/api/ai/jobs/{job['id']}")).json()
    assert done["status"] == "done" and done["result"]["store"] == "ICA Kvantum"
    assert done["input"]["lines"] == ["ARLA MJÖLK 3% 1L 16,95", "PANT 2,00"]
    assert (await client.get(f"/api/media/{photo['id']}/thumb")).status_code == 200



async def test_the_ai_writes_a_complaint_from_a_receipt(client, db_session, ollama):
    from app.services import ai

    await _setup(client)
    await _configure(client)
    receipt = (await client.post("/api/receipts", json={"store": "Elgiganten", "amount": 4990, "purchased_on": "2026-09-01", "category": "electronics", "note": "Diskmaskin"})).json()["receipt"]
    assert (await client.post("/api/ai/jobs", json={"kind": "complaint_letter", "receipt_id": receipt["id"], "text": ""})).status_code == 422
    job = (await client.post("/api/ai/jobs", json={"kind": "complaint_letter", "receipt_id": receipt["id"], "text": "Den läcker vatten efter två veckor"})).json()
    ollama.online = True
    ollama.answers["complaint_letter"] = {"subject": "Reklamation diskmaskin", "body": "Hej ..."}
    assert await ai.tick(db_session) == 1
    prompt = ollama.calls[-1]["prompt"]
    assert "Elgiganten" in prompt and "Diskmaskin" in prompt and "läcker" in prompt
    assert (await client.get(f"/api/ai/jobs/{job['id']}")).json()["result"]["subject"] == "Reklamation diskmaskin"
