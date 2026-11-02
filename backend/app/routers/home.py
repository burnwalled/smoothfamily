"""Home profile, rooms and AI-assisted chore generation (copy prompt → paste JSON)."""
import uuid
from datetime import date

from fastapi import APIRouter, Body, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select

from app.deps import DB, CurrentUser
from app.models import HomeProfile, Room, Task, User
from app.schemas import (
    ChoreImportRequest,
    HomeProfileIn,
    HomeProfileOut,
    ImportResult,
    PromptOut,
    RoomCreate,
    RoomOut,
)
from app.services.ai_import import extract_json
from app.services.prompts import chores_prompt

router = APIRouter(prefix="/api/home", tags=["home"])


@router.get("/profile", response_model=HomeProfileOut | None)
async def get_profile(user: CurrentUser, db: DB) -> HomeProfile | None:
    return (
        await db.execute(select(HomeProfile).where(HomeProfile.family_id == user.family_id))
    ).scalar_one_or_none()


@router.put("/profile", response_model=HomeProfileOut)
async def upsert_profile(payload: HomeProfileIn, user: CurrentUser, db: DB) -> HomeProfile:
    profile = (
        await db.execute(select(HomeProfile).where(HomeProfile.family_id == user.family_id))
    ).scalar_one_or_none()
    if profile is None:
        profile = HomeProfile(family_id=user.family_id)
        db.add(profile)
    profile.dwelling_type = payload.dwelling_type
    profile.has_garden = payload.has_garden
    profile.notes = payload.notes
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/rooms", response_model=list[RoomOut])
async def list_rooms(user: CurrentUser, db: DB) -> list[Room]:
    result = await db.execute(
        select(Room).where(Room.family_id == user.family_id).order_by(Room.created_at)
    )
    return list(result.scalars().all())


@router.post("/rooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(payload: RoomCreate, user: CurrentUser, db: DB) -> Room:
    room = Room(family_id=user.family_id, name=payload.name, category=payload.category)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room


@router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(room_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    room = await db.get(Room, room_id)
    if room is None or room.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Room not found")
    await db.delete(room)
    await db.commit()


@router.get("/chores/prompt", response_model=PromptOut)
async def get_chores_prompt(user: CurrentUser, db: DB) -> PromptOut:
    profile = (
        await db.execute(select(HomeProfile).where(HomeProfile.family_id == user.family_id))
    ).scalar_one_or_none()
    rooms = (
        (await db.execute(select(Room).where(Room.family_id == user.family_id))).scalars().all()
    )
    members = (
        (await db.execute(select(User).where(User.family_id == user.family_id))).scalars().all()
    )
    return PromptOut(prompt=chores_prompt(profile, list(rooms), list(members), user.language))


@router.post("/chores/import", response_model=ImportResult)
async def import_chores(user: CurrentUser, db: DB, raw: str = Body(..., media_type="text/plain")) -> ImportResult:
    """Accepts the raw AI answer (text/plain), extracts JSON and creates tasks."""
    try:
        data = extract_json(raw)
        if isinstance(data, list):
            data = {"chores": data}
        request = ChoreImportRequest.model_validate(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ValidationError as exc:
        first = exc.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        raise HTTPException(status_code=422, detail=f"Invalid format at '{location}': {first['msg']}")

    members = (
        (await db.execute(select(User).where(User.family_id == user.family_id))).scalars().all()
    )
    by_name = {m.display_name.lower(): m.id for m in members}

    imported = 0
    skipped: list[str] = []
    for item in request.chores:
        weekday = item.weekday
        if item.recurrence == "weekly" and weekday is None:
            weekday = 0
        if item.recurrence == "none" and item.due_date is None:
            skipped.append(f"'{item.title}': one-off chore without a date")
            continue
        assignee_id = None
        if item.assignee:
            assignee_id = by_name.get(item.assignee.strip().lower())
            if assignee_id is None:
                skipped.append(f"'{item.title}': unknown member '{item.assignee}' - added without assignee")
        db.add(
            Task(
                family_id=user.family_id,
                created_by=user.id,
                assignee_id=assignee_id,
                title=item.title,
                description=item.description,
                points=item.points,
                recurrence=item.recurrence,
                weekday=weekday if item.recurrence == "weekly" else None,
                due_date=item.due_date if item.recurrence == "none" else None,
            )
        )
        imported += 1
    await db.commit()
    return ImportResult(imported=imported, skipped=skipped)
