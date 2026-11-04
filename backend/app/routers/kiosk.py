"""Kitchen display / kiosk mode (#50).

The admin makes a screen link (shown once, with a QR code) for a tablet on the wall. The screen
needs no account: it shows the family's day – calendar with who drives, who's home (adults only;
children's presence is for the adults), weather, today's tasks and turns, waste, school lunch,
electricity price – and can press the family's shared flow buttons and open the emergency cards.
If the admin allows it, a screen in the kitchen can also scan groceries into the pantry and take
stock (#69), and children in the little ones' mode can tap their face to see and tick off their
routines – several children on the same family tablet (2.5.5).
3.0.4: the week's meals and the recipe book with the cooking mode, the smart home devices the admin
chose for the screen, and the screen's own language, theme and night.
Never chat, money, documents or anything private. The admin can revoke a screen at any time.
"""
import hashlib
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.services.public_url import public_base
from app.deps import DB, FamilyManager
from app.models import Album, ExposedDevice, Family, KioskScreen, Meal, MealIngredient, MealPlan, PantryItem, MediaItem, Recipe, RecipeIngredient, SmarthomeFlow, Task, TaskCompletion, User
from app.routers import easy
from app.routers.emergency import EmergencyOut, emergency_cards
from app.routers.pantry import ScanResult, scan_result
from app.routers.smarthome import ActionIn, DeviceStateOut, device_states, run_action
from app.routers.presence import family_presence
from app.schemas import EventOut
from app.services import electricity as el
from app.services import health, holidays, school_ha
from app.services import flows as flow_engine
from app.services import login_throttle, rotation
from app.services import security_log
from app.services import pantry_scan as scan
from app.services.birthdays import birthdays_between
from app.services.calendar_view import events_between, utc
from app.services.memories import slideshow
from app.services.mfa import qr_svg
from app.services.storage import get_storage
from app.services.schedule import due_today
from app.services.today_cards import family_pickups, school_lunch
from app.services.weather import forecast, summary

router = APIRouter(prefix="/api", tags=["kiosk"])


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# What a kitchen display can show (2.8.2); each screen picks its own.
WIDGETS = ("calendar", "weather", "tasks", "food", "week", "recipes", "presence", "flows", "waste", "lunch", "electricity", "emergency", "slideshow", "exercise", "school")
WidgetList = list[Literal["calendar", "weather", "tasks", "food", "week", "recipes", "presence", "flows", "waste", "lunch", "electricity", "emergency", "slideshow", "exercise", "school"]]
# A screen that never chose shows these; the week's meals, the recipe book (3.0.4) and the week's
# exercise (3.4.0) are chosen.
DEFAULT_WIDGETS = tuple(w for w in WIDGETS if w not in ("week", "recipes", "exercise", "school"))
# The colour themes a screen can wear (as the app's).
Theme = Literal["", "forest", "ocean", "sunset", "lavender", "midnight", "sand", "berry", "citrus", "aurora"]
# A screen on the wall never opens a lock.
KIOSK_DOMAINS = {"light", "switch", "fan", "cover", "climate", "scene", "script", "media_player", "vacuum"}
# The screen's language (3.0.4): one of the app's, or "" for the family admin's.
ScreenLanguage = Literal["", "en", "sv", "nb", "da", "fi"]

# The screensaver (3.0.3): the family's photos, a flip clock, a calm clock with the weather, or dark;
# 3.0.4 adds the fox that plays out the weather outside.
Screensaver = Literal["photos", "flipclock", "calm", "fox", "dark"]


class ScreenIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    pantry_scan: bool = False
    easy_mode: bool = False
    widgets: WidgetList | None = None
    screensaver: Screensaver = "photos"
    idle_minutes: int = Field(default=5, ge=1, le=60)
    night_dim: bool = True
    night_from: int = Field(default=22, ge=0, le=23)
    night_to: int = Field(default=6, ge=0, le=23)
    language: ScreenLanguage = ""
    theme: Theme = ""
    fox_themes: bool = True


class ScreenChange(BaseModel):
    # Only what is sent changes.
    name: str | None = Field(default=None, min_length=1, max_length=80)
    pantry_scan: bool | None = None
    easy_mode: bool | None = None
    widgets: WidgetList | None = None
    screensaver: Screensaver | None = None
    idle_minutes: int | None = Field(default=None, ge=1, le=60)
    night_dim: bool | None = None
    night_from: int | None = Field(default=None, ge=0, le=23)
    night_to: int | None = Field(default=None, ge=0, le=23)
    language: ScreenLanguage | None = None
    theme: Theme | None = None
    fox_themes: bool | None = None
    devices: list[uuid.UUID] | None = Field(default=None, max_length=40)


class ScreenOut(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    last_seen_at: datetime | None
    revoked_at: datetime | None
    pantry_scan: bool = False
    easy_mode: bool = False
    widgets: list[str] = list(WIDGETS)
    screensaver: str = "photos"
    idle_minutes: int = 5
    night_dim: bool = True
    night_from: int = 22
    night_to: int = 6
    # "" = the family admin's.
    language: str = ""
    theme: str = ""
    fox_themes: bool = True
    devices: list[uuid.UUID] = []


class ScreenCreated(ScreenOut):
    url: str
    qr_svg: str


class KioskTask(BaseModel):
    # Tapped on the screen: who did it (3.0.3).
    id: uuid.UUID | None = None
    title: str
    who: str | None
    color: str | None
    done: bool
    points: int = 0
    shared: bool = False
    assignee_id: uuid.UUID | None = None


class KioskFlow(BaseModel):
    id: uuid.UUID
    name: str


class KioskView(BaseModel):
    family_name: str
    language: str
    events: list[EventOut]
    members: list[dict]
    presence: list[dict]
    weather: dict | None
    tasks: list[KioskTask]
    turns: list[dict]
    waste: list[dict]
    lunch: list[dict]
    flows: list[KioskFlow]
    electricity: dict | None
    pantry_scan: bool = False
    easy_mode: bool = False
    widgets: list[str] = list(WIDGETS)
    # Today's and tomorrow's dinner from the meal plan (3.0.3).
    meals: list[dict] = []
    screensaver: str = "photos"
    idle_minutes: int = 5
    night_dim: bool = True
    night_from: int = 22
    night_to: int = 6
    theme: str = ""
    # 3.0.4: the week's dinners (the cooking mode where there's a recipe) and the screen's devices.
    week: list[dict] = []
    devices: list[DeviceStateOut] = []
    # 3.4.0: what the fox dresses up for today ("" = nothing, or the screen has it off) and whose
    # birthday it is – first names, the people the family keeps birthdays for.
    fox_theme: str = ""
    birthdays: list[str] = []
    # 3.4.0: this week's exercise – only of those who share their workouts with the family – and the
    # family's goals running now.
    exercise: dict | None = None
    # 3.4.0: each child's school day from Home Assistant – the day, PE, the after-school hours and
    # what's next; never absence or letters (the screen is for everyone in the kitchen).
    school: list[dict] = []


def _night(screen: KioskScreen) -> dict:
    return {
        "night_dim": screen.night_dim is not False,
        "night_from": 22 if screen.night_from is None else screen.night_from,
        "night_to": 6 if screen.night_to is None else screen.night_to,
    }


def _out(screen: KioskScreen) -> ScreenOut:
    return ScreenOut(
        id=screen.id, name=screen.name, created_at=screen.created_at, last_seen_at=screen.last_seen_at, revoked_at=screen.revoked_at,
        pantry_scan=bool(screen.pantry_scan), easy_mode=bool(screen.easy_mode), widgets=shows(screen),
        screensaver=screen.screensaver or "photos", idle_minutes=screen.idle_minutes or 5, **_night(screen),
        language=screen.language or "", theme=screen.theme or "", fox_themes=screen.fox_themes is not False, devices=screen.devices or [],
    )


# --- Family admin ---------------------------------------------------------------------------


@router.get("/kiosks", response_model=list[ScreenOut])
async def list_screens(admin: FamilyManager, db: DB) -> list[ScreenOut]:
    rows = (await db.execute(select(KioskScreen).where(KioskScreen.family_id == admin.family_id).order_by(KioskScreen.created_at.desc()))).scalars().all()
    return [_out(r) for r in rows]


@router.post("/kiosks", response_model=ScreenCreated, status_code=status.HTTP_201_CREATED)
async def create_screen(payload: ScreenIn, request: Request, admin: FamilyManager, db: DB) -> ScreenCreated:
    token = secrets.token_urlsafe(24)
    screen = KioskScreen(family_id=admin.family_id, name=payload.name.strip(), token_hash=_hash(token), pantry_scan=payload.pantry_scan, easy_mode=payload.easy_mode, screensaver=payload.screensaver, idle_minutes=payload.idle_minutes, night_dim=payload.night_dim, night_from=payload.night_from, night_to=payload.night_to, language=payload.language or None, theme=payload.theme or None, fox_themes=payload.fox_themes, created_by=admin.id, created_at=datetime.now(timezone.utc))
    db.add(screen)
    await db.commit()
    base = await public_base(db, request)
    url = f"{base}/kiosk/{token}"
    return ScreenCreated(**_out(screen).model_dump(), url=url, qr_svg=qr_svg(url))


@router.delete("/kiosks/{screen_id}", response_model=ScreenOut)
async def revoke_screen(screen_id: uuid.UUID, admin: FamilyManager, db: DB) -> ScreenOut:
    screen = await db.get(KioskScreen, screen_id)
    if screen is None or screen.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Screen not found")
    screen.revoked_at = screen.revoked_at or datetime.now(timezone.utc)
    await db.commit()
    return _out(screen)


@router.put("/kiosks/{screen_id}", response_model=ScreenOut)
async def change_screen(screen_id: uuid.UUID, payload: ScreenChange, admin: FamilyManager, db: DB) -> ScreenOut:
    screen = await db.get(KioskScreen, screen_id)
    if screen is None or screen.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Screen not found")
    if payload.name is not None and payload.name.strip():
        screen.name = payload.name.strip()
    if payload.pantry_scan is not None:
        screen.pantry_scan = payload.pantry_scan
    if payload.easy_mode is not None:
        screen.easy_mode = payload.easy_mode
    if payload.widgets is not None:
        screen.widgets = [w for w in WIDGETS if w in payload.widgets]
    if payload.screensaver is not None:
        screen.screensaver = payload.screensaver
    if payload.idle_minutes is not None:
        screen.idle_minutes = payload.idle_minutes
    for field in ("night_dim", "night_from", "night_to"):
        if getattr(payload, field) is not None:
            setattr(screen, field, getattr(payload, field))
    if payload.language is not None:
        screen.language = payload.language or None
    if payload.theme is not None:
        screen.theme = payload.theme or None
    if payload.fox_themes is not None:
        screen.fox_themes = payload.fox_themes
    if payload.devices is not None:
        # Only the family's own devices, and never a lock.
        mine = (await db.execute(select(ExposedDevice).where(ExposedDevice.family_id == admin.family_id))).scalars().all()
        allowed = {d.id for d in mine if d.domain in KIOSK_DOMAINS}
        screen.devices = [str(d) for d in payload.devices if d in allowed] or None
    await db.commit()
    return _out(screen)


@router.post("/kiosks/{screen_id}/link", response_model=ScreenCreated)
async def new_link(screen_id: uuid.UUID, request: Request, admin: FamilyManager, db: DB) -> ScreenCreated:
    """A new link for a screen whose link is lost (or a tablet that moved on): the old one stops working,
    the screen keeps its settings."""
    screen = await db.get(KioskScreen, screen_id)
    if screen is None or screen.family_id != admin.family_id or screen.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Screen not found")
    token = secrets.token_urlsafe(24)
    screen.token_hash = _hash(token)
    screen.last_seen_at = None
    await db.commit()
    base = await public_base(db, request)
    url = f"{base}/kiosk/{token}"
    return ScreenCreated(**_out(screen).model_dump(), url=url, qr_svg=qr_svg(url))


# --- The screen itself ----------------------------------------------------------------------


async def _open(db, token: str, request: Request) -> tuple[KioskScreen, Family]:
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    screen = (await db.execute(select(KioskScreen).where(KioskScreen.token_hash == _hash(token)))).scalar_one_or_none()
    family = await db.get(Family, screen.family_id) if screen else None
    if screen is None or screen.revoked_at is not None or family is None or family.status != "active":
        login_throttle.record_ip_failure(ip)
        await security_log.record(db, "link_invalid", ip=ip, detail="kiosk")
        raise HTTPException(status_code=404, detail="This screen isn't connected any more")
    screen.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return screen, family


async def _shared_buttons(db, family_id: uuid.UUID) -> list[SmarthomeFlow]:
    return list(
        (
            await db.execute(
                select(SmarthomeFlow).where(
                    SmarthomeFlow.family_id == family_id, SmarthomeFlow.shared == True, SmarthomeFlow.on_today == True,  # noqa: E712
                    SmarthomeFlow.enabled == True, SmarthomeFlow.approved == True,  # noqa: E712
                ).order_by(SmarthomeFlow.created_at)
            )
        ).scalars().all()
    )


def shows(screen: KioskScreen) -> list[str]:
    return list(DEFAULT_WIDGETS) if screen.widgets is None else [w for w in WIDGETS if w in screen.widgets]


async def _screen_devices(db, screen: KioskScreen) -> list[ExposedDevice]:
    ids = {uuid.UUID(str(i)) for i in screen.devices or []}
    if not ids:
        return []
    rows = (await db.execute(select(ExposedDevice).where(ExposedDevice.family_id == screen.family_id).order_by(ExposedDevice.position))).scalars().all()
    return [d for d in rows if d.id in ids and d.domain in KIOSK_DOMAINS]


@router.get("/kiosk/{token}", response_model=KioskView)
async def kiosk_view(token: str, request: Request, db: DB) -> KioskView:
    screen, family = await _open(db, token, request)
    # The app version the screen runs (3.1.0), for the family's overview of its devices.
    version = (request.headers.get("x-sf-app") or "")[:40]
    if version and version != screen.app_version:
        screen.app_version = version
        await db.commit()
    # Only what the screen shows is read – and sent.
    on = set(shows(screen))
    members = (await db.execute(select(User).where(User.family_id == family.id).order_by(User.created_at))).scalars().all()
    names = {m.id: m for m in members}
    admin = next((m for m in members if m.role == "admin"), members[0] if members else None)
    language = screen.language or (admin.language if admin else None) or "en"
    now = datetime.now(timezone.utc)
    local = now.astimezone(el._zone())
    today = local.date()

    # Read as someone who sees only what is shared with the whole family.
    viewer = SimpleNamespace(id=uuid.uuid4(), family_id=family.id, role="child", apps=["calendar", "birthdays"], language=language, ha_person_entity=None, presence_share="off")
    # From yesterday: the calendar's days are UTC, and what began after local midnight but before
    # UTC midnight is today's too (the screen only shows what hasn't ended).
    events = [e for e in await events_between(db, viewer, today - timedelta(days=1), today + timedelta(days=2)) if not e.busy and utc(e.end) > now] if "calendar" in on else []
    presence = []
    if "presence" in on and (family.kind or "owner") in ("owner", "demo"):
        try:
            presence = [m.model_dump(mode="json") for m in (await family_presence(db, viewer)).members]
        except Exception:
            presence = []

    weather = None
    if "weather" in on and family.weather_lat is not None and family.weather_lon is not None:
        try:
            info = summary(await forecast(family.weather_lat, family.weather_lon))
            weather = {"place": family.weather_place, **info}
        except Exception:
            weather = None

    tasks_rows = (await db.execute(select(Task).where(Task.family_id == family.id, Task.active == True))).scalars().all() if "tasks" in on else []  # noqa: E712
    done = {
        c.task_id
        for c in (await db.execute(select(TaskCompletion).where(TaskCompletion.family_id == family.id, TaskCompletion.completed_date == today, TaskCompletion.status != "rejected"))).scalars()
    }
    from app.routers.custody import away_today

    away = await away_today(db, family.id, today)
    tasks, turns = [], []
    for task in tasks_rows:
        who = names.get(task.assignee_id)
        if (due_today(task, today) and task.assignee_id not in away) or task.id in done:
            tasks.append(
                KioskTask(
                    id=task.id, title=task.title, who=who.display_name if who else None, color=who.color if who else None, done=task.id in done,
                    points=task.points, shared=bool(task.shared), assignee_id=task.assignee_id,
                )
            )
        if rotation.rotating(task):
            turn = names.get(rotation.turn_on(task, today) if task.rotation_mode == "weekly" else task.assignee_id)
            turns.append({"title": task.title, "who": turn.display_name if turn else None, "color": turn.color if turn else None})
    tasks.sort(key=lambda t: (t.done, t.who or "", t.title.casefold()))

    try:
        waste = [{"date": p["date"].isoformat(), "title": p["title"]} for p in (await family_pickups(db, family, today, 7))[:4]] if "waste" in on else []
    except Exception:
        waste = []
    lunch = []
    for child in [m for m in members if m.school and "lunch" in on]:
        try:
            menu = await school_lunch(child.school, today)
            dishes = next((d["dishes"] for d in menu["days"] if d["date"] >= today), [])
            lunch.append({"name": child.display_name, "dishes": dishes[:2]})
        except Exception:
            continue

    electricity = None
    if "electricity" in on and family.electricity_area:
        try:
            hours = await el.today(family.electricity_area, now)
            current = el.hour_of(hours, now)
            ahead = [h for h in hours if h["start"].astimezone(timezone.utc) + timedelta(hours=1) > now]
            electricity = {
                "area": family.electricity_area,
                "now": current["ore"] if current else None,
                "cheapest": [h.isoformat() for h in sorted(el.cheapest(ahead, 3))],
            }
        except Exception:
            electricity = None

    meals = []
    if "food" in on:
        for offset in (0, 1):
            day = today + timedelta(days=offset)
            week = day - timedelta(days=day.weekday())
            row = (
                await db.execute(
                    select(Meal.name, Meal.id, Meal.steps).join(MealPlan, MealPlan.id == Meal.meal_plan_id).where(
                        Meal.family_id == family.id, MealPlan.week_start == week, Meal.weekday == day.weekday(), Meal.slot == "dinner"
                    )
                )
            ).first()
            if row:
                meals.append({"date": day.isoformat(), "name": row[0], "meal_id": str(row[1]), "cook": bool(row[2])})

    # The week's dinners, Monday to Sunday (3.0.4).
    week_meals = []
    if "week" in on:
        monday = today - timedelta(days=today.weekday())
        rows = (
            await db.execute(
                select(Meal).join(MealPlan, MealPlan.id == Meal.meal_plan_id).where(Meal.family_id == family.id, MealPlan.week_start == monday, Meal.slot == "dinner").order_by(Meal.weekday)
            )
        ).scalars().all()
        week_meals = [{"date": (monday + timedelta(days=m.weekday)).isoformat(), "name": m.name, "meal_id": str(m.id), "cook": bool(m.steps)} for m in rows]

    devices = await device_states(db, family.id, await _screen_devices(db, screen)) if screen.devices else []

    exercise = None
    if "exercise" in on:
        monday = today - timedelta(days=today.weekday())
        people = [p for p in await health.family_exercise(db, family.id, monday, today) if p["workouts"]]
        exercise = {
            "people": [{"name": p["name"], "color": p["color"], "minutes": p["minutes"], "workouts": p["workouts"]} for p in sorted(people, key=lambda p: -p["minutes"])],
            "goals": [{"title": g["title"], "metric": g["metric"], "target": g["target"], "progress": g["progress"]} for g in await health.current_goals(db, family.id, today)],
        }

    school = []
    if "school" in on:
        kids = [k for k in (await db.execute(select(User).where(User.family_id == family.id, User.school_sources.is_not(None)).order_by(User.created_at))).scalars() if k.school_sources]
        if kids:
            try:
                states = await school_ha.states_for(db, family.id)
            except Exception:
                states = {}
            for kid in kids:
                facts = school_ha.day_of((kid.school_sources or {}).get("roles", {}), states)
                school.append({"name": kid.display_name, "color": kid.color, **{k: facts[k] for k in ("school_day", "pe", "leisure_today", "next_event", "assignments")}})

    # The fox's dress (3.4.0), only for a screen that shows it.
    fox_theme, birthdays = "", []
    if screen.screensaver == "fox" and screen.fox_themes is not False:
        fox_theme = holidays.fox_theme(today, family.holiday_country or holidays.BY_LANGUAGE.get(language))
        birthdays = [(p.name.split() or [p.name])[0] for p, _ in await birthdays_between(db, family.id, today, today + timedelta(days=1))]

    return KioskView(
        family_name=family.name,
        language=language,
        events=events,
        members=[{"id": str(m.id), "name": m.display_name, "color": m.color} for m in members],
        presence=presence,
        weather=weather,
        tasks=tasks,
        turns=turns,
        waste=waste,
        lunch=lunch,
        flows=[KioskFlow(id=f.id, name=f.name) for f in await _shared_buttons(db, family.id)] if "flows" in on else [],
        electricity=electricity,
        pantry_scan=bool(screen.pantry_scan),
        easy_mode=bool(screen.easy_mode),
        widgets=sorted(on, key=WIDGETS.index),
        meals=meals,
        screensaver=screen.screensaver or "photos",
        idle_minutes=screen.idle_minutes or 5,
        **_night(screen),
        theme=screen.theme or "",
        week=week_meals,
        devices=devices,
        fox_theme=fox_theme,
        birthdays=birthdays,
        exercise=exercise,
        school=school,
    )


# --- The week's meals, the recipe book and the cooking mode (3.0.4) ---------------------------------


class CookOut(BaseModel):
    name: str
    servings: int
    ingredients: list[dict]
    steps: list[str]


class KioskRecipe(BaseModel):
    id: uuid.UUID
    name: str
    category: str
    favorite: bool
    photo: bool


async def _showing(db, token: str, request: Request, widget: str) -> tuple[KioskScreen, Family]:
    screen, family = await _open(db, token, request)
    if widget not in shows(screen):
        raise HTTPException(status_code=404, detail="Not on this screen")
    return screen, family


def _ingredients(rows) -> list[dict]:
    return [{"name": i.name, "amount": i.amount, "unit": i.unit} for i in rows]


@router.get("/kiosk/{token}/meals/{meal_id}", response_model=CookOut)
async def kiosk_meal(token: str, meal_id: uuid.UUID, request: Request, db: DB) -> CookOut:
    screen, family = await _open(db, token, request)
    if not {"food", "week"} & set(shows(screen)):
        raise HTTPException(status_code=404, detail="Not on this screen")
    meal = await db.get(Meal, meal_id)
    if meal is None or meal.family_id != family.id:
        raise HTTPException(status_code=404, detail="Meal not found")
    rows = (await db.execute(select(MealIngredient).where(MealIngredient.meal_id == meal.id))).scalars().all()
    return CookOut(name=meal.name, servings=meal.servings, ingredients=_ingredients(rows), steps=meal.steps or [])


@router.get("/kiosk/{token}/recipes", response_model=list[KioskRecipe])
async def kiosk_recipes(token: str, request: Request, db: DB) -> list[KioskRecipe]:
    _, family = await _showing(db, token, request, "recipes")
    rows = (await db.execute(select(Recipe).where(Recipe.family_id == family.id).order_by(Recipe.favorite.desc(), Recipe.name))).scalars().all()
    return [KioskRecipe(id=r.id, name=r.name, category=r.category or "", favorite=bool(r.favorite), photo=bool(r.photo_key)) for r in rows]


@router.get("/kiosk/{token}/recipes/{recipe_id}", response_model=CookOut)
async def kiosk_recipe(token: str, recipe_id: uuid.UUID, request: Request, db: DB) -> CookOut:
    _, family = await _showing(db, token, request, "recipes")
    recipe = await db.get(Recipe, recipe_id)
    if recipe is None or recipe.family_id != family.id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    rows = (await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))).scalars().all()
    return CookOut(name=recipe.name, servings=recipe.servings, ingredients=_ingredients(rows), steps=recipe.steps or [])


@router.get("/kiosk/{token}/recipes/{recipe_id}/photo")
async def kiosk_recipe_photo(token: str, recipe_id: uuid.UUID, request: Request, db: DB) -> Response:
    _, family = await _showing(db, token, request, "recipes")
    recipe = await db.get(Recipe, recipe_id)
    if recipe is None or recipe.family_id != family.id or not recipe.photo_key:
        raise HTTPException(status_code=404, detail="Recipe photo not found")
    with open(get_storage().open(family.id, recipe.photo_key), "rb") as f:
        return Response(f.read(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


# --- The smart home devices the admin chose for the screen (3.0.4) ----------------------------------


@router.get("/kiosk/{token}/devices", response_model=list[DeviceStateOut])
async def kiosk_devices(token: str, request: Request, db: DB) -> list[DeviceStateOut]:
    screen, family = await _open(db, token, request)
    return await device_states(db, family.id, await _screen_devices(db, screen))


@router.post("/kiosk/{token}/devices/{device_id}/action")
async def kiosk_device_action(token: str, device_id: uuid.UUID, body: ActionIn, request: Request, db: DB) -> dict:
    screen, _ = await _open(db, token, request)
    device = next((d for d in await _screen_devices(db, screen) if d.id == device_id), None)
    if device is None:
        raise HTTPException(status_code=404, detail="Not on this screen")
    return await run_action(db, device, body)


class TaskDoneIn(BaseModel):
    # Who did it – several only for a task done together (its points are shared).
    user_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)


@router.post("/kiosk/{token}/tasks/{task_id}/done", response_model=KioskTask)
async def kiosk_task_done(token: str, task_id: uuid.UUID, payload: TaskDoneIn, request: Request, db: DB) -> KioskTask:
    """A task ticked off on the kitchen display, by whoever says they did it (3.0.3). Children's
    points still wait for an adult when the family wants that."""
    from app.routers.tasks import complete_for, others

    screen, family = await _open(db, token, request)
    if "tasks" not in shows(screen):
        raise HTTPException(status_code=404, detail="This screen doesn't show the tasks")
    task = await db.get(Task, task_id)
    today = datetime.now(timezone.utc).astimezone(el._zone()).date()
    if task is None or task.family_id != family.id or not task.active or not due_today(task, today):
        raise HTTPException(status_code=404, detail="Task not found")
    first = await db.get(User, payload.user_ids[0])
    if first is None or first.family_id != family.id:
        raise HTTPException(status_code=422, detail="Unknown family member")
    done = await complete_for(db, task, first, today, together=await others(db, task, first, payload.user_ids[1:]))
    who = await db.get(User, task.assignee_id) if task.assignee_id else None
    return KioskTask(
        id=task.id, title=task.title, who=who.display_name if who else None, color=who.color if who else None,
        done=done.completion_status in ("approved", "pending"), points=task.points, shared=bool(task.shared), assignee_id=task.assignee_id,
    )


@router.delete("/kiosk/{token}/tasks/{task_id}/done", status_code=status.HTTP_204_NO_CONTENT)
async def kiosk_task_undo(token: str, task_id: uuid.UUID, request: Request, db: DB) -> None:
    """Ticked off by mistake on the kitchen display (3.1.1) – not once an adult has approved it."""
    from app.routers.tasks import undo_for

    screen, family = await _open(db, token, request)
    if "tasks" not in shows(screen):
        raise HTTPException(status_code=404, detail="This screen doesn't show the tasks")
    task = await db.get(Task, task_id)
    if task is None or task.family_id != family.id:
        raise HTTPException(status_code=404, detail="Task not found")
    await undo_for(db, task, datetime.now(timezone.utc).astimezone(el._zone()).date(), None)


@router.get("/kiosk/{token}/emergency", response_model=EmergencyOut)
async def kiosk_emergency(token: str, request: Request, db: DB) -> EmergencyOut:
    screen, family = await _open(db, token, request)
    if "emergency" not in shows(screen):
        raise HTTPException(status_code=404, detail="Not shown on this screen")
    return await emergency_cards(db, family.id)


@router.post("/kiosk/{token}/flows/{flow_id}/run", status_code=status.HTTP_204_NO_CONTENT)
async def kiosk_run(token: str, flow_id: uuid.UUID, request: Request, db: DB) -> None:
    """Only the family's shared buttons can be pressed from the screen."""
    _, family = await _open(db, token, request)
    flow = next((f for f in await _shared_buttons(db, family.id) if f.id == flow_id), None)
    if flow is None:
        raise HTTPException(status_code=404, detail="Button not found")
    await flow_engine.start(db, flow, check=False)


# --- Slideshow when the screen is idle (#71) -----------------------------------------------


class SlidePhoto(BaseModel):
    id: uuid.UUID
    taken_at: datetime | None


@router.get("/kiosk/{token}/photos", response_model=list[SlidePhoto])
async def kiosk_photos(token: str, request: Request, db: DB) -> list[SlidePhoto]:
    """Memories from these days first, then the newest – only from the family's photo albums."""
    screen, family = await _open(db, token, request)
    if "slideshow" not in shows(screen):
        return []
    today = datetime.now(timezone.utc).astimezone(el._zone()).date()
    return [SlidePhoto(id=m.id, taken_at=m.taken_at) for m in await slideshow(db, family.id, today)]


@router.get("/kiosk/{token}/photos/{media_id}")
async def kiosk_photo(token: str, media_id: uuid.UUID, request: Request, db: DB) -> Response:
    screen, family = await _open(db, token, request)
    if "slideshow" not in shows(screen):
        raise HTTPException(status_code=404, detail="Not shown on this screen")
    item = await db.get(MediaItem, media_id)
    album = await db.get(Album, item.album_id) if item else None
    if item is None or item.family_id != family.id or album is None or album.kind != "user" or item.kind != "image":
        raise HTTPException(status_code=404, detail="Photo not found")
    storage = get_storage()
    key = item.storage_key.rsplit(".", 1)[0] + "_web.jpg"
    if not storage.exists(family.id, key):
        key = item.storage_key
    return Response(content=storage.open(family.id, key).read_bytes(), media_type="image/jpeg" if key.endswith(".jpg") else item.content_type, headers={"Cache-Control": "private, max-age=3600"})


# --- Scanning into the pantry from the kitchen (#69) ---------------------------------------


async def _pantry_screen(db, token: str, request: Request) -> tuple[KioskScreen, Family, str]:
    screen, family = await _open(db, token, request)
    if not screen.pantry_scan:
        raise HTTPException(status_code=403, detail="This screen may not scan into the pantry")
    admin = (await db.execute(select(User).where(User.family_id == family.id, User.role == "admin").order_by(User.created_at))).scalars().first()
    return screen, family, screen.language or (admin.language if admin else None) or "en"


@router.get("/kiosk/{token}/pantry/barcode/{code}", response_model=scan.ProductOut)
async def kiosk_barcode(token: str, code: str, request: Request, db: DB) -> scan.ProductOut:
    _, family, language = await _pantry_screen(db, token, request)
    try:
        return await scan.product(db, family, code, language)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/kiosk/{token}/pantry/scan", response_model=ScanResult)
async def kiosk_scan(token: str, payload: scan.ScanIn, request: Request, db: DB) -> ScanResult:
    _, family, _ = await _pantry_screen(db, token, request)
    today = datetime.now(timezone.utc).astimezone(el._zone()).date()
    try:
        changed, missing = await scan.apply_scan(db, family.id, None, payload, today)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return scan_result(changed, missing, today)


@router.delete("/kiosk/{token}/pantry/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def kiosk_pantry_gone(token: str, item_id: uuid.UUID, request: Request, db: DB) -> None:
    """Taking stock: something that wasn't found is gone."""
    _, family, _ = await _pantry_screen(db, token, request)
    item = await db.get(PantryItem, item_id)
    if item is None or item.family_id != family.id:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()


# --- The little ones' routines on the kitchen display (2.5.5) ------------------------------


class KioskEasyChild(BaseModel):
    id: uuid.UUID
    name: str
    color: str


async def _easy_screen(db, token: str, request: Request) -> Family:
    screen, family = await _open(db, token, request)
    if not screen.easy_mode:
        raise HTTPException(status_code=403, detail="This screen doesn't show the little ones' mode")
    return family


async def _easy_child(db, token: str, request: Request, user_id: uuid.UUID) -> User:
    family = await _easy_screen(db, token, request)
    child = await db.get(User, user_id)
    if child is None or child.family_id != family.id or not child.easy_mode:
        raise HTTPException(status_code=404, detail="Not found")
    return child


@router.get("/kiosk/{token}/easy", response_model=list[KioskEasyChild])
async def kiosk_easy_children(token: str, request: Request, db: DB) -> list[KioskEasyChild]:
    """The children in the little ones' mode: their faces, to tap and see their routine."""
    family = await _easy_screen(db, token, request)
    rows = (
        await db.execute(select(User).where(User.family_id == family.id, User.role == "child", User.easy_mode == True).order_by(User.created_at))  # noqa: E712
    ).scalars().all()
    return [KioskEasyChild(id=c.id, name=c.display_name, color=c.color) for c in rows]


@router.get("/kiosk/{token}/easy/{user_id}", response_model=easy.EasyDay)
async def kiosk_easy_day(token: str, user_id: uuid.UUID, request: Request, db: DB) -> easy.EasyDay:
    return await easy.easy_day(db, await _easy_child(db, token, request, user_id), date.today())


@router.post("/kiosk/{token}/easy/{user_id}/steps/{step_id}/done", response_model=easy.EasyDay)
async def kiosk_easy_step(token: str, user_id: uuid.UUID, step_id: uuid.UUID, request: Request, db: DB) -> easy.EasyDay:
    return await easy.step_done(db, await _easy_child(db, token, request, user_id), step_id, date.today())


@router.delete("/kiosk/{token}/easy/{user_id}/steps/{step_id}/done", response_model=easy.EasyDay)
async def kiosk_easy_unstep(token: str, user_id: uuid.UUID, step_id: uuid.UUID, request: Request, db: DB) -> easy.EasyDay:
    return await easy.step_undo(db, await _easy_child(db, token, request, user_id), step_id, date.today())


@router.post("/kiosk/{token}/easy/{user_id}/tasks/{task_id}/done", response_model=easy.EasyDay)
async def kiosk_easy_task(token: str, user_id: uuid.UUID, task_id: uuid.UUID, request: Request, db: DB) -> easy.EasyDay:
    return await easy.task_done(db, await _easy_child(db, token, request, user_id), task_id, date.today())
