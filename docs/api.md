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

### GET /api/v1/families/{family_id}/calendar/events/aggregated

- Beskrivning: returnerar samlad kalendervy med interna familjeevents + externa iCal-events.
- Query params:
  - `start_at_from` (optional, datetime)
  - `start_at_to` (optional, datetime)
- Auth: Bearer JWT.
- Tenant-regel: anvandaren maste vara medlem i `family_id`.
- Notera: events dedupliceras med tolerant strategi (titel + tidsintervall), och familjeevent prioriteras over extern dublett.

Responsen innehaller source-metadata for rendering/filter:

- `source_type`: `family` eller `external`
- `source_label`: t.ex. `Family` eller integrationens display-namn
- `member_user_id`: medlem kopplad till event-kallan (om tillganglig)
- `source_color_hex`: medlemsfarg for tydlig visuell markering
- `can_edit`: true endast for interna events dar anvandaren har edit-ratt
- `family_event_id`: satt for interna events (anvands for edit/delete)

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

- Beskrivning: data till dashboard-widget med kommande aktiviteter fran bade familjekalender och externa iCal-kallor.
- Query params:
  - `limit` (default 5, min 1, max 20)
- Auth: Bearer JWT.
- Responsen innehaller `source_type` och `source_label` sa widgeten kan visa var varje event kommer ifran.

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

## Chat

### GET /api/v1/families/{family_id}/chat/groups

- Beskrivning: listar chattgrupper som aktuell anvandare ar medlem i.
- Auth: Bearer JWT.
- Tenant-regel: anvandaren maste vara medlem i `family_id`.

### POST /api/v1/families/{family_id}/chat/groups

- Beskrivning: skapar ny chattgrupp och satter deltagare.
- Auth: Bearer JWT.
- RBAC: owner/parent.

### PUT /api/v1/families/{family_id}/chat/groups/{group_id}/members

- Beskrivning: uppdaterar gruppens deltagare.
- Auth: Bearer JWT.
- RBAC: owner/parent.

### GET /api/v1/families/{family_id}/chat/groups/{group_id}/messages

- Beskrivning: listar meddelanden i vald grupp (senaste forst i DB, returneras i tidsordning).
- Query params:
  - `limit` (default 50, min 1, max 200)
- Auth: Bearer JWT.
- Krav: anvandaren maste vara medlem i gruppen.

### POST /api/v1/families/{family_id}/chat/groups/{group_id}/messages

- Beskrivning: skickar meddelande till vald grupp.
- Auth: Bearer JWT.
- Krav: anvandaren maste vara medlem i gruppen.

### POST /api/v1/families/{family_id}/chat/groups/{group_id}/read

- Beskrivning: markerar gruppens meddelanden som lasta for aktuell anvandare.
- Auth: Bearer JWT.
- Krav: anvandaren maste vara medlem i gruppen.

### GET /api/v1/families/{family_id}/chat/widgets/unread

- Beskrivning: data till dashboard-widget med senaste olasta meddelanden.
- Query params:
  - `limit` (default 5, min 1, max 20)
- Auth: Bearer JWT.
- Respons: `unread_count` + lista med meddelanden (gruppnamn, avsandare, innehall, timestamp).

## Lists

### GET /api/v1/families/{family_id}/lists

- Beskrivning: listar delade listor som aktuell anvandare har synlighet till.
- Auth: Bearer JWT.
- Tenant-regel: anvandaren maste vara medlem i `family_id`.

### POST /api/v1/families/{family_id}/lists

- Beskrivning: skapar ny delad lista med deltagarstyrd synlighet.
- Auth: Bearer JWT.
- RBAC: owner/parent.

### PUT /api/v1/families/{family_id}/lists/{list_id}

- Beskrivning: uppdaterar listmetadata och synlighetsregler.
- Auth: Bearer JWT.
- RBAC: owner/parent.

### DELETE /api/v1/families/{family_id}/lists/{list_id}

- Beskrivning: tar bort lista inklusive tillhorande listpunkter.
- Auth: Bearer JWT.
- RBAC: owner/parent.

### GET /api/v1/families/{family_id}/lists/{list_id}/items

- Beskrivning: listar listpunkter for en lista som anvandaren har synlighet till.
- Auth: Bearer JWT.

### POST /api/v1/families/{family_id}/lists/{list_id}/items

- Beskrivning: lagger till ny listpunkt.
- Auth: Bearer JWT.

### PUT /api/v1/families/{family_id}/lists/{list_id}/items/{item_id}

- Beskrivning: uppdaterar listpunkt (titel, klarstatus, ordning).
- Auth: Bearer JWT.

### DELETE /api/v1/families/{family_id}/lists/{list_id}/items/{item_id}

- Beskrivning: tar bort listpunkt.
- Auth: Bearer JWT.

### GET /api/v1/families/{family_id}/lists/widgets/open

- Beskrivning: data till dashboard-widget med oppna listor och kvarvarande antal punkter.
- Query params:
  - `limit` (default 5, min 1, max 20)
- Auth: Bearer JWT.

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

## Chat payloads

`POST /chat/groups` anvander body:

```json
{
  "name": "Foraldrachatt",
  "description": "Koordinering av veckan",
  "member_user_ids": ["uuid-1", "uuid-2"]
}
```

`PUT /chat/groups/{group_id}/members` anvander body:

```json
{
  "member_user_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

`POST /chat/groups/{group_id}/messages` anvander body:

```json
{
  "content": "Jag hamtar efter traningen kl 18"
}

## Lists payloads

`POST /lists` och `PUT /lists/{list_id}` anvander body:

```json
{
  "title": "Handla",
  "description": "Veckans matinkop",
  "visible_member_user_ids": ["uuid-1", "uuid-2"],
  "visible_chat_group_ids": ["uuid-group-1"]
}
```

`POST /lists/{list_id}/items` anvander body:

```json
{
  "title": "Mjolk"
}
```

`PUT /lists/{list_id}/items/{item_id}` anvander body:

```json
{
  "title": "Mjolk",
  "is_completed": true,
  "sort_order": 0
}
```
```

## Kalenderaggregation och cache-strategi

- Externa iCal-feeds hamtas vid behov och parseas till `VEVENT`.
- For prestanda cachas parseade feed-events i minnet per integration-id med TTL pa 15 minuter.
- Vid cache-hit undviks nytt HTTP-anrop mot extern leverantor.
- Om en extern feed tillfalligt faller bort returneras ovriga kallor fortsatt, sa kalendern degraderar mjukt.
- Sortering sker pa `start_at` efter sammanlaggning av interna + externa events.

## Felhantering och felsokning

- `401 Unauthorized`: ogiltig eller saknad JWT.
- `403 Forbidden`: anvandaren saknar familjeaccess eller RBAC-rattighet.
- `404 Not Found`: resource finns inte i vald familj.
- `422 Unprocessable Entity`: felaktig payload/validering.

Vanliga lokala fallgropar:

- Fel `CLERK_JWT_ISSUER` ger auth-fel mot JWKS.
- Frontend maste ha korrekt `NEXT_PUBLIC_API_URL` i `frontend/.env.local`.
- Backend maste vara restartad efter miljovariabelandringar.
- Om `POST /chat/groups` returnerar `500` lokalt: kontrollera att DB-migration `0006` ar applicerad (`uv run alembic current`).
- Vid `Failed to fetch` i browsern: verifiera loopback/host i lokal miljo (`localhost` vs `127.0.0.1` vs `::1`).
