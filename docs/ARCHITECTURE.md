# Architecture

```
┌─────────────────────── Raspberry Pi / home server ───────────────────────┐
│                                                                          │
│  frontend (Next.js, port 3000)                                           │
│     │  /api/* is rewritten to the backend (cookie travels, same origin)  │
│     ▼                                                                    │
│  backend (FastAPI, port 8000, not exposed externally)                    │
│     │  runs `alembic upgrade head` on every start                        │
│     ├──► db (Postgres 16) – all family data                              │
│     ├──► redis – cache for iCal feeds (TTL 15 min) and SL departures     │
│     └──► outgoing https: fetches iCal subscriptions (read-only) and      │
│          SL departures (Trafiklab SL Transport API, keyless)             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Design decisions

- **Local auth in the MVP** (username + password, bcrypt, JWT in an httpOnly
  cookie) instead of Authentik/Authelia. An external IdP costs 0.5–1 GB RAM on
  a Pi and is oversized for one family. OIDC can be added later as opt-in
  without tearing anything down: add an `auth_provider` column on `users` and
  an OIDC callback router next to the existing one.
- **Migrations run automatically on container start** (`entrypoint.sh`).
  Self-hosted means we can never hotfix on users' hardware – every migration
  must be forward-safe before release. Rule: never destructive changes and
  data migration in the same release; expand first, migrate data, contract in
  the next version.
- **iCal subscriptions, not OAuth.** Read-only feeds give Google, Outlook and
  iCloud support without weeks of OAuth verification. Feeds are cached in
  Redis so the Pi doesn't hammer the providers.
- **English is the source language.** All code, identifiers, API messages and
  docs are English. The UI is translated client-side (en/sv/nb/da/fi) with a
  dependency-free dictionary in `frontend/src/lib/i18n.tsx`; each user stores
  their language and theme on their account (`users.language`, `users.theme`).
- **Themes are pure CSS.** Tailwind colors map to CSS variables; a `data-theme`
  attribute on `<html>` switches the palette. New themes are ~15 lines in
  `globals.css` plus a swatch entry in `frontend/src/lib/theme.tsx`.
- **The dashboard is per-user widget rows** (`dashboard_widgets`): type,
  position and a JSON config per widget. The first GET seeds the three
  built-in widgets. New widget types (home automation, weather, …) only need
  a new `type` value, a config schema and a frontend component.
- **SL departures are proxied by the backend.** The browser never talks to
  third parties; the backend calls Trafiklab's keyless SL Transport API and
  caches responses in Redis (30 s for departures, 24 h for the site list).
- **The family is the tenant.** Every table (except `families`) has
  `family_id` and every query filters on the signed-in user's family. Today
  there is one family per instance, but the model allows the "extra family"
  scenario (the summer house) without schema changes.
- **Soft deletion of tasks** (`active=false`) so point history and
  leaderboards survive.
- **One-off tasks** are deactivated automatically when completed; recurring
  tasks can be completed once per day (unique constraint on
  `task_id + completed_date`).

## API overview

All functionality goes through the REST API (`/api/...`). The backend is not
exposed to the network in normal operation, but during development you can add
`ports: ["8000:8000"]` on the backend service and open the Swagger docs at
`http://<pi>:8000/docs`. Future native apps (Android/iOS/Windows) build on the
same API without refactoring.

| Area | Endpoints |
|---|---|
| Auth | `GET/POST /api/auth/setup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET/PATCH /api/auth/me`, `POST /api/auth/me/password` |
| Family | `GET/POST /api/family/members`, `PATCH/DELETE /api/family/members/{id}`, `POST /api/family/members/{id}/password` (admin reset) |
| Calendar | `GET/POST /api/calendar/feeds`, `DELETE /api/calendar/feeds/{id}`, `GET /api/calendar/events?start&end` |
| Tasks | `GET/POST /api/tasks`, `GET /api/tasks/today`, `PATCH/DELETE /api/tasks/{id}`, `POST /api/tasks/{id}/complete`, `GET /api/tasks/leaderboard` |
| Dashboard | `GET/POST /api/dashboard/widgets`, `PATCH/DELETE /api/dashboard/widgets/{id}` |
| Transit | `GET /api/transit/sl/sites?q=`, `GET /api/transit/sl/departures?site_id=` |
| Home | `GET/PUT /api/home/profile`, `GET/POST /api/home/rooms`, `DELETE /api/home/rooms/{id}`, `GET /api/home/chores/prompt`, `POST /api/home/chores/import` |
| Meals | `GET /api/meals/prompt`, `GET/DELETE /api/meals/plan`, `POST /api/meals/import`, `POST /api/meals/plan/shopping-list` |
| Shopping | `GET/POST /api/shopping`, `PATCH /api/shopping/{id}`, `DELETE /api/shopping/done`, `DELETE /api/shopping/{id}` |
| Achievements | `GET /api/achievements` |
| Admin | `GET /api/admin/export`, `POST /api/admin/import`, `GET /api/admin/storage`, `GET/PUT/DELETE /api/admin/integrations/giphy` (opt-in GIF key, stored encrypted) |
| Albums | `GET/POST /api/albums`, `GET/PATCH/DELETE /api/albums/{id}`, `GET/POST /api/albums/{id}/media` |
| Media | `GET /api/media/{id}/{variant}` (variant: thumb\|web\|original, supports Range/206), `DELETE /api/media/{id}`. Chat attachments live in a hidden `kind=chat` album and are only served to members of a conversation they were sent in |
| Chat media | `POST /api/chat/conversations/{id}/attachments` (images only), `GET /api/chat/gifs/status`, `GET /api/chat/gifs?q=` and `GET /api/chat/gifs/{id}.gif` (GIPHY proxy, no user identifiers forwarded, Redis-cached; 404 until enabled) |
| Smart Home | Admin: `GET/PUT/DELETE /api/smarthome/connection`, `GET /api/smarthome/entities`, `GET/POST /api/smarthome/devices`, `PATCH/DELETE /api/smarthome/devices/{id}`. Member: `GET /api/smarthome/my-devices`, `POST /api/smarthome/devices/{id}/action` |
