"""Admin: configuration export and import.

Export format (version 5): family settings, members (with password_hash),
calendar feeds, active tasks, home profile + rooms, per-user dashboard widgets.

Excluded from export (lives in the Postgres backup, not config):
task completions, achievements, meal plans, list items.
"""
import json
import uuid
import os
import shutil
from datetime import date as _date, datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import AdminUser, CurrentUser, DB, ServerAdmin
from app.models import AppSetting, CalendarFeed, DashboardWidget, Family, HomeProfile, ListModel, Recipe, RecipeIngredient, Room, Task, User
from app.schemas import ExternalUrlIn, ExternalUrlOut, GiphySettingIn, GiphySettingOut, TransitKeyIn, TransitKeyOut
from app.services import file_limit, giphy, mailer, places, public_url, recipe_search, security_policy, transit
from app.services.crypto import encrypt_token
from app.config import get_settings

router = APIRouter(prefix="/api/admin", tags=["admin"])

CONFIG_FORMAT = "smooth-family-config"
SUPPORTED_VERSION = 5
# FORWARD NOTE (applies to every future phase):
# When a phase adds new configuration entities (for example lists, recipes,
# smart-home config, allowance settings), extend the exported schema and bump
# SUPPORTED_VERSION. Import must remain backward-compatible by accepting all
# payload versions <= SUPPORTED_VERSION.


# ── Config document models ────────────────────────────────────────────────────

class _Member(BaseModel):
    username: str
    display_name: str
    role: str = "adult"
    color: str = "#4F7A5B"
    language: str = "en"
    theme: str = "forest"
    notification_prefs: dict[str, bool] = {
        "chat": True,
        "approvals": True,
        "calendar_mine": True,
        "calendar_family": False,
    }
    allowance_rate: float | None = None
    password_hash: str


class _Feed(BaseModel):
    name: str
    url: str
    color: str = "#4F7A5B"


class _Task(BaseModel):
    title: str
    description: str | None = None
    points: int = 10
    recurrence: str = "none"
    weekday: int | None = None
    weekdays: list[int] = []
    interval_weeks: int = 1
    month: int | None = None
    day_of_month: int | None = None
    due_date: str | None = None  # ISO 8601 date
    assignee: str | None = None  # username
    requires_approval: bool = False


class _HomeProfile(BaseModel):
    dwelling_type: str = "apartment"
    has_garden: bool = False
    notes: str | None = None


class _Room(BaseModel):
    name: str
    category: str


class _WidgetEntry(BaseModel):
    type: str
    position: int = 0
    config: dict = {}


class _UserWidgets(BaseModel):
    username: str
    widgets: list[_WidgetEntry] = []


class _ListConfig(BaseModel):
    name: str
    allowed_to: list[str] = []
    archived: bool = False


class _RecipeIngredientConfig(BaseModel):
    name: str
    amount: float | None = None
    unit: str | None = None
    category: str | None = None


class _RecipeConfig(BaseModel):
    name: str
    description: str | None = None
    servings: int = 4
    ingredients: list[_RecipeIngredientConfig] = []


class FamilyConfig(BaseModel):
    format: str
    version: int
    exported_at: str
    family: dict  # {"name": str, "currency": str, "shopping_task_points": int}
    members: list[_Member] = []
    calendar_feeds: list[_Feed] = []
    tasks: list[_Task] = []
    home_profile: _HomeProfile | None = None
    rooms: list[_Room] = []
    lists: list[_ListConfig] = []
    recipes: list[_RecipeConfig] = []
    widgets: list[_UserWidgets] = []


class ImportSummary(BaseModel):
    created: dict[str, int]
    skipped: dict[str, int]


class StorageInfo(BaseModel):
    data_dir: str
    media_root: str
    bytes_total: int
    bytes_used: int
    bytes_free: int
    sd_card_suspected: bool
    advisory: str | None = None


def _read_mountinfo() -> str:
    try:
        with open("/proc/self/mountinfo", "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def _is_probably_sd_mount(media_root: str, mountinfo_text: str) -> bool:
    best_source = ""
    best_len = -1
    for line in mountinfo_text.splitlines():
        line = line.strip()
        if not line or " - " not in line:
            continue
        pre, post = line.split(" - ", 1)
        pre_parts = pre.split()
        post_parts = post.split()
        if len(pre_parts) < 5 or len(post_parts) < 2:
            continue
        mount_point = pre_parts[4]
        source = post_parts[1]
        if media_root == mount_point or media_root.startswith(mount_point.rstrip("/") + "/"):
            if len(mount_point) > best_len:
                best_len = len(mount_point)
                best_source = source
    return "mmcblk" in best_source


def _disk_usage(path: str) -> tuple[int, int, int]:
    if hasattr(os, "statvfs"):
        st = os.statvfs(path)
        total = st.f_frsize * st.f_blocks
        free = st.f_frsize * st.f_bavail
        used = max(0, total - free)
        return total, used, free
    du = shutil.disk_usage(path)
    return du.total, du.used, du.free


@router.get("/storage", response_model=StorageInfo)
async def get_storage_info(admin: ServerAdmin) -> StorageInfo:
    del admin  # route is admin-only; user object itself is not otherwise needed here
    settings = get_settings()

    bytes_total, bytes_used, bytes_free = _disk_usage(settings.media_root)

    sd_card_suspected = _is_probably_sd_mount(settings.media_root, _read_mountinfo())
    advisory = (
        "Media/database path looks like SD-card storage. For reliability, move DATA_DIR to a USB SSD."
        if sd_card_suspected
        else None
    )

    return StorageInfo(
        data_dir=settings.data_dir,
        media_root=settings.media_root,
        bytes_total=bytes_total,
        bytes_used=bytes_used,
        bytes_free=bytes_free,
        sd_card_suspected=sd_card_suspected,
        advisory=advisory,
    )


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_config(admin: AdminUser, db: DB) -> Response:
    """Download family configuration as a JSON attachment.

    The file contains password hashes — treat it like a password file and store
    it securely. It is NOT a database backup; use scripts/backup.sh (pg_dump)
    for full data backups.
    """
    family = await db.get(Family, admin.family_id)

    members = list(
        (await db.execute(select(User).where(User.family_id == admin.family_id))).scalars().all()
    )
    uid_to_name: dict = {u.id: u.username for u in members}

    feeds = list(
        (await db.execute(select(CalendarFeed).where(CalendarFeed.family_id == admin.family_id)))
        .scalars().all()
    )

    tasks = list(
        (
            await db.execute(
                select(Task).where(Task.family_id == admin.family_id, Task.active == True)  # noqa: E712
            )
        ).scalars().all()
    )

    hp = (
        await db.execute(select(HomeProfile).where(HomeProfile.family_id == admin.family_id))
    ).scalar_one_or_none()

    rooms = list(
        (await db.execute(select(Room).where(Room.family_id == admin.family_id))).scalars().all()
    )
    lists = list(
        (
            await db.execute(
                select(ListModel).where(ListModel.family_id == admin.family_id).order_by(ListModel.created_at)
            )
        ).scalars().all()
    )
    recipes = list(
        (
            await db.execute(
                select(Recipe).where(Recipe.family_id == admin.family_id).order_by(Recipe.created_at)
            )
        ).scalars().all()
    )

    raw_widgets = list(
        (
            await db.execute(
                select(DashboardWidget)
                .where(DashboardWidget.family_id == admin.family_id)
                .order_by(DashboardWidget.user_id, DashboardWidget.position)
            )
        ).scalars().all()
    )
    widgets_by_user: dict[str, list[dict[str, Any]]] = {}
    for w in raw_widgets:
        uname = uid_to_name.get(w.user_id, "")
        if uname:
            widgets_by_user.setdefault(uname, []).append(
                {"type": w.type, "position": w.position, "config": w.config}
            )

    config: dict[str, Any] = {
        "format": CONFIG_FORMAT,
        "version": SUPPORTED_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "family": {
            "name": family.name,
            "currency": family.currency,
            "shopping_task_points": family.shopping_task_points,
        },
        "members": [
            {
                "username": u.username,
                "display_name": u.display_name,
                "role": u.role,
                "color": u.color,
                "language": u.language,
                "theme": u.theme,
                "notification_prefs": u.notification_prefs,
                "allowance_rate": float(u.allowance_rate) if u.allowance_rate is not None else None,
                "password_hash": u.password_hash,
            }
            for u in members
        ],
        "calendar_feeds": [
            {"name": f.name, "url": f.url, "color": f.color} for f in feeds
        ],
        "tasks": [
            {
                "title": t.title,
                "description": t.description,
                "points": t.points,
                "recurrence": t.recurrence,
                "weekday": t.weekday,
                "weekdays": t.weekdays or [],
                "interval_weeks": t.interval_weeks or 1,
                "month": t.month,
                "day_of_month": t.day_of_month,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "assignee": uid_to_name.get(t.assignee_id) if t.assignee_id else None,
                "requires_approval": t.requires_approval,
            }
            for t in tasks
        ],
        "home_profile": (
            {
                "dwelling_type": hp.dwelling_type,
                "has_garden": hp.has_garden,
                "notes": hp.notes,
            }
            if hp
            else None
        ),
        "rooms": [{"name": r.name, "category": r.category} for r in rooms],
        "lists": [
            {
                "name": lst.name,
                "allowed_to": [
                    uid_to_name.get(uuid.UUID(str(uid)))
                    for uid in lst.allowed_user_ids
                    if uid_to_name.get(uuid.UUID(str(uid)))
                ],
                "archived": lst.archived,
            }
            for lst in lists
        ],
        "recipes": [
            {
                "name": r.name,
                "description": r.description,
                "servings": r.servings,
                "ingredients": [
                    {
                        "name": i.name,
                        "amount": i.amount,
                        "unit": i.unit,
                        "category": i.category,
                    }
                    for i in (
                        await db.execute(
                            select(RecipeIngredient).where(RecipeIngredient.recipe_id == r.id)
                        )
                    ).scalars().all()
                ],
            }
            for r in recipes
        ],
        "widgets": [
            {"username": uname, "widgets": ws}
            for uname, ws in widgets_by_user.items()
        ],
    }

    return Response(
        content=json.dumps(config, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="smooth-family-config.json"'},
    )


# ── Import ────────────────────────────────────────────────────────────────────

@router.post("/import", response_model=ImportSummary)
async def import_config(payload: FamilyConfig, admin: AdminUser, db: DB) -> ImportSummary:
    """Merge a config file into the current family.

    Natural keys per entity type:
    - member   → username (case-folded)
    - feed     → url
    - task     → (title case-folded, recurrence)
    - room     → (name case-folded, category)
    - widget   → (username, type, config JSON)

    Existing entities are skipped; missing ones are created. Nothing is deleted.
    Versions newer than the supported version are rejected with 422.

    Forward-compatibility rule for maintainers:
    If new config entities are introduced in later phases, update both export
    and import schema handling and bump SUPPORTED_VERSION accordingly. Keep
    support for importing all versions <= SUPPORTED_VERSION.
    """
    if payload.format != CONFIG_FORMAT:
        raise HTTPException(status_code=422, detail=f"Unknown config format: {payload.format!r}")
    if payload.version > SUPPORTED_VERSION:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Config version {payload.version} is newer than supported "
                f"({SUPPORTED_VERSION}). Upgrade Smooth Family first."
            ),
        )

    created: dict[str, int] = {"members": 0, "feeds": 0, "tasks": 0, "rooms": 0, "lists": 0, "recipes": 0, "widgets": 0}
    skipped: dict[str, int] = {"members": 0, "feeds": 0, "tasks": 0, "rooms": 0, "lists": 0, "recipes": 0, "widgets": 0}

    family = await db.get(Family, admin.family_id)
    family.name = payload.family.get("name", family.name)
    if payload.version >= 2:
        if "currency" in payload.family and payload.family["currency"]:
            family.currency = str(payload.family["currency"])
        if "shopping_task_points" in payload.family and payload.family["shopping_task_points"] is not None:
            family.shopping_task_points = int(payload.family["shopping_task_points"])

    # ── Members ───────────────────────────────────────────────────────────────
    for m in payload.members:
        uname = m.username.lower()
        exists = (
            await db.execute(select(User).where(User.username == uname))
        ).scalar_one_or_none()
        if exists:
            skipped["members"] += 1
            continue
        db.add(User(
            family_id=admin.family_id,
            username=uname,
            display_name=m.display_name,
            role=m.role,
            color=m.color,
            language=m.language,
            theme=m.theme,
            notification_prefs=m.notification_prefs,
            allowance_rate=m.allowance_rate,
            password_hash=m.password_hash,
        ))
        created["members"] += 1

    # Flush so new users get IDs before we process their widgets.
    await db.flush()

    users_q = await db.execute(select(User).where(User.family_id == admin.family_id))
    user_by_name: dict[str, User] = {u.username: u for u in users_q.scalars().all()}

    # ── Calendar feeds ────────────────────────────────────────────────────────
    for f in payload.calendar_feeds:
        exists = (
            await db.execute(
                select(CalendarFeed).where(
                    CalendarFeed.family_id == admin.family_id,
                    CalendarFeed.url == f.url,
                )
            )
        ).scalar_one_or_none()
        if exists:
            skipped["feeds"] += 1
            continue
        db.add(CalendarFeed(
            family_id=admin.family_id,
            created_by=admin.id,
            name=f.name,
            url=f.url,
            color=f.color,
        ))
        created["feeds"] += 1

    # ── Tasks ─────────────────────────────────────────────────────────────────
    active_tasks_q = await db.execute(
        select(Task).where(Task.family_id == admin.family_id, Task.active == True)  # noqa: E712
    )
    existing_task_keys = {
        (t.title.casefold().strip(), t.recurrence)
        for t in active_tasks_q.scalars().all()
    }

    for t in payload.tasks:
        key = (t.title.casefold().strip(), t.recurrence)
        if key in existing_task_keys:
            skipped["tasks"] += 1
            continue
        due = _date.fromisoformat(t.due_date) if t.due_date else None
        assignee_id = None
        if t.assignee:
            u = user_by_name.get(t.assignee.lower())
            if u:
                assignee_id = u.id
        db.add(Task(
            family_id=admin.family_id,
            created_by=admin.id,
            title=t.title,
            description=t.description,
            points=t.points,
            recurrence=t.recurrence,
            weekday=t.weekday,
            weekdays=t.weekdays or ([t.weekday] if t.weekday is not None else []),
            interval_weeks=min(max(t.interval_weeks, 1), 4),
            anchor_date=_date.today(),
            month=t.month,
            day_of_month=t.day_of_month,
            due_date=due,
            assignee_id=assignee_id,
                requires_approval=t.requires_approval,
        ))
        created["tasks"] += 1

    # ── Home profile ──────────────────────────────────────────────────────────
    if payload.home_profile is not None:
        hp_exists = (
            await db.execute(
                select(HomeProfile).where(HomeProfile.family_id == admin.family_id)
            )
        ).scalar_one_or_none()
        if not hp_exists:
            db.add(HomeProfile(
                family_id=admin.family_id,
                dwelling_type=payload.home_profile.dwelling_type,
                has_garden=payload.home_profile.has_garden,
                notes=payload.home_profile.notes,
            ))

    # ── Rooms ─────────────────────────────────────────────────────────────────
    rooms_q = await db.execute(select(Room).where(Room.family_id == admin.family_id))
    existing_room_keys = {
        (r.name.casefold().strip(), r.category) for r in rooms_q.scalars().all()
    }

    for r in payload.rooms:
        key = (r.name.casefold().strip(), r.category)
        if key in existing_room_keys:
            skipped["rooms"] += 1
            continue
        db.add(Room(family_id=admin.family_id, name=r.name, category=r.category))
        created["rooms"] += 1

    # ── Lists ─────────────────────────────────────────────────────────────────
    if payload.version >= 3:
        existing_lists_q = await db.execute(select(ListModel).where(ListModel.family_id == admin.family_id))
        existing_list_names = {lst.name.casefold().strip() for lst in existing_lists_q.scalars().all()}

        for lst in payload.lists:
            key = lst.name.casefold().strip()
            if key in existing_list_names:
                skipped["lists"] += 1
                continue
            allowed_user_ids = []
            for username in lst.allowed_to:
                u = user_by_name.get(username.lower())
                if u:
                    allowed_user_ids.append(str(u.id))
            db.add(
                ListModel(
                    family_id=admin.family_id,
                    name=lst.name,
                    allowed_user_ids=allowed_user_ids,
                    created_by=admin.id,
                    archived=lst.archived,
                )
            )
            created["lists"] += 1

    # ── Recipes ───────────────────────────────────────────────────────────────
    if payload.version >= 4:
        existing_recipes_q = await db.execute(select(Recipe).where(Recipe.family_id == admin.family_id))
        existing_recipe_names = {r.name.casefold().strip() for r in existing_recipes_q.scalars().all()}

        for recipe in payload.recipes:
            key = recipe.name.casefold().strip()
            if key in existing_recipe_names:
                skipped["recipes"] += 1
                continue

            row = Recipe(
                family_id=admin.family_id,
                name=recipe.name,
                description=recipe.description,
                servings=recipe.servings,
                created_by=admin.id,
            )
            db.add(row)
            await db.flush()

            for ingredient in recipe.ingredients:
                db.add(
                    RecipeIngredient(
                        recipe_id=row.id,
                        family_id=admin.family_id,
                        name=ingredient.name,
                        amount=ingredient.amount,
                        unit=ingredient.unit,
                        category=ingredient.category,
                    )
                )
            created["recipes"] += 1

    # ── Widgets ───────────────────────────────────────────────────────────────
    def _cfg_key(cfg: dict) -> str:
        return json.dumps(cfg, sort_keys=True)

    for uw in payload.widgets:
        target = user_by_name.get(uw.username.lower())
        if not target:
            skipped["widgets"] += len(uw.widgets)
            continue

        existing_wq = await db.execute(
            select(DashboardWidget).where(
                DashboardWidget.family_id == admin.family_id,
                DashboardWidget.user_id == target.id,
            )
        )
        existing_keys = {
            (w.type, _cfg_key(w.config)) for w in existing_wq.scalars().all()
        }

        for w in uw.widgets:
            wkey = (w.type, _cfg_key(w.config))
            if wkey in existing_keys:
                skipped["widgets"] += 1
                continue
            db.add(DashboardWidget(
                family_id=admin.family_id,
                user_id=target.id,
                type=w.type,
                position=w.position,
                config=w.config,
            ))
            created["widgets"] += 1

    await db.commit()
    return ImportSummary(created=created, skipped=skipped)


class FileLimitOut(BaseModel):
    max_mb: int | None  # None = no limit
    memory_mb: int | None
    suggested_mb: int | None
    factor: int


class FileLimitIn(BaseModel):
    max_mb: int | None = Field(default=None, ge=1, le=100_000)


async def _file_limit(db) -> FileLimitOut:
    memory = file_limit.memory_mb()
    return FileLimitOut(max_mb=await file_limit.max_file_mb(db), memory_mb=memory, suggested_mb=file_limit.suggested_mb(memory), factor=file_limit.MEMORY_FACTOR)


class SecurityPolicy(BaseModel):
    passkeys_enabled: bool
    totp_policy: str = Field(pattern=r"^(off|optional|required)$")
    password_min_adult: int = Field(ge=4, le=64)
    password_min_child: int = Field(ge=4, le=64)


@router.get("/security-policy", response_model=SecurityPolicy)
async def get_security_policy(admin: ServerAdmin, db: DB) -> SecurityPolicy:
    """The server's sign-in and password rules – the same for every family."""
    return SecurityPolicy(**await security_policy.get_policy(db))


@router.put("/security-policy", response_model=SecurityPolicy)
async def set_security_policy(payload: SecurityPolicy, admin: ServerAdmin, db: DB) -> SecurityPolicy:
    return SecurityPolicy(**await security_policy.set_policy(db, payload.model_dump()))


@router.get("/file-limit", response_model=FileLimitOut)
async def get_file_limit(admin: ServerAdmin, db: DB) -> FileLimitOut:
    """How large a file the vault and the documents take, and what the server has to go by."""
    return await _file_limit(db)


@router.put("/file-limit", response_model=FileLimitOut)
async def set_file_limit(payload: FileLimitIn, admin: ServerAdmin, db: DB) -> FileLimitOut:
    await file_limit.set_max_file_mb(db, payload.max_mb)
    return await _file_limit(db)


async def _external(db) -> ExternalUrlOut:
    stored, env = await public_url.stored_url(db), public_url.env_url()
    return ExternalUrlOut(external_url=stored or None, env_url=env or None, effective=(stored or env) or None)


@router.get("/external-url", response_model=ExternalUrlOut)
async def get_external_url(user: CurrentUser, db: DB) -> ExternalUrlOut:
    return await _external(db)


@router.put("/external-url", response_model=ExternalUrlOut)
async def set_external_url(payload: ExternalUrlIn, admin: ServerAdmin, db: DB) -> ExternalUrlOut:
    """The server's address on the internet: share, guest, invitation and calendar links point here."""
    url = public_url.normalise(payload.external_url or "")
    setting = (await db.execute(select(AppSetting).where(AppSetting.key == public_url.KEY))).scalar_one_or_none()
    if url:
        if setting is None:
            db.add(AppSetting(key=public_url.KEY, value=url))
        else:
            setting.value = url
    elif setting:
        await db.delete(setting)
    await db.commit()
    return await _external(db)


@router.get("/qr")
async def get_qr_code(admin: AdminUser, db: DB) -> StreamingResponse:
    """Generate a QR code SVG for the external_url."""
    url = await public_url.configured_url(db)
    if not url:
        raise HTTPException(status_code=404, detail="external_url not configured")

    import io
    import qrcode
    import qrcode.image.svg

    factory = qrcode.image.svg.SvgPathImage
    qr = qrcode.make(url, image_factory=factory, box_size=10)
    buf = io.BytesIO()
    qr.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/svg+xml")


class RecipeSearchIn(BaseModel):
    # The server's SearXNG, e.g. http://192.168.1.10:8888; None turns the search off.
    url: str | None = Field(default=None, max_length=300, pattern=r"^https?://\S+$")


@router.get("/integrations/recipe-search")
async def get_recipe_search(admin: ServerAdmin, db: DB) -> dict:
    # bundled: the SearXNG installed with the server (2.8.4), turned on with one click.
    return {"url": await recipe_search.get_url(db), "bundled": get_settings().searxng_url.rstrip("/") or None}


@router.get("/integrations/hosted-smarthome")
async def get_hosted_smarthome(admin: ServerAdmin, db: DB) -> dict:
    from app.services.smarthome_conn import hosted_allowed

    return {"allowed": await hosted_allowed(db)}


@router.put("/integrations/hosted-smarthome")
async def put_hosted_smarthome(payload: dict, admin: ServerAdmin, db: DB) -> dict:
    """Whether hosted families may bring their Home Assistant through the gateway. Off also closes the
    gateways they have open."""
    from sqlalchemy import select as _select

    from app.models import SmarthomeConnection
    from app.services import gateway
    from app.services.smarthome_conn import set_hosted_allowed

    allowed = bool(payload.get("allowed"))
    await set_hosted_allowed(db, allowed)
    if not allowed:
        rows = (await db.execute(_select(SmarthomeConnection).join(Family, Family.id == SmarthomeConnection.family_id).where(Family.kind == "hosted"))).scalars().all()
        for conn in rows:
            await gateway.disconnect(conn.id)
    return {"allowed": allowed}


@router.get("/integrations/recipe-search/health")
async def recipe_search_health(admin: ServerAdmin, db: DB) -> dict:
    """Version and state of the search engine in use (or the bundled one when it's off)."""
    url = await recipe_search.get_url(db)
    if url:
        return await recipe_search.health(url)
    bundled = get_settings().searxng_url.rstrip("/")
    if not bundled:
        return {"ok": False, "version": None, "hits": None, "unresponsive": [], "error": None}
    return await recipe_search.health(bundled, test_search=False)


@router.put("/integrations/recipe-search")
async def set_recipe_search(payload: RecipeSearchIn, admin: ServerAdmin, db: DB) -> dict:
    """Saved only when a test search works."""
    if payload.url:
        try:
            await recipe_search.search(payload.url, "pancakes", "en")
        except recipe_search.RecipeSearchError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    await recipe_search.set_url(db, payload.url.rstrip("/") if payload.url else None)
    return await get_recipe_search(admin, db)


class PlacesIn(BaseModel):
    enabled: bool = True
    # A Photon of the server's own; empty = komoot's public one.
    url: str | None = Field(default=None, max_length=300, pattern=r"^$|^https?://[^\s]+$")


@router.get("/integrations/places")
async def get_places(admin: ServerAdmin, db: DB) -> dict:
    """Address suggestions from OpenStreetMap: on or off, and through which Photon."""
    return {**await places.settings(db), "default_url": places.DEFAULT_URL}


@router.put("/integrations/places")
async def set_places(payload: PlacesIn, admin: ServerAdmin, db: DB) -> dict:
    return {**await places.save(db, payload.enabled, payload.url), "default_url": places.DEFAULT_URL}


class EmailIn(BaseModel):
    # Gmail and Brevo have their server already; only "smtp" takes one.
    host: str = Field(default="", max_length=200)
    port: int = Field(default=587, ge=1, le=65535)
    security: str = Field(default="starttls", pattern=r"^(starttls|ssl|none)$")
    username: str = Field(default="", max_length=200)
    # Left out (or empty) when changing other settings: the saved password stays.
    password: str | None = Field(default=None, max_length=300)
    sender: str = Field(default="", max_length=254, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    sender_name: str = Field(default="", max_length=120)


class EmailUseIn(BaseModel):
    owner: str = Field(default="", pattern=r"^(|gmail|brevo|smtp)$")
    hosted: str = Field(default="", pattern=r"^(|gmail|brevo|smtp)$")


class EmailTestIn(BaseModel):
    provider: str = Field(pattern=r"^(gmail|brevo|smtp)$")
    to: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email_out(value: dict) -> dict:
    accounts = {}
    for provider in mailer.PROVIDERS:
        conf = mailer.account(value, provider)
        accounts[provider] = {"configured": False} if conf is None else {
            "configured": True, **{k: conf.get(k) for k in ("host", "port", "security", "username", "sender", "sender_name")}, "has_password": bool(conf.get("password")),
        }
    return {"accounts": accounts, "owner": value["owner"], "hosted": value["hosted"]}


@router.get("/integrations/email")
async def get_email(admin: ServerAdmin, db: DB) -> dict:
    """The server's mail services and who sends with which – never a password."""
    return _email_out(await mailer.load(db))


@router.put("/integrations/email/{provider}")
async def set_email(provider: str, payload: EmailIn, admin: ServerAdmin, db: DB) -> dict:
    """Set up Gmail (the address and an app password), Brevo (the SMTP login, its key and a
    verified sender) or another SMTP server."""
    if provider not in mailer.PROVIDERS:
        raise HTTPException(status_code=404, detail="Not found")
    value = await mailer.load(db)
    old = value["accounts"].get(provider) or {}
    conf = payload.model_dump()
    if provider == "gmail":
        conf["sender"] = conf["username"]  # Gmail sends as the account itself
        if "@" not in conf["sender"]:
            raise HTTPException(status_code=422, detail="The Gmail address is needed")
    if not conf.get("password"):
        conf["password"] = old.get("password", "")
    if provider == "smtp" and not conf["host"].strip():
        raise HTTPException(status_code=422, detail="The SMTP server is missing")
    if not conf["sender"] or (provider != "smtp" and not (conf["username"] and conf["password"])):
        raise HTTPException(status_code=422, detail="The address and password are needed")
    value["accounts"][provider] = {k: v for k, v in conf.items() if provider == "smtp" or k not in ("host", "port", "security")}
    # The first service set up is the one the server's own family sends with.
    if not value["owner"]:
        value["owner"] = provider
    await mailer.store(db, value)
    return _email_out(value)


@router.delete("/integrations/email/{provider}")
async def delete_email(provider: str, admin: ServerAdmin, db: DB) -> dict:
    value = await mailer.load(db)
    value["accounts"].pop(provider, None)
    for who in ("owner", "hosted"):
        if value[who] == provider:
            value[who] = ""
    await mailer.store(db, value)
    return _email_out(value)


@router.put("/integrations/email-use")
async def set_email_use(payload: EmailUseIn, admin: ServerAdmin, db: DB) -> dict:
    """Which service the family running the server sends with, and which – if any – the hosted
    families may use (none: they can't send mail)."""
    value = await mailer.load(db)
    for who in ("owner", "hosted"):
        chosen = getattr(payload, who)
        if chosen and chosen not in value["accounts"]:
            raise HTTPException(status_code=422, detail="That service isn't set up")
        value[who] = chosen
    await mailer.store(db, value)
    return _email_out(value)


@router.post("/integrations/email/test")
async def test_email(payload: EmailTestIn, admin: ServerAdmin, db: DB) -> dict:
    """Send a test mail through one service – the error from the mail server if it doesn't go."""
    conf = mailer.account(await mailer.load(db), payload.provider)
    if conf is None:
        raise HTTPException(status_code=422, detail="That service isn't set up")
    try:
        await mailer.send_with(conf, payload.to, "Smooth Family – test", "This is a test from your Smooth Family server. E-mail works.")
    except mailer.MailError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't send: {exc}") from exc
    return {"sent": True}

@router.get("/integrations/transit", response_model=list[TransitKeyOut])
async def get_transit_keys(admin: ServerAdmin, db: DB) -> list[TransitKeyOut]:
    """The departure providers and which have a key (the keys themselves are never sent back)."""
    have = await transit.keys(db)
    return [TransitKeyOut(id=pid, name=name, area=area, key=need, configured=bool(have.get(pid)), signup=signup) for pid, (name, area, need, signup) in transit.PROVIDERS.items()]


@router.put("/integrations/transit", response_model=list[TransitKeyOut])
async def set_transit_key(payload: TransitKeyIn, admin: ServerAdmin, db: DB) -> list[TransitKeyOut]:
    """Add, change or remove one provider's key (stored encrypted)."""
    if payload.provider not in transit.PROVIDERS or transit.PROVIDERS[payload.provider][2] == "none":
        raise HTTPException(status_code=422, detail="That provider takes no key")
    key = (payload.api_key or "").strip()
    if key and len(key) < 8:
        raise HTTPException(status_code=422, detail="That doesn't look like a key")
    await transit.set_key(db, payload.provider, key or None)
    return await get_transit_keys(admin, db)


@router.get("/integrations/giphy", response_model=GiphySettingOut)
async def get_giphy(admin: ServerAdmin, db: DB) -> GiphySettingOut:
    return GiphySettingOut(configured=await giphy.get_api_key(db) is not None)


@router.put("/integrations/giphy", response_model=GiphySettingOut)
async def set_giphy(payload: GiphySettingIn, admin: ServerAdmin, db: DB) -> GiphySettingOut:
    """Opt in to GIF search with the family's own GIPHY key (stored encrypted)."""
    encrypted = encrypt_token(payload.api_key.strip())
    setting = (await db.execute(select(AppSetting).where(AppSetting.key == giphy.SETTING_KEY))).scalar_one_or_none()
    if setting is None:
        db.add(AppSetting(key=giphy.SETTING_KEY, value=encrypted))
    else:
        setting.value = encrypted
    await db.commit()
    return GiphySettingOut(configured=True)


@router.delete("/integrations/giphy", response_model=GiphySettingOut)
async def delete_giphy(admin: ServerAdmin, db: DB) -> GiphySettingOut:
    setting = (await db.execute(select(AppSetting).where(AppSetting.key == giphy.SETTING_KEY))).scalar_one_or_none()
    if setting is not None:
        await db.delete(setting)
        await db.commit()
    return GiphySettingOut(configured=False)
