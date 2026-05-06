# API-oversikt (MVP)

Denna sida sammanfattar de endpoints som ar implementerade just nu.

Bas-URL lokalt:

- `http://localhost:8000`

Versionering:

- Alla app-endpoints ligger under `/api/v1/...`

## Auth och user

### GET /api/v1/health

- Beskrivning: enkel health-check.
- Auth: ingen.

### GET /api/v1/users/me

- Beskrivning: hamtar aktuell anvandare (skapar user-row vid forsta inloggning).
- Auth: Bearer JWT (Clerk).

### PATCH /api/v1/users/me

- Beskrivning: uppdaterar `locale`, `timezone`, `theme_preference`.
- Auth: Bearer JWT (Clerk).

## Families

### POST /api/v1/families

- Beskrivning: skapar primar familj for inloggad anvandare om den saknas.
- Auth: Bearer JWT.

### GET /api/v1/families/current/overview

- Beskrivning: returnerar familjeoversikt med medlemmar, pending invites, roll och permissions.
- Auth: Bearer JWT.

### POST /api/v1/families/{family_id}/invites

- Beskrivning: skapar familjeinbjudan (role: `parent` eller `child`).
- Auth: Bearer JWT.
- RBAC: krav pa `can_manage_members` (owner/parent).

## Invites

### GET /api/v1/invites/{token}

- Beskrivning: accepterar invite-token for aktuell inloggad anvandare.
- Auth: Bearer JWT.

## Calendar

### GET /api/v1/families/{family_id}/calendar/events

- Beskrivning: listar synliga events i familjen.
- Query params:
  - `start_at_from` (optional, datetime)
  - `start_at_to` (optional, datetime)
- Auth: Bearer JWT.
- Tenant-regel: anvandaren maste vara medlem i `family_id`.

### POST /api/v1/families/{family_id}/calendar/events

- Beskrivning: skapar event.
- Auth: Bearer JWT.
- RBAC:
  - owner/parent kan skapa vanliga och dolda events
  - child kan skapa vanliga events (inte dolda)

### PUT /api/v1/families/{family_id}/calendar/events/{event_id}

- Beskrivning: uppdaterar event.
- Auth: Bearer JWT.
- RBAC:
  - owner/parent kan uppdatera alla familjeevents
  - child kan bara uppdatera event de sjalva skapat

### DELETE /api/v1/families/{family_id}/calendar/events/{event_id}

- Beskrivning: tar bort event.
- Auth: Bearer JWT.
- RBAC: samma modell som update.

### GET /api/v1/families/{family_id}/calendar/widgets/upcoming

- Beskrivning: data till dashboard-widget med kommande aktiviteter.
- Query params:
  - `limit` (default 5, min 1, max 20)
- Auth: Bearer JWT.

### GET /api/v1/families/{family_id}/calendar/integrations

- Beskrivning: listar externa iCal-integrationer for familjen.
- Auth: Bearer JWT.
- Tenant-regel: anvandaren maste vara medlem i `family_id`.

### POST /api/v1/families/{family_id}/calendar/integrations

- Beskrivning: lagger till ny extern iCal-integration, validerar URL och krypterar lagrad URL.
- Auth: Bearer JWT.
- RBAC: krav pa `can_manage_calendar_integrations` (owner/parent).

### DELETE /api/v1/families/{family_id}/calendar/integrations/{integration_id}

- Beskrivning: tar bort extern iCal-integration.
- Auth: Bearer JWT.
- RBAC: krav pa `can_manage_calendar_integrations` (owner/parent).

## Calendar payload (upsert)

`POST` och `PUT` for calendar-events anvander samma body:

```json
{
  "title": "Utvecklingsmote",
  "description": "Sprintplanering",
  "location": "Kontoret",
  "start_at": "2026-05-07T08:00:00Z",
  "end_at": "2026-05-07T09:00:00Z",
  "all_day": false,
  "tagged_user_ids": ["uuid-1", "uuid-2"],
  "hidden_for_user_ids": ["uuid-3"]
}
```

Valideringsregler:

- `end_at` maste vara efter `start_at`.
- `tagged_user_ids` och `hidden_for_user_ids` maste tillhora samma familj.

## Calendar integration payload (create)

`POST /calendar/integrations` anvander body:

```json
{
  "member_user_id": "uuid-for-family-member",
  "provider": "google",
  "display_name": "Anna - Jobbkalender",
  "ical_url": "https://calendar.google.com/calendar/ical/.../basic.ics"
}
```

Valideringsregler:

- `ical_url` maste vara en giltig `http`/`https` URL.
- Feeden maste vara reachbar och parsebar som iCal (`VCALENDAR`).
- `member_user_id` maste tillhora samma familj.
- URL lagras krypterad i databasen (`ical_url_encrypted`) och returneras endast maskerad i API-respons.

## Felhantering och felsokning

- `401 Unauthorized`: ogiltig eller saknad JWT.
- `403 Forbidden`: anvandaren saknar familjeaccess eller RBAC-rattighet.
- `404 Not Found`: resource finns inte i vald familj.
- `422 Unprocessable Entity`: felaktig payload/validering.

Vanliga lokala fallgropar:

- Fel `CLERK_JWT_ISSUER` ger auth-fel mot JWKS.
- Frontend maste ha korrekt `NEXT_PUBLIC_API_URL` i `frontend/.env.local`.
- Backend maste vara restartad efter miljovariabelandringar.
