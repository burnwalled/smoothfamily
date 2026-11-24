"""The server's update.sh (deploy/synology) runs as root, and the updates folder it shares with the
app is the app's (3.5.1). So nothing the app leaves there – a link, a folder, a line in the plan – may
make root write, read or run anything outside its own folder. Run here with a stand-in for docker."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy" / "synology" / "update.sh"
BACKEND = "ghcr.io/burnwalled/smoothfamily-backend@sha256:" + "a" * 64
RUN_ID = "0123456789ab"

# Links need a real POSIX file system; the script is for a NAS.
pytestmark = pytest.mark.skipif(os.name == "nt" or not SCRIPT.exists(), reason="needs a POSIX shell and the deploy folder")

DOCKER = """#!/bin/sh
# A stand-in: everything works, nothing runs. What was asked is written down.
echo "$*" >> "$CALLS"
case "$*" in
	"compose ps --services" | "compose ps -q"*) ;;
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
        self.calls = root / "calls"
        self.victim = root / "victim"
        self.shared.mkdir(parents=True)
        self.bin.mkdir()
        shutil.copy(SCRIPT, self.home / "update.sh")
        (self.home / ".env").write_text(f"DATA_DIR={self.data}\n")
        for name, body in (("docker", DOCKER), ("sleep", "#!/bin/sh\nexit 0\n")):
            (self.bin / name).write_text(body)
            (self.bin / name).chmod(0o755)
        self.victim.write_text("root's own file\n")

    def plan(self, pull: str, run_id: str = RUN_ID) -> None:
        (self.shared / "plan.env").write_text(f'RUN_ID={run_id}\nNOT_BEFORE=0\nPULL="{pull}"\n')

    def run(self) -> subprocess.CompletedProcess:
        env = {**os.environ, "PATH": f"{self.bin}{os.pathsep}{os.environ['PATH']}", "CALLS": str(self.calls)}
        return subprocess.run(["sh", str(self.home / "update.sh")], env=env, capture_output=True, text=True, timeout=120)

    def result(self) -> dict:
        lines = (self.shared / "result.env").read_text().splitlines()
        return dict(line.split("=", 1) for line in lines)

    def untouched(self) -> bool:
        return self.victim.read_text() == "root's own file\n"


@pytest.fixture
def server(tmp_path):
    return Server(tmp_path)


def test_what_runs_is_told_with_the_scripts_own_number(server):
    server.run()
    state = json.loads((server.shared / "state.json").read_text())
    assert state["script"] == 2 and state["services"] == {}
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
    assert "pull" not in server.calls.read_text()


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
    server.victim.write_text(f'RUN_ID={RUN_ID}\nNOT_BEFORE=0\nPULL="{BACKEND}"\n')
    (server.shared / "plan.env").symlink_to(server.victim)
    server.run()
    assert not (server.shared / "result.env").exists()
    assert "pull" not in server.calls.read_text()


def test_an_update_goes_in_and_roots_files_stay_roots(server):
    # What the script used to keep in the app's folder, now links to somewhere else.
    for name in ("pins.tmp", "pins.before", "db-before-update.dump"):
        (server.shared / name).symlink_to(server.victim)
    (server.shared / "pins").write_text("db=postgres:16.4-alpine\nevil=image\n  privileged: true\n")
    server.plan(BACKEND)
    out = server.run()
    assert server.untouched(), out.stderr
    result = server.result()
    assert result["OK"] == "1" and result["MESSAGE"] == f"Updated: {BACKEND}"
    # The pins that fit were taken over; the versions in use are root's alone, and so is the dump.
    assert (server.own / "pins").read_text().splitlines() == ["db=postgres:16.4-alpine", f"backend={BACKEND}"]
    override = (server.home / "docker-compose.override.yml").read_text()
    assert f"image: {BACKEND}" in override and "privileged" not in override and "evil" not in override
    assert sorted(p.name for p in server.shared.iterdir()) == ["result.env", "state.json"]
    assert not (server.own / "db-before-update.dump").exists()
    calls = server.calls.read_text()
    assert f"pull -q {BACKEND}" in calls and "compose up -d" in calls

    # The same plan again (left behind, or put back): done once.
    server.plan(BACKEND)
    server.calls.write_text("")
    server.run()
    assert "pull" not in server.calls.read_text()


def test_pins_that_are_a_link_are_not_taken_over(server):
    server.victim.write_text("db=postgres:16.4-alpine\n")
    (server.shared / "pins").symlink_to(server.victim)
    server.run()
    assert (server.own / "pins").read_text() == ""
    assert server.victim.read_text() == "db=postgres:16.4-alpine\n"


def test_one_image_that_is_not_allowed_stops_them_all(server):
    server.plan(f"{BACKEND} postgres:16.11-alpine;reboot")
    server.run()
    assert server.result()["OK"] == "0"
    assert "pull" not in server.calls.read_text()
    assert (server.own / "pins").read_text() == ""
