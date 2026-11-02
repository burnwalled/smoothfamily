"""Local AI (#61): the queue for members, the family's choice, the server admin's settings, and the
little endpoint the sleep helper on the AI computer asks (docs/LOCAL_AI.md).

Members see only their own jobs. The server admin sees how many jobs wait, never their content.
"""
import io
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.services import quota
from app.services import recipe_search
from app.deps import CurrentUser, DB, FamilyManager, ServerAdmin
from app.models import AiJob, Family, ListItem, ListModel, MediaItem, PantryItem
from app.routers import property as homes
from app.routers import vehicles
from app.routers.meals import save_recipe
from app.schemas import RecipeCreate, RecipeOut
from app.services import ai
from app.services.storage import get_storage

router = APIRouter(prefix="/api", tags=["ai"])

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_IMAGE = 10 * 1024 * 1024


class StatusOut(BaseModel):
    # The family may use the AI (set up on the server, allowed and turned on).
    available: bool
    # The AI computer answered recently.
    online: bool
    last_online: datetime | None
    # Jobs waiting before a new one would run.
    waiting: int
    # Hosted families: the AI runs on the server owner's computer.
    hosted: bool


class JobIn(BaseModel):
    kind: Literal["recipe", "quick_add", "cook_ideas", "vehicle_receipt", "property_receipt", "meal_plan", "chores", "web_question", "receipt_info", "complaint_letter"]
    text: str = Field(default="", max_length=8000)
    list_id: uuid.UUID | None = None
    # A vehicle receipt: for which vehicle, and the photo already saved as the expense's receipt.
    vehicle_id: uuid.UUID | None = None
    property_id: uuid.UUID | None = None
    media_id: uuid.UUID | None = None
    # A receipt kept in the vault, to read (2.8.4).
    receipt_id: uuid.UUID | None = None
    # The week's dinners: which week, for how many, and what the family likes or avoids.
    week_start: date | None = None
    servings: int = Field(default=4, ge=1, le=20)
    preferences: str = Field(default="", max_length=500)


class ApplyMeals(BaseModel):
    # The weekdays (0 = Monday) to keep; the rest of the AI's week is left out.
    weekdays: list[int] = Field(min_length=1, max_length=7)


class ApplyChores(BaseModel):
    # Which suggestions to make into tasks (their place in the answer).
    keep: list[int] = Field(min_length=1, max_length=100)


class ApplyProperty(BaseModel):
    property_id: uuid.UUID
    expenses: list[homes.ExpenseIn] = Field(min_length=1, max_length=50)


class ApplyVehicle(BaseModel):
    vehicle_id: uuid.UUID
    expenses: list[vehicles.VehicleExpenseIn] = Field(min_length=1, max_length=50)


class JobOut(BaseModel):
    id: uuid.UUID
    kind: str
    status: str
    input: dict
    result: dict | None
    error: str | None
    created_at: datetime
    finished_at: datetime | None
    # Place in the queue (1 = next), while queued.
    position: int | None = None


class ReceiptLine(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    amount: float | None = Field(default=None, ge=0)
    unit: str = Field(default="", max_length=20)
    place: Literal["freezer", "fridge", "pantry"] = "pantry"
    best_before: date | None = None


class ApplyReceipt(BaseModel):
    items: list[ReceiptLine] = Field(max_length=200)


class ListLine(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: str | None = Field(default=None, max_length=20)


class ApplyList(BaseModel):
    list_id: uuid.UUID
    items: list[ListLine] = Field(max_length=100)


class FamilyAiIn(BaseModel):
    enabled: bool


class FamilyAiOut(BaseModel):
    enabled: bool
    # A hosted family can only turn it on when the server admin allows it.
    allowed: bool
    hosted: bool


class ConfigIn(BaseModel):
    url: str = Field(default="", max_length=300)
    text_model: str = Field(default="", max_length=120)
    vision_model: str = Field(default="", max_length=120)
    poll_minutes: int = Field(default=5, ge=1, le=60)
    allow_hosted: bool = False
    keep_days: int = Field(default=14, ge=1, le=90)
    wol_enabled: bool = False
    wol_mac: str = Field(default="", max_length=17, pattern=r"^$|^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")
    wol_broadcast: str = Field(default="255.255.255.255", max_length=45)


class ConfigOut(ConfigIn):
    helper_key: str
    online: bool
    last_online: datetime | None
    queue: dict[str, int]


class TestIn(BaseModel):
    url: str = Field(max_length=300)


# --- Members ----------------------------------------------------------------------------------


async def _family(db, user) -> Family:
    return await db.get(Family, user.family_id)


async def _status(db, user) -> StatusOut:
    cfg = await ai.config(db)
    family = await _family(db, user)
    st = await ai.state(db)
    last = datetime.fromisoformat(st["last_online"]) if st.get("last_online") else None
    online = last is not None and datetime.now(timezone.utc) - last < timedelta(minutes=int(cfg["poll_minutes"]) * 2 + 1)
    waiting = (await db.execute(select(func.count()).select_from(AiJob).where(AiJob.status == "queued"))).scalar_one()
    return StatusOut(available=await ai.family_may_use(db, family, cfg), online=online, last_online=last, waiting=waiting, hosted=family.kind != "owner")


async def _require_ai(db, user) -> None:
    if not (await _status(db, user)).available:
        raise HTTPException(status_code=409, detail="The local AI isn't available for your family")


async def _out(db, job: AiJob) -> JobOut:
    position = None
    if job.status == "queued":
        position = (await db.execute(select(func.count()).select_from(AiJob).where(AiJob.status == "queued", AiJob.created_at <= job.created_at))).scalar_one()
    return JobOut(id=job.id, kind=job.kind, status=job.status, input=job.input or {}, result=job.result, error=job.error, created_at=job.created_at, finished_at=job.finished_at, position=position)


async def _own(db, user, job_id: uuid.UUID) -> AiJob:
    job = await db.get(AiJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/ai/status", response_model=StatusOut)
async def get_status(user: CurrentUser, db: DB) -> StatusOut:
    return await _status(db, user)


@router.get("/ai/jobs", response_model=list[JobOut])
async def list_jobs(user: CurrentUser, db: DB) -> list[JobOut]:
    rows = (await db.execute(select(AiJob).where(AiJob.user_id == user.id).order_by(AiJob.created_at.desc()).limit(30))).scalars().all()
    return [await _out(db, j) for j in rows]


@router.get("/ai/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: uuid.UUID, user: CurrentUser, db: DB) -> JobOut:
    return await _out(db, await _own(db, user, job_id))


@router.post("/ai/jobs", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(payload: JobIn, user: CurrentUser, db: DB) -> JobOut:
    await _require_ai(db, user)
    if payload.kind in ("recipe", "quick_add") and not payload.text.strip():
        raise HTTPException(status_code=422, detail="Write or paste the text first")
    if payload.list_id:
        lst = await db.get(ListModel, payload.list_id)
        if lst is None or lst.family_id != user.family_id:
            raise HTTPException(status_code=404, detail="List not found")
    job = AiJob(family_id=user.family_id, user_id=user.id, kind=payload.kind, input={"text": payload.text.strip(), "list_id": str(payload.list_id) if payload.list_id else None})
    if payload.kind == "meal_plan":
        if "food" not in user.apps or payload.week_start is None:
            raise HTTPException(status_code=403 if payload.week_start else 422, detail="Choose the week")
        job.input = {**job.input, "week_start": (payload.week_start - timedelta(days=payload.week_start.weekday())).isoformat(), "servings": payload.servings, "preferences": payload.preferences.strip()}
    if payload.kind == "complaint_letter":
        # The receipt's facts and what is wrong; the AI writes the letter, the member sends it.
        from app.routers.receipts import _get as get_receipt

        if payload.receipt_id is None or len(payload.text.strip()) < 5:
            raise HTTPException(status_code=422, detail="Choose the receipt and say what is wrong")
        receipt = await get_receipt(db, user, payload.receipt_id)
        job.input = {
            **job.input, "receipt_id": str(receipt.id), "store": receipt.store, "note": receipt.note or "",
            "purchased_on": receipt.purchased_on.isoformat() if receipt.purchased_on else "", "amount": float(receipt.amount) if receipt.amount is not None else None,
            "currency": receipt.currency, "name": user.display_name,
        }
    if payload.kind == "receipt_info":
        from app.routers.receipts import readable_receipt

        receipt, media = await readable_receipt(db, user, payload.receipt_id)
        job.file_key = media.storage_key
        job.input = {**job.input, "receipt_id": str(receipt.id), "media_id": str(media.id), "keep_file": True}
    if payload.kind == "web_question":
        # The question goes to the web search now (only its words); the AI answers from what it found.
        if len(payload.text.strip()) < 3:
            raise HTTPException(status_code=422, detail="Write the question first")
        url = await recipe_search.get_url(db)
        if url is None:
            raise HTTPException(status_code=409, detail="Web search isn't turned on on this server")
        try:
            hits = await recipe_search.search(url, payload.text.strip()[:160], user.language or "en", recipe=False)
        except recipe_search.RecipeSearchError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if not hits:
            raise HTTPException(status_code=422, detail="The web search found nothing – try other words")
        job.input = {**job.input, "sources": [h.__dict__ for h in hits[:6]]}
    if payload.kind == "chores" and "tasks" not in user.apps:
        raise HTTPException(status_code=403, detail="This app is not enabled for you")
    if payload.kind in ("vehicle_receipt", "property_receipt"):
        if payload.kind == "vehicle_receipt":
            if "vehicles" not in user.apps or payload.vehicle_id is None:
                raise HTTPException(status_code=403 if payload.vehicle_id else 422, detail="Choose the vehicle")
            await vehicles._get_vehicle(db, user, payload.vehicle_id)
            job.input = {**job.input, "vehicle_id": str(payload.vehicle_id)}
        else:
            if "property" not in user.apps or payload.property_id is None:
                raise HTTPException(status_code=403 if payload.property_id else 422, detail="Choose the home")
            await homes._get_property_for_family(db, user.family_id, payload.property_id)
            job.input = {**job.input, "property_id": str(payload.property_id)}
        if payload.media_id:
            media = await db.get(MediaItem, payload.media_id)
            if media is None or media.family_id != user.family_id or media.kind != "image":
                raise HTTPException(status_code=404, detail="Receipt photo not found")
            # Read from the receipt itself; it stays as the expense's photo.
            job.file_key = media.storage_key
            job.input = {**job.input, "media_id": str(media.id), "keep_file": True}
        elif not payload.text.strip():
            raise HTTPException(status_code=422, detail="A photo of the receipt, or paste the text")
    db.add(job)
    await db.commit()
    await ai.kick(db)
    return await _out(db, job)


@router.post("/ai/jobs/upload", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def upload_job(kind: Literal["receipt", "recipe"], file: UploadFile, user: CurrentUser, db: DB) -> JobOut:
    """A receipt or a cookbook page to read. The picture is removed once the job has run."""
    await _require_ai(db, user)
    if file.content_type not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="A photo (JPEG, PNG, WebP or HEIC)")
    data = await file.read()
    if len(data) > MAX_IMAGE:
        raise HTTPException(status_code=413, detail="The photo is larger than 10 MB")
    await quota.check(db, user.family_id, len(data))
    job = AiJob(id=uuid.uuid4(), family_id=user.family_id, user_id=user.id, kind=kind, input={})
    job.file_key = f"ai/{job.id}.img"
    get_storage().save(user.family_id, job.file_key, io.BytesIO(data))
    db.add(job)
    await db.commit()
    await ai.kick(db)
    return await _out(db, job)


MAX_PDF = 20 * 1024 * 1024
PDF_PAGES = 40
PDF_CHARS = 12_000


def pdf_text(data: bytes) -> str:
    """The text of a PDF (a service history from the garage or the maker's app), read here on the
    server – nothing is sent anywhere. Scanned pages without text give nothing."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages[:PDF_PAGES]:
        parts.append(page.extract_text() or "")
        if sum(len(x) for x in parts) > PDF_CHARS:
            break
    return "\n".join(parts).strip()[:PDF_CHARS]


@router.post("/ai/jobs/vehicle-pdf", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def vehicle_pdf_job(vehicle_id: uuid.UUID, file: UploadFile, user: CurrentUser, db: DB) -> JobOut:
    """A service history as a PDF: its text is read for the local AI; the file isn't kept."""
    await _require_ai(db, user)
    if "vehicles" not in user.apps:
        raise HTTPException(status_code=403, detail="This app is not enabled for you")
    await vehicles._get_vehicle(db, user, vehicle_id)
    text = await _read_pdf(file)
    job = AiJob(family_id=user.family_id, user_id=user.id, kind="vehicle_receipt", input={"text": text, "vehicle_id": str(vehicle_id), "from_pdf": True})
    db.add(job)
    await db.commit()
    await ai.kick(db)
    return await _out(db, job)


@router.post("/ai/jobs/property-pdf", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def property_pdf_job(property_id: uuid.UUID, file: UploadFile, user: CurrentUser, db: DB) -> JobOut:
    """An invoice as a PDF: its text is read for the local AI; the file isn't kept."""
    await _require_ai(db, user)
    if "property" not in user.apps:
        raise HTTPException(status_code=403, detail="This app is not enabled for you")
    await homes._get_property_for_family(db, user.family_id, property_id)
    text = await _read_pdf(file)
    job = AiJob(family_id=user.family_id, user_id=user.id, kind="property_receipt", input={"text": text, "property_id": str(property_id), "from_pdf": True})
    db.add(job)
    await db.commit()
    await ai.kick(db)
    return await _out(db, job)


async def _read_pdf(file: UploadFile) -> str:
    data = await file.read()
    if len(data) > MAX_PDF:
        raise HTTPException(status_code=413, detail="The PDF is larger than 20 MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=415, detail="A PDF file")
    try:
        text = pdf_text(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The PDF couldn't be read") from exc
    if len(text) < 20:
        raise HTTPException(status_code=422, detail="The PDF has no text (a scan?) – take photos of the pages instead")
    return text


@router.delete("/ai/jobs/{job_id}", response_model=JobOut)
async def drop_job(job_id: uuid.UUID, user: CurrentUser, db: DB) -> JobOut:
    """Cancel a waiting job, or put away a finished one without using it."""
    job = await _own(db, user, job_id)
    if job.status == "queued":
        job.status = "cancelled"
        if job.file_key:
            if not (job.input or {}).get("keep_file"):
                get_storage().delete(job.family_id, job.file_key)
            job.file_key = None
    elif job.status in ("done", "failed"):
        job.status = "dismissed"
    await db.commit()
    return await _out(db, job)


async def _done(db, user, job_id: uuid.UUID, kind: str) -> AiJob:
    job = await _own(db, user, job_id)
    if job.kind != kind or job.status != "done":
        raise HTTPException(status_code=409, detail="Nothing to use from this job")
    return job


@router.post("/ai/jobs/{job_id}/apply/receipt", response_model=list[dict])
async def apply_receipt(job_id: uuid.UUID, payload: ApplyReceipt, user: CurrentUser, db: DB) -> list[dict]:
    """What was looked at and kept from the receipt goes into the pantry."""
    job = await _done(db, user, job_id, "receipt")
    added = []
    for line in payload.items:
        item = PantryItem(family_id=user.family_id, place=line.place, name=line.name.strip(), amount=line.amount, unit=line.unit.strip(), best_before=line.best_before, added_by=user.id)
        db.add(item)
        added.append(item)
    job.status = "applied"
    await db.commit()
    return [{"id": str(i.id), "name": i.name} for i in added]


@router.post("/ai/jobs/{job_id}/apply/recipe", response_model=RecipeOut)
async def apply_recipe(job_id: uuid.UUID, payload: RecipeCreate, user: CurrentUser, db: DB) -> RecipeOut:
    job = await _done(db, user, job_id, "recipe")
    recipe = await save_recipe(db, user, payload)
    job.status = "applied"
    await db.commit()
    return recipe


@router.post("/ai/jobs/{job_id}/apply/list", response_model=list[dict])
async def apply_list(job_id: uuid.UUID, payload: ApplyList, user: CurrentUser, db: DB) -> list[dict]:
    job = await _done(db, user, job_id, "quick_add")
    lst = await db.get(ListModel, payload.list_id)
    if lst is None or lst.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="List not found")
    start = len((await db.execute(select(ListItem.id).where(ListItem.list_id == lst.id))).all())
    rows = []
    for i, line in enumerate(payload.items):
        category = line.category if line.category in ai.CATEGORIES else "other"
        row = ListItem(list_id=lst.id, family_id=user.family_id, name=line.name.strip(), category=category, position=start + i)
        db.add(row)
        rows.append(row)
    job.status = "applied"
    await db.commit()
    return [{"id": str(r.id), "name": r.name} for r in rows]


@router.post("/ai/jobs/{job_id}/apply/vehicle", response_model=list[vehicles.VehicleExpenseOut])
async def apply_vehicle(job_id: uuid.UUID, payload: ApplyVehicle, user: CurrentUser, db: DB) -> list:
    """The read (and looked-over) costs become the vehicle's expenses – the first gets the photo."""
    job = await _done(db, user, job_id, "vehicle_receipt")
    if "vehicles" not in user.apps:
        raise HTTPException(status_code=403, detail="This app is not enabled for you")
    media_id = (job.input or {}).get("media_id")
    rows = []
    for i, line in enumerate(payload.expenses):
        line = line.model_copy(update={"vehicle_id": payload.vehicle_id})
        if i == 0 and media_id and line.receipt_media_id is None:
            line = line.model_copy(update={"receipt_media_id": uuid.UUID(media_id)})
        rows.append(await vehicles.add_expense(db, user, line))
    job.status = "applied"
    await db.commit()
    return rows


@router.post("/ai/jobs/{job_id}/apply/meal_plan")
async def apply_meal_plan(job_id: uuid.UUID, payload: ApplyMeals, user: CurrentUser, db: DB) -> dict:
    """The chosen dinners become the week's plan – through the same import as a pasted answer."""
    from app.routers.meals import import_plan

    job = await _done(db, user, job_id, "meal_plan")
    meals = [m for m in (job.result or {}).get("meals", []) if m.get("weekday") in payload.weekdays]
    if not meals:
        raise HTTPException(status_code=422, detail="Nothing chosen")
    plan = await import_plan(user=user, db=db, week_start=date.fromisoformat(job.input["week_start"]), raw=json.dumps({"meals": meals}))
    job.status = "applied"
    await db.commit()
    return {"week_start": job.input["week_start"], "meals": len(plan.meals) if plan else 0}


@router.post("/ai/jobs/{job_id}/apply/chores")
async def apply_chores(job_id: uuid.UUID, payload: ApplyChores, user: CurrentUser, db: DB) -> dict:
    """The chosen chores become tasks – through the same import as a pasted answer."""
    from app.routers.home import import_chores

    job = await _done(db, user, job_id, "chores")
    found = (job.result or {}).get("chores", [])
    chores = [c for i, c in enumerate(found) if i in set(payload.keep)]
    if not chores:
        raise HTTPException(status_code=422, detail="Nothing chosen")
    result = await import_chores(user=user, db=db, raw=json.dumps({"chores": chores}))
    job.status = "applied"
    await db.commit()
    return result.model_dump()


@router.post("/ai/jobs/{job_id}/apply/property", response_model=list[homes.ExpenseOut])
async def apply_property(job_id: uuid.UUID, payload: ApplyProperty, user: CurrentUser, db: DB) -> list:
    """The read (and looked-over) costs become the home's expenses – the first gets the photo."""
    job = await _done(db, user, job_id, "property_receipt")
    if "property" not in user.apps:
        raise HTTPException(status_code=403, detail="This app is not enabled for you")
    media_id = (job.input or {}).get("media_id")
    rows = []
    for i, line in enumerate(payload.expenses):
        line = line.model_copy(update={"property_id": payload.property_id})
        if i == 0 and media_id and line.receipt_media_id is None:
            line = line.model_copy(update={"receipt_media_id": uuid.UUID(media_id)})
        rows.append(await homes.add_expense(db, user, line))
    job.status = "applied"
    await db.commit()
    return rows


# --- The family's choice ------------------------------------------------------------------------


@router.get("/ai/family", response_model=FamilyAiOut)
async def get_family_ai(admin: FamilyManager, db: DB) -> FamilyAiOut:
    family = await _family(db, admin)
    cfg = await ai.config(db)
    hosted = family.kind != "owner"
    allowed = ai.configured(cfg) and (not hosted or bool(cfg["allow_hosted"])) and family.kind != "demo"
    return FamilyAiOut(enabled=await ai.family_may_use(db, family, cfg), allowed=allowed, hosted=hosted)


@router.put("/ai/family", response_model=FamilyAiOut)
async def set_family_ai(payload: FamilyAiIn, admin: FamilyManager, db: DB) -> FamilyAiOut:
    family = await _family(db, admin)
    family.ai_enabled = payload.enabled
    await db.commit()
    return await get_family_ai(admin, db)


# --- The server admin ---------------------------------------------------------------------------


async def _config_out(db) -> ConfigOut:
    cfg = await ai.config(db)
    st = await ai.state(db)
    last = datetime.fromisoformat(st["last_online"]) if st.get("last_online") else None
    counts = dict((await db.execute(select(AiJob.status, func.count()).group_by(AiJob.status))).all())
    online = bool(cfg["url"]) and await ai.version(cfg["url"]) is not None
    return ConfigOut(**{k: cfg[k] for k in ConfigIn.model_fields}, helper_key=cfg["helper_key"], online=online, last_online=last, queue={k: int(v) for k, v in counts.items()})


@router.get("/server/ai", response_model=ConfigOut)
async def get_config(admin: ServerAdmin, db: DB) -> ConfigOut:
    return await _config_out(db)


@router.put("/server/ai", response_model=ConfigOut)
async def put_config(payload: ConfigIn, admin: ServerAdmin, db: DB) -> ConfigOut:
    if payload.url and not ai.is_home_address(payload.url):
        raise HTTPException(status_code=422, detail="The AI must be on your home network (e.g. http://192.168.1.20:11434)")
    await ai.save_config(db, payload.model_dump())
    return await _config_out(db)


@router.post("/server/ai/test")
async def test_connection(payload: TestIn, admin: ServerAdmin) -> dict:
    """Is Ollama there, and which models does it have?"""
    if not ai.is_home_address(payload.url):
        raise HTTPException(status_code=422, detail="The AI must be on your home network (e.g. http://192.168.1.20:11434)")
    found = await ai.version(payload.url)
    if found is None:
        raise HTTPException(status_code=502, detail="No answer from Ollama at that address")
    return {"version": found, "models": await ai.models(payload.url)}


@router.post("/server/ai/wake", status_code=status.HTTP_204_NO_CONTENT)
async def wake(admin: ServerAdmin, db: DB) -> None:
    cfg = await ai.config(db)
    if not cfg["wol_mac"]:
        raise HTTPException(status_code=409, detail="Set the AI computer's MAC address first")
    try:
        ai.wake_on_lan(cfg["wol_mac"], cfg["wol_broadcast"] or "255.255.255.255")
    except ai.AiError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await ai.set_state(db, woke_at=datetime.now(timezone.utc).isoformat(), woken_by_server=True, kick=True)


# --- The sleep helper on the AI computer --------------------------------------------------------


async def _helper(db, key: str) -> dict:
    cfg = await ai.config(db)
    if not cfg["helper_key"] or key != cfg["helper_key"]:
        raise HTTPException(status_code=404, detail="Not found")
    return cfg


@router.get("/ai/helper")
async def helper_status(key: str, db: DB) -> dict:
    """May the computer go to sleep? Only if the server woke it and the queue is empty."""
    await _helper(db, key)
    st = await ai.state(db)
    return {"busy": await ai.queued_count(db) > 0, "woken_by_server": bool(st.get("woken_by_server")), "queue_empty_since": st.get("queue_empty_since")}


@router.post("/ai/helper/slept", status_code=status.HTTP_204_NO_CONTENT)
async def helper_slept(key: str, db: DB) -> None:
    await _helper(db, key)
    await ai.set_state(db, woken_by_server=False)
