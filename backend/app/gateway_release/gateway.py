"""Smooth Family gateway: lets the family's Smooth Family server reach the Home Assistant in another
home (the cabin, the summer house) without opening any port there.

It runs next to that Home Assistant – as a Home Assistant add-on, or on a small computer – and calls
the Smooth Family server over HTTPS, keeping a websocket open. The server can then ask for states and
for service calls; the Home Assistant token never leaves this home, and only the domains allowed
below are read or controlled. Locks and alarms are left out unless the owner adds them.

Pairing: a one-time code from Smooth Family → Family settings → Smart home → "Add a home through the
gateway". The gateway trades it for its own key, kept in the data folder.

Configuration – as an add-on in its options, otherwise as environment variables:
  server            https://family.example.com           (SF_SERVER)
  pairing_code      the code from Smooth Family, once      (SF_PAIRING_CODE)
  read_domains      what may be read                      (SF_READ_DOMAINS, comma separated)
  control_domains   what may be switched                  (SF_CONTROL_DOMAINS, comma separated)
  ha_url, ha_token  only outside Home Assistant           (HA_URL, HA_TOKEN)
  auto_update       fetch new versions from the server    (SF_AUTO_UPDATE, on unless "false")

Updates (1.2.0): the server hands out the newest gateway, signed on the family's own computer with a
key only it has. A new version runs only if its signature checks out against UPDATE_PUBLIC_KEY – so
even someone who took over the server can't run anything here. It's kept in the data folder; if it
doesn't connect within ten minutes, or keeps crashing, the version that came with the image is back.
"""
import asyncio
import base64
import hashlib
import json
import logging
import os
import pathlib
import re
import sys

import httpx
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

VERSION = "1.3.0"
# The public half of the key releases are signed with (scripts/sign-gateway.py).
UPDATE_PUBLIC_KEY = "eW2X+VZEiHw/Xpmdc4tWLkj0e3yDFWl0Y//ZQHoRK2U="
UPDATE_EVERY = 6 * 3600
# A new version that hasn't connected after this long, or has started this many times without
# connecting, is given up and the image's own version runs again.
UPDATE_GRACE = 600
UPDATE_TRIES = 3

READ_DOMAINS = ["light", "switch", "fan", "cover", "climate", "vacuum", "scene", "script", "media_player", "sensor", "binary_sensor", "weather", "person", "input_boolean", "todo"]
# todo: shopping lists sent from Smooth Family to Home Assistant's to-do lists (ICA, Coop …).
CONTROL_DOMAINS = ["light", "switch", "fan", "cover", "climate", "vacuum", "scene", "script", "media_player", "input_boolean", "todo"]
SERVICE = re.compile(r"^[a-z_]{1,50}$")
ENTITY = re.compile(r"^[a-z_]+\.[a-z0-9_]{1,200}$")

log = logging.getLogger("smooth-family-gateway")


def _list(value, default: list[str]) -> list[str]:
    if value is None or value == "":
        return list(default)
    items = value if isinstance(value, list) else str(value).split(",")
    return [str(i).strip().lower() for i in items if str(i).strip()]


def load_config(environ=os.environ, options_file: str = "/data/options.json") -> dict:
    options = {}
    path = pathlib.Path(options_file)
    if path.exists():
        options = json.loads(path.read_text(encoding="utf-8"))
    supervisor = environ.get("SUPERVISOR_TOKEN")
    cfg = {
        "server": str(options.get("server") or environ.get("SF_SERVER", "")).strip().rstrip("/"),
        "pairing_code": str(options.get("pairing_code") or environ.get("SF_PAIRING_CODE", "")).strip(),
        "read_domains": _list(options.get("read_domains") or environ.get("SF_READ_DOMAINS"), READ_DOMAINS),
        "control_domains": _list(options.get("control_domains") or environ.get("SF_CONTROL_DOMAINS"), CONTROL_DOMAINS),
        # Inside Home Assistant the Supervisor gives the add-on its own token.
        "ha_url": "http://supervisor/core" if supervisor else environ.get("HA_URL", "http://homeassistant.local:8123").rstrip("/"),
        "ha_token": supervisor or environ.get("HA_TOKEN", ""),
        "data_dir": environ.get("SF_DATA_DIR", "/data"),
        "allow_http": str(options.get("allow_http") or environ.get("SF_ALLOW_HTTP", "")).lower() in ("1", "true", "yes"),
        "auto_update": str(options.get("auto_update", environ.get("SF_AUTO_UPDATE", "true"))).lower() not in ("0", "false", "no", "off"),
        # Told to the server (1.3.0): the Home Assistant app, or a container of its own.
        "runs_in": "addon" if supervisor else "docker",
    }
    # What can be switched can also be read.
    cfg["read_domains"] = sorted(set(cfg["read_domains"]) | set(cfg["control_domains"]))
    return cfg


def refusal(msg: dict, cfg: dict) -> str | None:
    """Why the server's call is not allowed here – or None when it is."""
    op = msg.get("op")
    if op == "states":
        return None
    entity = str(msg.get("entity_id", ""))
    if not ENTITY.match(entity):
        return "Not an entity"
    domain = entity.split(".", 1)[0]
    if op == "state":
        return None if domain in cfg["read_domains"] else f"{domain} may not be read here"
    if op == "todo_items":
        return None if domain == "todo" and "todo" in cfg["read_domains"] else "todo may not be read here"
    if op == "call":
        if msg.get("domain") != domain or not SERVICE.match(str(msg.get("service", ""))):
            return "Not a valid call"
        return None if domain in cfg["control_domains"] else f"{domain} may not be controlled here"
    return "Unknown call"


async def answer(msg: dict, cfg: dict, ha: httpx.AsyncClient) -> dict:
    reason = refusal(msg, cfg)
    if reason:
        return {"id": msg.get("id"), "ok": False, "error": reason}
    try:
        if msg["op"] == "states":
            resp = await ha.get("/api/states")
            resp.raise_for_status()
            result = [s for s in resp.json() if s.get("entity_id", "").split(".", 1)[0] in cfg["read_domains"]]
        elif msg["op"] == "state":
            resp = await ha.get(f"/api/states/{msg['entity_id']}")
            resp.raise_for_status()
            result = resp.json()
        elif msg["op"] == "todo_items":
            resp = await ha.post("/api/services/todo/get_items?return_response", json={"entity_id": msg["entity_id"]})
            resp.raise_for_status()
            result = resp.json().get("service_response", {}).get(msg["entity_id"], {}).get("items", [])
        else:
            data = {k: v for k, v in dict(msg.get("data") or {}).items() if k not in ("entity_id", "device_id", "area_id")}
            resp = await ha.post(f"/api/services/{msg['domain']}/{msg['service']}", json={**data, "entity_id": msg["entity_id"]})
            resp.raise_for_status()
            result = None
    except httpx.HTTPError as exc:
        return {"id": msg.get("id"), "ok": False, "error": f"Home Assistant: {exc.__class__.__name__}"}
    return {"id": msg.get("id"), "ok": True, "result": result}


# --- Signed updates -----------------------------------------------------------------------------
# Ed25519 signature check after RFC 8032 (its reference code), so the gateway needs nothing more
# than Python itself to trust an update.
_P = 2**255 - 19
_Q = 2**252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)


def _add(a, b):
    x1, y1, z1, t1 = a
    x2, y2, z2, t2 = b
    e, f = (y1 - x1) * (y2 - x2) % _P, (y1 + x1) * (y2 + x2) % _P
    g, h = 2 * t1 * t2 * _D % _P, 2 * z1 * z2 % _P
    e, f, g, h = f - e, h - g, h + g, f + e
    return (e * f, g * h, f * g, e * h)


def _mul(s, point):
    out = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            out = _add(out, point)
        point = _add(point, point)
        s >>= 1
    return out


def _same(a, b):
    return (a[0] * b[2] - b[0] * a[2]) % _P == 0 and (a[1] * b[2] - b[1] * a[2]) % _P == 0


def _x(y, sign):
    if y >= _P:
        return None
    x2 = (y * y - 1) * pow(_D * y * y + 1, _P - 2, _P)
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P:
        x = x * _SQRT_M1 % _P
    if (x * x - x2) % _P:
        return None
    return _P - x if (x & 1) != sign else x


def _point(raw: bytes):
    y = int.from_bytes(raw, "little")
    sign, y = y >> 255, y & ((1 << 255) - 1)
    x = _x(y, sign)
    return None if x is None else (x, y, 1, x * y % _P)


_GY = 4 * pow(5, _P - 2, _P) % _P
_G = (_x(_GY, 0), _GY, 1, _x(_GY, 0) * _GY % _P)


def signature_ok(public: bytes, message: bytes, signature: bytes) -> bool:
    if len(public) != 32 or len(signature) != 64:
        return False
    a, r = _point(public), _point(signature[:32])
    s = int.from_bytes(signature[32:], "little")
    if a is None or r is None or s >= _Q:
        return False
    h = int.from_bytes(hashlib.sha512(signature[:32] + public + message).digest(), "little") % _Q
    return _same(_mul(s, _G), _add(r, _mul(h, a)))


def _newer(version: str, than: str) -> bool:
    def parts(v):
        return tuple(int(x) for x in re.findall(r"\d+", v)[:3])

    return parts(version) > parts(than)


def _code_version(code: bytes) -> str | None:
    m = re.search(rb'^VERSION = "([0-9.]+)"\r?$', code, re.M)
    return m.group(1).decode() if m else None


def verified(code: bytes, release: dict, public_key: str = UPDATE_PUBLIC_KEY) -> bool:
    """The file is the one the release names, and the release is signed with the family's key."""
    try:
        version, sha256 = str(release["version"]), str(release["sha256"])
        signature = base64.b64decode(release["signature"])
    except (KeyError, ValueError):
        return False
    message = f"smooth-family-gateway\n{version}\n{sha256}".encode()
    return (
        hashlib.sha256(code).hexdigest() == sha256
        and _code_version(code) == version
        and signature_ok(base64.b64decode(public_key), message, signature)
    )


def _updates(cfg: dict) -> pathlib.Path:
    return pathlib.Path(cfg["data_dir"]) / "update"


def _state(cfg: dict) -> dict:
    path = _updates(cfg) / "state.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save_state(cfg: dict, state: dict) -> None:
    folder = _updates(cfg)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "state.json").write_text(json.dumps(state), encoding="utf-8")


def _restart(path: pathlib.Path, bundled: str) -> None:
    log.info("Starting %s.", path)
    os.execve(sys.executable, [sys.executable, "-u", str(path)], {**os.environ, "SF_BUNDLED": bundled})


async def check_update(cfg: dict, key: str, bundled: str) -> bool:
    """Fetch and start a newer signed version; False when there's nothing (or nothing trusted)."""
    if not cfg["auto_update"]:
        return False
    async with httpx.AsyncClient(timeout=60, headers={"Authorization": f"Bearer {key}"}) as client:
        resp = await client.get(f"{cfg['server']}/api/gateway/release")
        if resp.status_code != 200:
            return False
        release = resp.json()
        version = str(release.get("version", ""))
        if not _newer(version, VERSION) or version in _state(cfg).get("bad", []):
            return False
        code = (await client.get(f"{cfg['server']}/api/gateway/release/file")).content
    if not verified(code, release):
        log.error("Update %s refused: its signature doesn't check out.", version)
        return False
    folder = _updates(cfg)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "gateway.py.new").write_bytes(code)
    (folder / "gateway.py.new").replace(folder / "gateway.py")
    _save_state(cfg, {**_state(cfg), "trying": version, "tries": 0})
    log.info("Updating %s → %s.", VERSION, version)
    _restart(folder / "gateway.py", bundled)
    return True


def give_up(cfg: dict, bundled: str) -> None:
    """The new version didn't come up: back to the image's own, and that version isn't tried again."""
    state = _state(cfg)
    log.error("Version %s didn't connect – back to the version that came with the gateway.", VERSION)
    (_updates(cfg) / "gateway.py").unlink(missing_ok=True)
    _save_state(cfg, {"bad": sorted(set(state.get("bad", [])) | {VERSION})})
    _restart(pathlib.Path(bundled), bundled)


def launch(cfg: dict) -> None:
    """At start: run the downloaded version when it is newer than the image's own."""
    here = pathlib.Path(__file__).resolve()
    downloaded = (_updates(cfg) / "gateway.py").resolve()
    bundled = os.environ.get("SF_BUNDLED", str(here))
    if here == downloaded:
        state = _state(cfg)
        if state.get("trying") == VERSION:
            state["tries"] = int(state.get("tries", 0)) + 1
            _save_state(cfg, state)
            if state["tries"] > UPDATE_TRIES:
                give_up(cfg, bundled)
        return
    if cfg["auto_update"] and downloaded.exists():
        version = _code_version(downloaded.read_bytes())
        if version and _newer(version, VERSION):
            _restart(downloaded, str(here))
        # The image itself is as new or newer: the download isn't needed any more.
        downloaded.unlink(missing_ok=True)


def _key_file(cfg: dict) -> pathlib.Path:
    return pathlib.Path(cfg["data_dir"]) / "gateway_key"


async def pair(cfg: dict) -> str | None:
    """Trade the one-time code for the gateway's own key."""
    if not cfg["pairing_code"]:
        log.error("Not paired yet: put the pairing code from Smooth Family in the options.")
        return None
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{cfg['server']}/api/gateway/pair", json={"code": cfg["pairing_code"], "version": VERSION})
    if resp.status_code != 200:
        log.error("Pairing failed (%s) – make a new code in Smooth Family.", resp.status_code)
        return None
    key = resp.json()["key"]
    path = _key_file(cfg)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(key, encoding="utf-8")
    path.chmod(0o600)
    log.info("Paired as %s.", resp.json().get("name", "?"))
    return key


async def run(cfg: dict) -> None:
    if not cfg["server"].startswith("https://") and not cfg["allow_http"]:
        sys.exit("The server must be https:// (allow_http only for testing at home).")
    url = "ws" + cfg["server"][4:] + "/api/gateway/ws"
    delay = 5
    bundled = os.environ.get("SF_BUNDLED", str(pathlib.Path(__file__).resolve()))
    trying = _state(cfg).get("trying") == VERSION
    started = asyncio.get_running_loop().time()
    async with httpx.AsyncClient(base_url=cfg["ha_url"], headers={"Authorization": f"Bearer {cfg['ha_token']}"}, timeout=15) as ha:
        while True:
            path = _key_file(cfg)
            key = path.read_text(encoding="utf-8").strip() if path.exists() else await pair(cfg)
            if not key:
                await asyncio.sleep(300)
                continue
            try:
                async with connect(url, additional_headers={"Authorization": f"Bearer {key}"}, ping_interval=30, ping_timeout=30, open_timeout=20) as ws:
                    await ws.send(json.dumps({"op": "hello", "version": VERSION, "domains": cfg["control_domains"], "auto_update": cfg["auto_update"], "runs_in": cfg["runs_in"]}))
                    log.info("Connected to %s.", cfg["server"])
                    delay = 5
                    if trying:
                        # The new version works: it stays.
                        _save_state(cfg, {"bad": _state(cfg).get("bad", [])})
                        trying = False

                    async def updates() -> None:
                        while True:
                            try:
                                await check_update(cfg, key, bundled)
                            except (httpx.HTTPError, OSError) as exc:
                                log.warning("Couldn't look for an update (%s).", exc.__class__.__name__)
                            await asyncio.sleep(UPDATE_EVERY)

                    updating = asyncio.create_task(updates())

                    async def reply(msg: dict) -> None:
                        await ws.send(json.dumps(await answer(msg, cfg, ha)))

                    try:
                        async for raw in ws:
                            asyncio.create_task(reply(json.loads(raw)))
                    finally:
                        updating.cancel()
            except InvalidStatus as exc:
                # A refused key is turned away before the line opens (403): a new pairing code was
                # made in Smooth Family – pair again with the code in the options.
                log.warning("The server refused the gateway (%s).", exc.response.status_code)
                if exc.response.status_code == 403:
                    path.unlink(missing_ok=True)
                    cfg["pairing_code"] = load_config()["pairing_code"]
            except ConnectionClosed:
                log.warning("The line to %s closed.", cfg["server"])
            except (OSError, asyncio.TimeoutError) as exc:
                log.warning("No connection to %s (%s).", cfg["server"], exc.__class__.__name__)
            if trying and asyncio.get_running_loop().time() - started > UPDATE_GRACE:
                give_up(cfg, bundled)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 120)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = load_config()
    launch(config)
    log.info("Smooth Family gateway %s.", VERSION)
    asyncio.run(run(config))
