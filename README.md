# Boet

> En webbapp för svenska familjer: gemensam kalender, gamifierade sysslor, AI-assistent, foton, hälsa, fastighets- och fordonsadministration.

**Status:** MVP-utveckling pågår – Sprint 1 (Auth + grundstruktur) klar.

## Senaste uppdateringar

- ✅ Issue #2 klar: Tema-system (light/dark), persistens i localStorage, sync mot `User.theme_preference` och toggle i app-headern.
- ✅ Issue #3 klar: Alembic migration körd mot Postgres och `users`-tabellen verifierad.

## Sprint-status

| Sprint       | Beskrivning                       | Status         |
| ------------ | --------------------------------- | -------------- |
| Sprint 0     | Setup – repo, CI, Docker, skelett | ✅ Klar        |
| Sprint 1     | Auth + grundstruktur              | ✅ Klar        |
| Sprint 2     | Familjer + inbjudningar           | 🔲 Ej påbörjad |
| Sprint 3     | Kalender bas                      | 🔲 Ej påbörjad |
| Sprint 4     | Externa kalender-feeds (iCal)     | 🔲 Ej påbörjad |
| Sprint 5     | Anpassningsbar dashboard          | 🔲 Ej påbörjad |
| Sprint 6     | Tema, PWA och polish              | 🔲 Ej påbörjad |
| Sprint 7     | Stripe + prenumerationsflöde      | 🔲 Ej påbörjad |
| Sprint 8     | Publik sajt + signup              | 🔲 Ej påbörjad |
| Sprint 9     | GDPR + polering                   | 🔲 Ej påbörjad |
| Sprint 10–11 | Beta + lansering                  | 🔲 Ej påbörjad |

## Snabbstart

### Förutsättningar

- Python 3.12+ med [uv](https://docs.astral.sh/uv/)
- Node.js 20+ med [pnpm](https://pnpm.io/)
- Docker + Docker Compose
- Konton på: [Clerk](https://clerk.com), [Stripe](https://stripe.com), [Resend](https://resend.com), [Sentry](https://sentry.io)
- Clerk CLI: `npm install -g clerk`

### Lokal utveckling

```bash
# 1. Klona repot
git clone git@github.com:DITT-USERNAME/boet.git
cd boet

# 2. Starta databas och Redis
docker compose up -d

# 3. Backend
cd backend
cp .env.example .env  # fyll i värden
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 4. Frontend (i separat terminal)
cd frontend
cp .env.local.example .env.local  # fyll i värden
pnpm install
pnpm dev
```

Tips för Windows PowerShell: använd `pnpm.cmd` om execution policy blockerar `pnpm`.

Backend: http://localhost:8000
API-docs: http://localhost:8000/api/docs
Frontend: http://localhost:3000

## Dev-miljö (Windows + Docker Desktop)

Rekommenderad setup på Windows är Docker Desktop med WSL 2-backend.

- Docker Desktop installerat och igång
- WSL 2 aktiverat (rekommenderad backend i Docker Desktop)
- Kör Compose från repo-roten: `docker compose up -d`
- Verifiera containers: `docker compose ps`

Vanlig felsökning:

- Om `docker`-kommandot saknas: starta Docker Desktop och öppna ny terminal
- Om frontend blockeras av execution policy i PowerShell: använd `pnpm.cmd` i stället för `pnpm`

Migrationer i backend:

- Kör migration: `uv run alembic upgrade head`
- Kontrollera senaste revision: `uv run alembic current`
- Vid behov, verifiera tabeller i Postgres med `docker compose exec db psql ...`

## Projektstruktur

```
boet/
├── backend/          # FastAPI Python backend
│   ├── app/          # Applikationskod organiserad i moduler
│   ├── alembic/      # Databasmigrations
│   └── tests/        # Pytest-tester
├── frontend/         # Next.js TypeScript frontend
│   ├── src/
│   └── public/
├── infra/            # Terraform för Google Cloud
├── docs/             # Projektdokumentation och ADR:er
├── .github/          # GitHub Actions CI/CD
├── docker-compose.yml
├── CLAUDE.md         # Kontext för Claude Code/extension
└── README.md
```

## Tech stack

| Lager              | Val                      | Anledning                                       |
| ------------------ | ------------------------ | ----------------------------------------------- |
| Frontend framework | Next.js 16 (App Router)  | Server Components, bra DX, inbyggt i18n         |
| Frontend språk     | TypeScript               | Typsäkerhet end-to-end                          |
| Styling            | Tailwind + Shadcn/ui     | Snabbt, ingen CSS-fil-rörig                     |
| Backend framework  | FastAPI                  | Async, OpenAPI auto, Pydantic                   |
| Backend språk      | Python 3.12              | Bra för både API och AI-integration             |
| ORM                | SQLAlchemy 2.0 (async)   | Mest moget i Python-världen                     |
| Databas            | PostgreSQL 16            | Standard, stark i alla scenarios                |
| Auth               | Clerk                    | Passkeys, social login, gratis upp till 10k MAU |
| Betalning          | Stripe                   | Branschstandard, Customer Portal                |
| Email              | Resend                   | Modern API, bra DX                              |
| Hosting            | Google Cloud (Stockholm) | Skala-till-noll, GDPR, prisvärt                 |
| Monitoring         | Sentry                   | Error tracking                                  |

## API-design-checklist

För varje nytt endpoint:

- [ ] Versionerat under `/api/v1/`
- [ ] Resource-orienterat (substantiv, inte verb)
- [ ] Korrekt HTTP-metod (GET/POST/PUT/PATCH/DELETE)
- [ ] Pydantic request- och response-modeller (= OpenAPI-doc)
- [ ] Auth-krav tydligt (kräver JWT? specifik roll?)
- [ ] **Tenant-isolation: alla endpoints filtrerar på `family_id`**
- [ ] Pagination för list-endpoints
- [ ] Idempotens på POST där det är meningsfullt
- [ ] Felmeddelanden följer RFC 7807 Problem Details
- [ ] Inga internal-only fält i response (filtrera medvetet)
- [ ] Tester som verifierar tenant isolation

## Tenant isolation

**Detta är icke-förhandlingsbart.** Familjer får aldrig se varandras data. Vi enforcear det i flera lager:

1. **Datamodell:** Varje tenant-tabell har `family_id` (NOT NULL, indexerad)
2. **Repository:** All databasaccess kräver `family_id` som obligatorisk parameter
3. **Endpoint:** Authorization-check att användaren är medlem i `family_id`
4. **Postgres RLS:** Row-Level Security som extra säkerhetsnät

Se `backend/app/core/repository.py` för basklassen.

## Tester

```bash
# Backend
cd backend
uv run pytest

# Frontend
cd frontend
pnpm test
```

Frontend-tester körs med Vitest + Testing Library.

## Tema-system

Light/dark-tema är implementerat i frontend:

- Tema styrs via CSS-variabler i `frontend/src/app/globals.css`
- Aktivt tema sparas i `localStorage` (`boet-theme-preference`)
- För inloggade användare synkas tema även mot backend-fältet `User.theme_preference` via `GET/PATCH /api/v1/auth/me`
- Växlare finns i app-headern (`/app`-layout)

Tester för tenant isolation är obligatoriska för varje endpoint som hanterar familje-data.

## Bidrag

Det här är ett solo-projekt just nu. Konventioner:

- Conventional commits (`feat:`, `fix:`, `chore:`, etc.)
- Feature branches från `main`
- PR triggerar CI – allt måste vara grönt innan merge
- ADR (Architectural Decision Record) för viktiga beslut, sparas i `docs/adr/`

## Licens

Proprietär. Alla rättigheter förbehållna.

## Kontakt

Se `pyproject.toml` för aktuell maintainer.
