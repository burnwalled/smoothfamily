"""Smooth Family API – privacy-first family management, self-hosted on your own hardware."""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import __version__
from app.config import get_settings
from app.routers import achievements, admin, ai, bank, custody, easy, albums, allowance, auth, backups, birthdays, invite, documents, emergency, flows, guests, kiosk, health, medicine, parties, school, pantry, pets, presence, server, trips, week, wish_share, calendar, chat, coparent, dashboard, events, family, feedback, home, lists, meals, mfa, notifications, property, push, rewards, shop, smarthome, tasks, transit, vault, vault_shares, vehicles, web_search, receipts, gateway, economy, csp, updates, guide, devices
from app.database import SessionLocal
from app.services.ai import ai_worker
from app.services.ha_live import ha_live_worker
from app.services.live_writes import LiveWritesMiddleware
from app.services.notifications import notification_worker
from app.services.push import ensure_vapid_keys


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop = asyncio.Event()
    async with SessionLocal() as db:
        await ensure_vapid_keys(db)
    tasks = [
        asyncio.create_task(notification_worker(stop)),
        # The local AI's queue runs beside the reminders: a job can take minutes.
        asyncio.create_task(ai_worker(stop)),
    ]
    if get_settings().live_events:
        tasks.append(asyncio.create_task(ha_live_worker(stop)))
    yield
    stop.set()
    for task in tasks:
        await task


app = FastAPI(title=get_settings().app_name, version=__version__, lifespan=lifespan)
app.add_middleware(LiveWritesMiddleware)

app.include_router(auth.router)
app.include_router(mfa.router)
app.include_router(family.router)
app.include_router(calendar.ical_router)
app.include_router(calendar.router)
app.include_router(tasks.router)
app.include_router(allowance.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
app.include_router(push.router)
app.include_router(transit.router)
app.include_router(home.router)
app.include_router(meals.router)
app.include_router(property.router)
app.include_router(vehicles.router)
app.include_router(lists.router)
app.include_router(achievements.router)
app.include_router(backups.router)
app.include_router(server.router)
app.include_router(invite.router)
app.include_router(admin.router)
app.include_router(albums.router)
app.include_router(albums.media_router)
app.include_router(smarthome.router)
app.include_router(feedback.router)
app.include_router(rewards.router)
app.include_router(notifications.router)
app.include_router(birthdays.router)
app.include_router(wish_share.router)
app.include_router(medicine.router)
app.include_router(health.router)
app.include_router(school.router)
app.include_router(parties.router)
app.include_router(parties.public)
app.include_router(parties.portal)
app.include_router(pets.router)
app.include_router(week.router)
app.include_router(documents.router)
app.include_router(emergency.router)
app.include_router(guests.router)
app.include_router(presence.router)
app.include_router(flows.router)
app.include_router(kiosk.router)
app.include_router(trips.router)
app.include_router(pantry.router)
app.include_router(ai.router)
app.include_router(easy.router)
app.include_router(custody.router)
app.include_router(coparent.router)
app.include_router(bank.router)
app.include_router(shop.router)
app.include_router(events.router)
app.include_router(vault.router)
app.include_router(vault_shares.router)
app.include_router(web_search.router)
app.include_router(receipts.router)
app.include_router(gateway.router)
app.include_router(economy.router)
app.include_router(csp.router)
app.include_router(updates.router)
app.include_router(guide.router)
app.include_router(devices.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
