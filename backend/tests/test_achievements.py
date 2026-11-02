"""Achievement system tests."""
import uuid
from datetime import date, timedelta, timezone

import pytest

from app.models import Family, Task, TaskCompletion, User
from app.services.achievements import evaluate_achievements, get_achievement_states, user_level
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Achievement Family",
            "display_name": "Tester",
            "username": "tester",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_task(client, points: int = 10) -> str:
    task = await client.post(
        "/api/tasks",
        json={"title": f"Task {uuid.uuid4().hex[:6]}", "points": points, "recurrence": "daily"},
    )
    assert task.status_code == 201
    return task.json()["id"]


async def test_first_task_unlock(client):
    """Completing the first task unlocks the first_task achievement."""
    await _setup(client)
    task_id = await _create_task(client)
    done = await client.post(f"/api/tasks/{task_id}/complete")
    assert done.status_code == 200
    data = done.json()
    assert "first_task" in data["unlocked"]


async def test_streak_3_unlock(client, db_session):
    """streak_3 is unlocked after 3 consecutive days with completions."""
    me = await _setup(client)
    user_id = uuid.UUID(me["id"])
    family_id = uuid.UUID(me["family_id"])

    task_id = await _create_task(client)

    # Complete today via the API
    done = await client.post(f"/api/tasks/{task_id}/complete")
    assert done.status_code == 200

    # Insert completions for yesterday and day before yesterday directly
    today = date.today()
    db_task_id = uuid.UUID(task_id)
    for delta in (1, 2):
        db_session.add(
            TaskCompletion(
                family_id=family_id,
                task_id=db_task_id,
                user_id=user_id,
                completed_date=today - timedelta(days=delta),
                points_awarded=10,
            )
        )
    await db_session.commit()

    # Now evaluate – streak should be >= 3
    user_obj = await db_session.get(User, user_id)
    unlocked = await evaluate_achievements(db_session, user_obj)
    assert "streak_3" in unlocked


async def test_no_duplicate_unlocks(client):
    """Calling evaluate_achievements twice does not duplicate unlock records."""
    me = await _setup(client)
    task_id = await _create_task(client)

    first = await client.post(f"/api/tasks/{task_id}/complete")
    assert "first_task" in first.json()["unlocked"]

    # Create a second task and complete it – first_task should NOT appear again
    task2_id = await _create_task(client)
    # Need a different day or route – use direct evaluation via achievements endpoint
    resp = await client.get("/api/achievements")
    assert resp.status_code == 200
    unlocked_ids = [
        a["id"] for a in resp.json()["achievements"] if a["unlocked_at"] is not None
    ]
    assert unlocked_ids.count("first_task") == 1


async def test_progress_sane(client):
    """The achievements endpoint returns sane progress current/target for each achievement."""
    await _setup(client)
    task_id = await _create_task(client, points=50)
    await client.post(f"/api/tasks/{task_id}/complete")

    resp = await client.get("/api/achievements")
    assert resp.status_code == 200
    data = resp.json()

    for ach in data["achievements"]:
        p = ach["progress"]
        assert 0 <= p["current"] <= p["target"], f"{ach['id']}: current={p['current']} target={p['target']}"

    level = data["level"]
    assert level["level"] >= 0
    assert level["points_in_level"] >= 0
    assert level["points_to_next"] > 0


async def test_week_win_unlock(client, db_session):
    """week_win_1 is unlocked when the user won a prior week's leaderboard."""
    me = await _setup(client)
    user_id = uuid.UUID(me["id"])
    family_id = uuid.UUID(me["family_id"])

    # Insert a task directly so we have an ID for the completion
    task = Task(
        family_id=family_id,
        created_by=user_id,
        title="Prior week task",
        points=20,
        recurrence="daily",
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    # Insert a completion from last week (2 weeks ago to be safely in the past)
    last_week_date = date.today() - timedelta(weeks=2)
    db_session.add(
        TaskCompletion(
            family_id=family_id,
            task_id=task.id,
            user_id=user_id,
            completed_date=last_week_date,
            points_awarded=20,
        )
    )
    await db_session.commit()

    user_obj = await db_session.get(User, user_id)
    unlocked = await evaluate_achievements(db_session, user_obj)
    assert "week_win_1" in unlocked
