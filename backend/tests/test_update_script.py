"""The server's update.sh (deploy/synology) runs as root, and the updates folder it shares with the
app is the app's (3.5.1). So nothing the app leaves there – a link, a folder, a line in the plan – may
make root write, read or run anything outside its own folder; and what goes in is what the script has
checked itself: Smooth Family's build by its signed manifest, the other services by their version.
Run here with a stand-in for docker."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy" / "synology" / "update.sh"
BACKEND = "ghcr.io/burnwalled/smoothfamily-backend@sha256:" + "a" * 64
FRONTEND = "ghcr.io/burnwalled/smoothfamily-frontend@sha256:" + "b" * 64
APP = f"{BACKEND} {FRONTEND}"
RUN_ID = "0123456789ab"

# Links need a real POSIX file system; the script is for a NAS.
pytestmark = pytest.mark.skipif(os.name == "nt" or not SCRIPT.exists(), reason="needs a POSIX shell and the deploy folder")

DOCKER = """#!/bin/sh
# A stand-in: everything works, nothing runs. What was asked is written down.
echo "$*" >> "$STUB/calls"
case "$*" in
	"compose ps --services") cat "$STUB/services" 2> /dev/null ;;
	"compose ps -q") echo backend-id ;;
	"compose ps -q "*) echo "$4-id" ;;
	inspect*"{{.Image}}"*) echo sha256:what-runs-now ;;
	inspect*"{{.Config.Image}}"*) echo an-image ;;
	inspect*".Config.Env"*) for last; do :; done; cat "$STUB/env-$last" 2> /dev/null ;;
	inspect*".State.Status"*) echo "running none" ;;
	inspect*"RestartCount"*) echo 0 ;;
	run*app.verify_manifest*)
		cat "$STUB/verify.out" 2> /dev/null
		[ ! -f "$STUB/verify.err" ] || cat "$STUB/verify.err" >&2
		exit "$(cat "$STUB/verify.exit" 2> /dev/null || echo 0)"
		;;
	*pg_dump*) echo "the database" ;;
	*"select version_num"*) echo "0110" ;;
esac
exit 0
"""


class Server:
    def __init__(self, root: Path):
        self.home = root / "smooth-family"
        self.data = self.home / "data"
        self.shared = self.data / "updates"
        self.own = self.data / "updates-root"
        self.bin = root / "bin"
        self.stub = root / "stub"
        self.victim = root / "victim"
        self.shared.mkdir(parents=True)
        self.bin.mkdir()
        self.stub.mkdir()
        (self.stub / "calls").write_text("")
        shutil.copy(SCRIPT, self.home / "update.sh")
        (self.home / ".env").write_text(f"DATA_DIR={self.data}\n")
        for name, body in (("docker", DOCKER), ("sleep", "#!/bin/sh\nexit 0\n")):
            (self.bin / name).write_text(body)
            (self.bin / name).chmod(0o755)
        self.victim.write_text("root's own file\n")

    def plan(self, pull: str, run_id: str = RUN_ID, channel: str | None = None) -> None:
        lines = [f"RUN_ID={run_id}", "NOT_BEFORE=0", f'PULL="{pull}"'] + ([f"CHANNEL={channel}"] if channel else [])
        (self.shared / "plan.env").write_text("\n".join(lines) + "\n")

    def signed(self, version: str = "3.5.1", build: int = 57, backend: str = BACKEND, frontend: str = FRONTEND) -> None:
        """A manifest with the plan, and what the checker (in the image that runs now) says of it."""
        (self.shared / "manifest.json").write_text('{"the": "manifest"}')
        (self.shared / "manifest.sig").write_text('{"the": "signature"}')
        (self.stub / "verify.out").write_text(f"version={version}\nbuild={build}\nbackend={backend}\nfrontend={frontend}\n")

    def runs(self, **services: str) -> None:
        """What runs on the server: the service and its image's version variable."""
        (self.stub / "services").write_text("".join(f"{name}\n" for name in services))
        for name, env in services.items():
            (self.stub / f"env-{name}-id").write_text(f"PATH=/usr/bin\n{env}\n")

    def run(self) -> subprocess.CompletedProcess:
        env = {**os.environ, "PATH": f"{self.bin}{os.pathsep}{os.environ['PATH']}", "STUB": str(self.stub)}
        return subprocess.run(["sh", str(self.home / "update.sh")], env=env, capture_output=True, text=True, timeout=120)

    @property
    def calls(self) -> str:
        return (self.stub / "calls").read_text()

    def result(self) -> dict:
        lines = (self.shared / "result.env").read_text().splitlines()
        return dict(line.split("=", 1) for line in lines)

    def untouched(self) -> bool:
        return self.victim.read_text() == "root's own file\n"


@pytest.fixture
def server(tmp_path):
    return Server(tmp_path)


# --- The app's folder is a letterbox ----------------------------------------------------------------

def test_what_runs_is_told_with_the_scripts_own_number(server):
    server.runs(db="PG_VERSION=16.4")
    server.run()
    state = json.loads((server.shared / "state.json").read_text())
    assert state["script"] == 3
    assert state["services"] == {"db": {"image": "an-image", "env": ["PG_VERSION=16.4"]}}
    assert not (server.shared / "state.json.tmp").exists()


def test_a_link_where_the_result_goes_is_replaced_not_written_through(server):
    """The way in that was open: result.env as a link to a file root runs, and a plan whose image
    line carries a command – the refusal used to be written, with that line, through the link."""
    (server.shared / "result.env").symlink_to(server.victim)
    (server.shared / "state.json").symlink_to(server.victim)
    (server.shared / "state.json.tmp").symlink_to(server.victim)
    server.plan(";touch /tmp/owned")
    server.run()
    assert server.untouched()
    assert not (server.shared / "result.env").is_symlink() and not (server.shared / "state.json").is_symlink()
    result = server.result()
    assert result["OK"] == "0" and result["RUN_ID"] == RUN_ID
    # Its own words only – nothing of the plan as it came.
    assert "touch" not in (server.shared / "result.env").read_text()
    assert not (server.shared / "plan.env").exists()
    assert "pull" not in server.calls


def test_a_link_to_a_folder_gets_nothing_put_into_it(server, tmp_path):
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    (server.shared / "state.json").symlink_to(elsewhere, target_is_directory=True)
    (server.shared / "result.env").mkdir()
    server.plan("not-an-image")
    server.run()
    assert list(elsewhere.iterdir()) == []
    assert (server.shared / "state.json").is_file() and (server.shared / "result.env").is_file()


def test_a_plan_that_is_a_link_is_not_read(server):
    server.victim.write_text(f'RUN_ID={RUN_ID}\nNOT_BEFORE=0\nPULL="postgres:16.11-alpine"\n')
    (server.shared / "plan.env").symlink_to(server.victim)
    server.run()
    assert not (server.shared / "result.env").exists()
    assert "pull" not in server.calls


def test_pins_that_are_a_link_are_not_taken_over(server):
    server.victim.write_text("db=postgres:16.4-alpine\n")
    (server.shared / "pins").symlink_to(server.victim)
    server.run()
    assert (server.own / "pins").read_text() == ""
    assert server.victim.read_text() == "db=postgres:16.4-alpine\n"


def test_one_image_that_is_not_allowed_stops_them_all(server):
    server.plan("postgres:16.11-alpine redis:7.4.7-alpine;reboot")
    server.run()
    assert server.result()["OK"] == "0"
    assert "pull" not in server.calls
    assert (server.own / "pins").read_text() == ""


# --- Smooth Family's own build: the signature is checked here ---------------------------------------

def test_an_update_goes_in_and_roots_files_stay_roots(server):
    # What the script used to keep in the app's folder, now links to somewhere else.
    for name in ("pins.tmp", "pins.before", "db-before-update.dump"):
        (server.shared / name).symlink_to(server.victim)
    (server.shared / "pins").write_text("db=postgres:16.4-alpine\nevil=image\n  privileged: true\n")
    server.plan(APP, channel="beta")
    server.signed()
    out = server.run()
    assert server.untouched(), out.stderr
    result = server.result()
    assert result["OK"] == "1" and result["MESSAGE"] == f"Updated: {APP}"
    # Checked in a container of its own, from the image that runs now – no network, nothing to write.
    check = next(line for line in server.calls.splitlines() if "app.verify_manifest" in line)
    assert check.startswith("run --rm --network none --read-only --cap-drop ALL") and "--user 65534:65534" in check
    assert "sha256:what-runs-now -m app.verify_manifest /verify/manifest.json /verify/manifest.sig beta -" in check
    # The pins that fit were taken over; the versions in use are root's alone, and so is the dump.
    assert (server.own / "pins").read_text().splitlines() == ["db=postgres:16.4-alpine", f"backend={BACKEND}", f"frontend={FRONTEND}"]
    override = (server.home / "docker-compose.override.yml").read_text()
    assert f"image: {BACKEND}" in override and "privileged" not in override and "evil" not in override
    assert sorted(p.name for p in server.shared.iterdir()) == ["result.env", "state.json"]
    assert not (server.own / "db-before-update.dump").exists() and not (server.own / "verify").exists()
    assert f"pull -q {BACKEND}" in server.calls and "compose up -d" in server.calls

    # The same plan again (left behind, or put back): done once.
    server.plan(APP, channel="beta")
    (server.stub / "calls").write_text("")
    server.run()
    assert "pull" not in server.calls

    # The next one is asked to be newer than this: the build put in is where root counts from.
    assert (server.own / "app-installed").read_text() == "3.5.1:57\n"
    server.plan(APP, run_id="ba9876543210", channel="beta")
    server.signed(build=58)
    server.run()
    assert "/verify/manifest.sig beta 3.5.1:57" in server.calls
    assert (server.own / "app-installed").read_text() == "3.5.1:58\n"


def test_a_build_without_its_signed_manifest_is_not_put_in(server):
    """What an app that has been taken over could do before: name any digest of the two images."""
    server.plan(APP)
    server.run()
    assert server.result()["OK"] == "0" and "pull" not in server.calls

    server.plan(APP, run_id="ba9876543210", channel="beta")  # says a channel, brings no manifest
    server.run()
    assert server.result()["OK"] == "0" and "pull" not in server.calls and "verify_manifest" not in server.calls

    server.plan(APP, run_id="cba987654321", channel="beta")  # the manifest is a link to somewhere else
    server.signed()
    (server.shared / "manifest.json").unlink()
    (server.shared / "manifest.json").symlink_to(server.victim)
    server.run()
    assert server.result()["OK"] == "0" and "pull" not in server.calls and "verify_manifest" not in server.calls


def test_a_signature_that_does_not_check_out(server):
    server.plan(APP, channel="beta")
    server.signed()
    (server.stub / "verify.out").write_text("")
    (server.stub / "verify.err").write_text("Not newer than what this server has already put in\n")
    (server.stub / "verify.exit").write_text("1")
    server.run()
    result = server.result()
    assert result["OK"] == "0" and "Not newer than what this server has already put in" in result["MESSAGE"]
    assert "pull" not in server.calls and not (server.own / "app-installed").exists()
    assert not (server.shared / "manifest.json").exists()


def test_the_plans_images_must_be_the_manifests(server):
    other = "ghcr.io/burnwalled/smoothfamily-backend@sha256:" + "c" * 64
    server.plan(f"{other} {FRONTEND}", channel="beta")
    server.signed()  # a real manifest – of another build than the plan names
    server.run()
    assert server.result()["OK"] == "0" and "pull" not in server.calls

    server.plan(BACKEND, run_id="ba9876543210", channel="beta")  # only one of the two
    server.signed()
    server.run()
    assert server.result()["OK"] == "0" and "pull" not in server.calls


def test_a_server_that_only_takes_stable(server):
    (server.home / ".env").write_text(f"DATA_DIR={server.data}\nUPDATE_CHANNEL_LOCK=stable\n")
    server.plan(APP, channel="beta")
    server.signed()
    server.run()
    assert server.result()["OK"] == "0" and "verify_manifest" not in server.calls and "pull" not in server.calls

    server.plan(APP, run_id="ba9876543210", channel="stable")
    server.signed()
    server.run()
    assert server.result()["OK"] == "1" and "/verify/manifest.sig stable -" in server.calls


# --- The other services: the same major, never older -------------------------------------------------

@pytest.mark.parametrize("image, goes_in", [
    ("postgres:16.11-alpine", True),
    ("postgres:16.4-alpine", True),  # what runs, pinned
    ("postgres:16.3-alpine", False),
    ("postgres:15.9-alpine", False),
    ("postgres:17.1-alpine", False),
    ("postgres:latest", False),
    ("redis:7.4.7-alpine", True),
    ("redis:7.4.10-alpine", True),  # numbers, not letters: 10 comes after 6
    ("redis:7.4.5-alpine", False),
    ("redis:7.2.9-alpine", False),
    ("caddy:2.10.3-alpine", True),
    ("caddy:2.9.1-alpine", False),
    ("caddy:3.0.0-alpine", False),
    ("searxng/searxng:2026.11.2-0123abc", True),  # dates: any newer one
    ("searxng/searxng:2027.1.5-0123abc", True),
    ("searxng/searxng:2026.9.30-0123abc", False),
])
def test_other_services_stay_in_their_major_and_never_go_back(server, image, goes_in):
    server.runs(db="PG_VERSION=16.4", redis="REDIS_VERSION=7.4.6", caddy="CADDY_VERSION=v2.10.2", searxng="__SEARXNG_VERSION=2026.10.19-d47cb96bf")
    server.plan(image)
    server.run()
    assert server.result()["OK"] == ("1" if goes_in else "0")
    assert (f"pull -q {image}" in server.calls) is goes_in
