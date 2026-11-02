"""Family goals: adults set rewards (bowling, a restaurant …) that the family unlocks with points together."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import DB, AdultUser, CurrentUser
from app.models import FamilyReward
from app.schemas import FamilyRewardIn, FamilyRewardOut, FamilyRewardUpdate
from app.services.rewards import check_family_rewards, reward_progress

router = APIRouter(prefix="/api/rewards", tags=["rewards"])


async def _out(db, reward: FamilyReward) -> FamilyRewardOut:
    out = FamilyRewardOut.model_validate(reward)
    out.points = min(await reward_progress(db, reward), reward.points_required) if reward.unlocked_at is None else reward.points_required
    return out


async def _get(reward_id: uuid.UUID, family_id: uuid.UUID, db) -> FamilyReward:
    reward = await db.get(FamilyReward, reward_id)
    if reward is None or reward.family_id != family_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    return reward


@router.get("", response_model=list[FamilyRewardOut])
async def list_rewards(user: CurrentUser, db: DB) -> list[FamilyRewardOut]:
    """Open goals first (closest to done first), then unlocked, then done ones (latest 20)."""
    rewards = (
        await db.execute(
            select(FamilyReward).where(FamilyReward.family_id == user.family_id).order_by(FamilyReward.created_at.desc())
        )
    ).scalars().all()
    outs = [await _out(db, r) for r in rewards]
    open_ = sorted((o for o in outs if o.unlocked_at is None), key=lambda o: o.points / o.points_required, reverse=True)
    unlocked = [o for o in outs if o.unlocked_at is not None and o.redeemed_at is None]
    done = [o for o in outs if o.redeemed_at is not None][:20]
    return unlocked + open_ + done


@router.post("", response_model=FamilyRewardOut, status_code=status.HTTP_201_CREATED)
async def create_reward(payload: FamilyRewardIn, adult: AdultUser, db: DB) -> FamilyRewardOut:
    reward = FamilyReward(
        family_id=adult.family_id,
        created_by=adult.id,
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        points_required=payload.points_required,
        starts_at=datetime.now(timezone.utc),  # points count from now on
    )
    db.add(reward)
    await db.commit()
    await db.refresh(reward)
    return await _out(db, reward)


@router.patch("/{reward_id}", response_model=FamilyRewardOut)
async def update_reward(reward_id: uuid.UUID, payload: FamilyRewardUpdate, adult: AdultUser, db: DB) -> FamilyRewardOut:
    reward = await _get(reward_id, adult.family_id, db)
    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        reward.title = data["title"].strip()
    if "description" in data:
        reward.description = (data["description"] or "").strip() or None
    if "points_required" in data:
        reward.points_required = data["points_required"]
    await db.commit()
    await check_family_rewards(db, adult.family_id)  # lowering the goal may unlock it
    await db.refresh(reward)
    return await _out(db, reward)


@router.post("/{reward_id}/redeem", response_model=FamilyRewardOut)
async def redeem_reward(reward_id: uuid.UUID, adult: AdultUser, db: DB) -> FamilyRewardOut:
    """Mark an unlocked goal as done (we went bowling)."""
    reward = await _get(reward_id, adult.family_id, db)
    if reward.unlocked_at is None:
        raise HTTPException(status_code=409, detail="The goal is not reached yet")
    reward.redeemed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(reward)
    return await _out(db, reward)


@router.delete("/{reward_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reward(reward_id: uuid.UUID, adult: AdultUser, db: DB) -> None:
    reward = await _get(reward_id, adult.family_id, db)
    await db.delete(reward)
    await db.commit()
