# Boet – projektkontext för Claude

Detta är arbetskontexten för Claude när du jobbar i denna kodbas. Läs det som det första du gör.

## Vad detta är

Boet är en webbapp för svenska familjer: en gemensam kalender, gamifierade sysslor, AI-assistent för menyplanering, foton, vaccinationer, fastighets- och fordonsadministration, och mer.

**Status:** MVP-utveckling pågår. Vi följer en fasplan där Fas 1 är webbappens grundfunktioner.

**Solo-utvecklare** – prioritera enkelhet, tydlighet, och beprövade lösningar. Undvik prematur optimering och over-engineering.

## Övergripande arkitektur

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + Shadcn/ui
- **Backend:** FastAPI (Python 3.12) + SQLAlchemy 2.0 (async) + Alembic + Pydantic v2
- **Databas:** PostgreSQL 16
- **Auth:** Clerk (Google + Microsoft + passkeys)
- **Betalning:** Stripe
- **Hosting:** Google Cloud (Cloud Run + Cloud SQL + Cloud Storage), region `europe-north1`
- **Email:** Resend
- **Monitoring:** Sentry

## Kärnprinciper

### 1. API-first

Backend exponerar allt via versionerat REST API (`/api/v1/...`). Frontend är bara en av många framtida klienter (native-appar kommer senare). **Aldrig webb-specifik logik i backend.** OpenAPI auto-genereras av FastAPI.

### 2. Tenant isolation

Familjer får aldrig se varandras data. Detta enforceas i flera lager:

- Varje databastabell med familje-data har `family_id` (NOT NULL, indexerad)
- Repository-funktioner kräver `family_id` som obligatorisk parameter
- Endpoints validerar att inloggad användare är medlem i `family_id`
- Postgres Row-Level Security (RLS) som extra skyddslager

**Aldrig hämta data utan att filtrera på `family_id`.** Detta är icke-förhandlingsbart.

### 3. Modulär monolit

En backend-app, men strukturerad i tydliga moduler under `app/`. Modulerna kommunicerar via funktion-anrop, inte HTTP. Inga microservices.

```
app/
├── auth/        # Clerk-integration, JWT-validering
├── families/    # Familjegrupper, inbjudningar, medlemmar
├── calendar/    # Kalender, iCal-feed-fetch, events
├── dashboard/   # Anpassningsbar dashboard, widget-layouts
├── billing/     # Stripe-integration
└── core/        # Delade utilities (DB, settings, etc.)
```

### 4. Familjebaserad prissättning

En prenumeration per familj täcker alla medlemmar. Två tiers:
- **Standard** (79 kr/mån) – grundfunktioner
- **Premium** (149 kr/mån) – AI, fastighet/bil

**Trial-modell:**
- Standard-trial 30 dagar utan kort vid signup
- Premium-trial 30 dagar låses upp efter 30 dagar som betalande Standard-kund
- Premium-trial är engångsförmån (`has_used_premium_trial`)

Tier-features kontrolleras vid varje request via `TierService.has_feature(family, "ai_chef")`.

### 5. iCal-feeds, inte OAuth

För att visa familjemedlemmars privata kalendrar använder vi **iCal-feed-prenumeration** (read-only) istället för OAuth + Calendar API. Användaren publicerar sin kalender hos Google/Outlook/iCloud och klistrar in den hemliga URL:en.

Fördelar: ingen Google OAuth-verifiering krävs, iCloud fungerar gratis, mindre attack surface.

### 6. Säkerhet

- iCal-URL:er krypteras i databasen (de är hemliga delningslänkar)
- Clerk hanterar all autentisering (vi bygger INTE eget auth)
- Stripe hanterar all betalningsdata (vi ser aldrig kortuppgifter)
- All data hostad i EU-region
- Audit log för känsliga operationer

## Konventioner

### Backend (Python)

- **Async överallt** – FastAPI är async, SQLAlchemy 2.0 async, all I/O async
- **Type hints obligatoriskt** – inga `Any` utan motivering
- **Pydantic-modeller för alla API-responser** – aldrig returnera SQLAlchemy-objekt direkt
- **Repository-mönster** – ingen affärslogik i routes, bara orchestrering
- **`uv` som package manager**, inte pip
- **`ruff` för lint/format**, inte black/flake8
- **Tester med pytest**, async där relevant
- **Migrations via Alembic** – aldrig manuella SQL-ändringar mot databasen

### Frontend (TypeScript)

- **Server Components där möjligt**, Client Components bara där nödvändigt (state, events)
- **TanStack Query för server-state** – inte useEffect-fetching
- **Zod för all input-validering**
- **Tailwind för styling** – inga separata CSS-filer
- **Shadcn/ui som baskomponenter** – kopierad in i projektet, inte npm-dependency
- **`pnpm` som package manager**, inte npm/yarn

### Naming

- Filnamn: `snake_case.py` för Python, `PascalCase.tsx` för React-komponenter, `kebab-case.ts` för utilities
- API-endpoints: `/api/v1/families/{family_id}/calendar/events` (resource-orienterat)
- Databastabeller: `snake_case`, plural (`calendar_events`, inte `CalendarEvent`)

### Git

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Feature branches från `main`
- PR-titel följer samma format som commits

## Vanliga uppgifter

### Lägga till en ny modul

1. Skapa katalog under `backend/app/`
2. Skapa filer: `models.py`, `schemas.py`, `service.py`, `router.py`, `__init__.py`
3. Inkludera router i `app/main.py`
4. Skriv migration via `alembic revision --autogenerate -m "add X module"`
5. Skriv tester i `backend/tests/`

### Lägga till ett nytt API-endpoint

Följ checklistan i README under "API design checklist".

### Lägga till en ny widget på dashboarden

1. Skapa komponent under `frontend/src/components/widgets/`
2. Registrera i `frontend/src/lib/widget-registry.ts`
3. Lägg till backend-endpoint för widget-data
4. Uppdatera default layouts om relevant

## Referenser

- Fullständig projektplan: `docs/projektplan.md`
- Arkitekturbeslut: `docs/adr/`
- API-spec: `http://localhost:8000/api/docs` när backend kör

## Vad ska INTE göras

- **Ingen GraphQL** – REST räcker
- **Ingen Redux** – TanStack Query + React state räcker
- **Ingen microservices** – modulär monolit
- **Inga manuella DB-ändringar** – alltid via Alembic
- **Inget eget auth** – Clerk hanterar
- **Inga icke-versionerade endpoints** – allt under `/api/v1/`
- **Aldrig förbi `family_id`-filter** – tenant isolation är icke-förhandlingsbar
