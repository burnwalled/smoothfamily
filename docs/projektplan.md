# Familjeapp – Projektplan v0.7

> En webbportal för familjer: anpassningsbar dashboard, gemensam kalender, gamifierade sysslor, familjechat, AI-assistent för menyplanering, vaccinationer, fotodelning, hemautomation samt fastighets- och fordonsadministration. API-first design för framtida native-appar. Familjebaserad prissättning – en prenumeration täcker hela familjen.

**Status:** Planeringsstadium
**Roll:** Solo-utvecklare
**Senast uppdaterad:** 2026-05-04

**Ändringslog:**
- v0.7: Förtydligad trial-modell. Standard-trial 30 dagar utan kort vid signup. Premium-trial 30 dagar låses upp efter 30 dagars betalande Standard-prenumeration ("earn it before you try it"). Skyddar marginal och belönar lojalitet.
- v0.6: Familjebaserad prissättning (en prenumeration per familj, inte per användare). En användare tillhör primärt en familj men kan ingå i fler familjer som inbjuden om den familjen köpt "extra familj"-addon. Prismodell: Standard 79 kr/mån, Premium 149 kr/mån, addons för storage och extra familj.
- v0.5: Lagt till fastighetsverktyg (Fas 6) och bilverktyg (Fas 7) med assets, service-schema, driftkostnader, renoveringsprojekt, dokumentlagring och handover-export vid försäljning.
- v0.4: Lagt till tema-system (light/dark/forest/ocean/sunset/nordic/high-contrast/metro), responsiv design för mobil/tablet/desktop, PWA-konfiguration. Native-appar skjuts till efter MVP men API-first design från start.
- v0.3: Lagt till anpassningsbar dashboard som startsida (Fas 1), familjechat (Fas 2), och tydligare placering av inköpslistor (Fas 3).
- v0.2: Bytt kalenderstrategi från OAuth till iCal-feed-prenumeration (read-only).
- v0.1: Initial version med Google Cloud som vald molnleverantör.

---

## Innehåll

1. [Vision och scope](#1-vision-och-scope)
2. [Faseringsstrategi](#2-faseringsstrategi)
3. [Teknikstack](#3-teknikstack)
4. [Molnval – jämförelse](#4-molnval--jämförelse)
5. [Arkitektur](#5-arkitektur)
6. [Datamodell (utkast)](#6-datamodell-utkast)
7. [Säkerhet och GDPR](#7-säkerhet-och-gdpr)
8. [Integrationer – realitetscheck](#8-integrationer--realitetscheck)
9. [Internationalisering](#9-internationalisering)
10. [Tema-system](#10-tema-system)
11. [Plattformar och distribution](#11-plattformar-och-distribution)
12. [API-first design](#12-api-first-design)
13. [Handover-export (Fas 6+)](#13-handover-export-fas-6)
14. [Prismodell och affärslogik](#14-prismodell-och-affärslogik)
15. [Publik sajt + signup + betalning](#15-publik-sajt--signup--betalning)
16. [MVP-definition (Fas 1)](#16-mvp-definition-fas-1)
17. [Sprint-plan Fas 1](#17-sprint-plan-fas-1)
18. [Risker och öppna frågor](#18-risker-och-öppna-frågor)
19. [Nästa steg](#19-nästa-steg)

---

## 1. Vision och scope

En webbportal som hjälper familjer att samordna vardagen: kalender, sysslor, måltider, hälsa och minnen. Användarna loggar in med sina befintliga identiteter (Google, Microsoft) och bjuder in familjemedlemmar till en delad familjegrupp.

**Målgrupp:** Familjer i Sverige (initialt), engelsktalande marknad senare.

**Affärsmodell:** Prenumeration via Stripe (förslag: ~49–79 SEK/mån per familj eller årsbetalning med rabatt – validera med marknadstest).

**Designprinciper:**
- Säkerhet och integritet är icke-förhandlingsbart, särskilt för barndata
- Mobile-first responsiv design (de flesta använder telefonen)
- Lätt att lägga till språk via JSON-filer
- Lokal lagring av sessions där möjligt (passkeys)
- Bygg det enkla rätt – undvik prematur komplexitet

---

## 2. Faseringsstrategi

Varje feature du listade är ett eget delprojekt. Fasindelningen följer din egen prioritering:

### Fas 1 – MVP webbapp (3–4 mån heltid / 6–8 mån deltid)
- Auth med Google + Microsoft + passkeys
- Familjegrupper med inbjudningar
- Anpassningsbar dashboard som startsida (drag-and-drop widgets)
- Gemensam familjekalender med iCal-feed-prenumeration (Google/Outlook/iCloud)
- Tema-system (light/dark/forest/ocean/sunset/nordic/high-contrast/metro)
- Responsiv design (mobil, tablet, desktop)
- PWA-konfiguration (installerbar från webbläsare, offline-stöd, push notifications på Android/desktop)
- **API-first design**: alla features exponeras via REST-API innan UI byggs, dokumenterat i OpenAPI
- Publik landningssida med signup
- Stripe-prenumeration
- Svenska + engelska
- Grundläggande GDPR-implementering

### Fas 1.5+ (efter validerad marknad) – Native-appar
- Capacitor wrapper för iOS App Store (kräver native push, biometric auth, deep linking, share, camera)
- TWA via Bubblewrap för Google Play Store
- PWABuilder för Microsoft Store
- Apple In-App Purchase / Google Play Billing-integration

Native-appar adderas **endast** när webbappen har validerat produktmarknadsfit (förslag: 100+ betalande familjer eller tydlig efterfrågan från användare). Fram tills dess fungerar PWA som "appen" på alla plattformar.

### Fas 2 – Sysslor, gamification och chat (3 mån)
- Sysslor med upprepningsschema
- Poängsystem och achievements
- Belöningsmotor (manuell godkännandeflöde för skärmtid)
- Familjechat (text + kontextuella trådar på kalenderevents och sysslor)
- Push-notiser

### Fas 3 – AI och hälsa (2–3 mån)
- AI-assistent för recept och veckomeny
- Inköpslistor (delade, generera från recept, export till mataffärs-app)
- Vaccinationsregister med påminnelser

### Fas 4 – Media och hem (2–3 mån)
- Fotoalbum
- Hemautomation (Home Assistant först – öppet API)

### Fas 5 – Integrationer
- SportAdmin (om iCal-feed finns)
- Hue, Homey
- Fler språk
- Eventuell OAuth-uppgradering för realtid + två-vägs kalendersync

### Fas 6 – Fastighetsverktyg (3–4 mån)

**Strategisk vinkel:** Differentierar appen från rena familjeappar. Familjer med villa/fritidshus får ett verktyg ingen konkurrent erbjuder integrerat.

- Fastighetsobjekt (Property): typ, adress, byggår, storlek, värde
- Tillgångar (Assets) kopplade till fastigheten: värmepanna, pool, bastu, badtunna, studsmatta, häck, gräsmatta, etc.
- Service-schema per asset (återanvänder Sysslor-koden från Fas 2 + kalenderpåminnelser)
- Driftkostnader med kategorier (el, vatten, fjärrvärme, försäkring, fastighetsskatt) och trendgrafer
- Renoveringsprojekt: budget vs faktiskt utfall, foton före/under/efter, fakturalagring (PDF/bilder)
- Dokumentarkiv: garantibevis, energideklaration, OVK-protokoll, lagfart
- **Handover-export**: PDF-paket vid försäljning med all servicehistorik, dokument, bilder

### Fas 7 – Fordonsverktyg (2 mån)

Återanvänder ~70% av Fas 6-kod (Vehicle är ett objekt med assets, kostnader och dokument – samma pattern).

- Fordon (Vehicle): regnr, modell, årsmodell, mätarställning
- **AI-genererad skötselplan** baserat på bilmodell (Claude API ger initialt service-schema)
- Service-historik: när, vad, kostnad, verkstad
- Kostnadsuppföljning: bränsle, försäkring, skatt, service, däck, parkering
- Dokumentarkiv: registreringsbevis, försäkring, kvitton, servicebok
- Påminnelser i kalendern: besiktning, försäkring förnyas, däckskifte
- **Handover-export**: PDF-paket vid försäljning med komplett servicebok

### Fas 8+ – Övriga utbyggnader
- Tile-baserad Metro-mode med flippande live tiles (alternativ dashboard-layout)
- Native-appar (iOS/Android/Microsoft Store) via Capacitor
- Premium-tier-modell om data visar att fastighet/bil-användare betalar mer

---

## 3. Teknikstack

### Frontend
- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS**
- **next-intl** för internationalisering (JSON-filer per språk, lätt att lägga till nya)
- **TanStack Query** för server-state
- **Zod** för validering (delas med backend via OpenAPI)
- **Shadcn/ui** för komponentbibliotek
- **@fullcalendar/react** för kalendervyer (månads-/vecko-/dagsvy)
- **@dnd-kit** för drag-and-drop (dashboard-widgets)
- **next-themes** eller egen tema-context för tema-byte
- **next-pwa** för service worker, offline-stöd och installerbarhet

### Backend
- **FastAPI** (Python 3.12+) med WebSocket-stöd för familjechat (Fas 2)
- **SQLAlchemy 2.0** (ORM, async)
- **Alembic** (migrations)
- **Pydantic v2** (validering)
- **httpx** (HTTP-klient för externa API:er)
- **icalendar** (parsing av iCal-feeds)
- **python-dateutil** (RRULE-expansion för återkommande events)
- **Celery** eller **Cloud Tasks/Functions** för bakgrundsjobb (kalenderfeed-fetch, påminnelser)

### Databas
- **PostgreSQL 16** (managed)
- **Redis** för cache och rate limiting (kan adderas senare)

### Auth
- **Clerk** (rekommenderat) – 10k MAU gratis, passkeys, social login, MFA out-of-the-box
- Alternativ: **Supabase Auth** om du vill ha mer kontroll
- Bygg INTE eget auth-system

### Betalning
- **Stripe Subscriptions** + **Customer Portal** (de hanterar UI för avbeställning, fakturor, etc.)

### Lagring
- Object storage för bilder (S3/GCS/Azure Blob beroende på molnval) + CDN

### AI
- **Claude API** för bästa kvalitet på AI-assistent (recept, menyplanering)
- Alternativ: Gemini eller OpenAI via molnleverantör

### Observability
- **Sentry** för error tracking (gratis tier räcker länge)
- Molnets inbyggda logging

### Utveckling
- **GitHub** + **GitHub Actions** för CI/CD
- **Docker** för konsekvent miljö
- **Playwright** för E2E-tester
- **Pytest** för backend-tester

---

## 4. Molnval – Google Cloud (valt)

**Beslut:** Google Cloud Platform, region `europe-north1` (Stockholm).

**Skäl:** Snabbast time-to-market för solo-utvecklare, billigast i början (skala-till-noll), snabba cold starts, bra DX. Microsoft Graph och Google Calendar fungerar lika bra oavsett moln – ingen lock-in där.

**Notering om skalning:** GCP hanterar workloads långt över "alla familjer i Sverige". Spotify och Snapchat körs på Google Cloud. Skalning är ett affärsproblem, inte ett teknikproblem – så länge arkitekturen är stateless, har bra databasdesign och använder bakgrundsjobb korrekt.

**Lock-in-strategi:** Håll dig till portabla byggstenar – containers, PostgreSQL, S3-kompatibel object storage. Undvik proprietära tjänster som Firestore eller Spanner. Då kan du migrera moln på 2–4 veckor om det någonsin behövs.

### Jämförelsetabell (för referens)

### Sammanfattning

| Kriterium | Google Cloud | Azure | AWS |
|-----------|--------------|-------|-----|
| EU-region för svenska familjer | Stockholm | Sverige Central (Gävle) | Stockholm |
| Pris småskaligt (serverless containers) | Mellan | Dyrast | Lägst compute |
| Cold starts | Snabbast | Långsammast | Mellan |
| Developer Experience | Enkel | Enkel | Komplex |
| Microsoft Graph (Outlook) | OK | Bäst | OK |
| Google Calendar | Bäst | OK | OK |
| AI-tjänster | Vertex AI / Gemini | Azure OpenAI | Bedrock |
| Free tier för start | $300 / 90 dagar | $200 / 12 mån | 12 mån free tier |
| Lock-in-risk | Låg om man håller sig till containers | Låg | Högre om man använder många AWS-specifika tjänster |

### Tjänstemappning på GCP

| Komponent | GCP-tjänst | Notering |
|-----------|------------|----------|
| Backend (FastAPI) | Cloud Run | Skalar till noll, region `europe-north1` |
| Databas | Cloud SQL for PostgreSQL 16 | `db-g1-small` (~25 USD/mån), privat IP |
| Object storage | Cloud Storage | Standard storage, Stockholm |
| CDN för bilder | Cloud CDN | Framför Cloud Storage |
| Bakgrundsjobb | Cloud Tasks + Cloud Scheduler | Kalendersync, påminnelser |
| Secrets | Secret Manager | iCal-URL:er (krypterade), API-nycklar |
| Container registry | Artifact Registry | För Docker-bilder |
| Logging/monitoring | Cloud Logging + Cloud Monitoring | Komplettera med Sentry för errors |
| Email | SendGrid eller Resend | Mer dev-vänliga än Cloud-native alternativ |

### Kostnadsuppskattning (~100 aktiva familjer/mån)

| Tjänst | Månadsvis |
|--------|-----------|
| Cloud Run | 0–10 USD (skalar till noll) |
| Cloud SQL | ~25 USD |
| Cloud Storage + CDN | ~5 USD |
| Vertex AI / Claude API | ~5–15 USD |
| Vercel (frontend) | 0–20 USD |
| Clerk (auth) | 0 USD (under 10k MAU) |
| Stripe | 0 fast, ~3% per transaktion |
| Domän + diverse | ~5 USD |
| **Totalt** | **~40–80 USD/mån** |

Första 90 dagarna är nästan gratis tack vare $300 GCP free credit.

---

## 5. Arkitektur

### Hög nivå

```
[Webbläsare / mobil]
        │
        ▼
[Next.js på Vercel]  ◄── publik sajt, app-UI, i18n
        │
        │ HTTPS + JWT (från Clerk)
        ▼
[FastAPI på Cloud Run / Container Apps]
        │
        ├── PostgreSQL (familjedata, sysslor, kalender-metadata, cachade events)
        ├── Object Storage (bilder)
        ├── Redis (cache, rate limit)
        ├── Stripe API (prenumerationer)
        ├── Externa iCal-feeds (Google/Outlook/iCloud – per familjemedlem)
        └── AI API (Claude/Gemini)

[Bakgrundsjobb]
        │
        ├── Kalenderfeed-fetch (var 30 min per feed, parsas och cachas)
        ├── Påminnelser (cron, dagligen)
        └── Stripe webhooks (event-driven)
```

### Princip: Modulär monolit

En enda backend-applikation, men strukturerad i tydliga moduler:

```
app/
├── auth/           # Clerk-integration, JWT-validering
├── families/       # Familjegrupper, inbjudningar, medlemmar
├── dashboard/      # Anpassningsbar dashboard, widget-layouts
├── calendar/       # Kalenderlogik, iCal-feed-fetch, events
├── chores/         # (Fas 2) Sysslor, poäng, achievements
├── chat/           # (Fas 2) Familjechat, kontextuella trådar, WebSockets
├── meals/          # (Fas 3) Recept, menyer
├── shopping/       # (Fas 3) Inköpslistor (delade per familj)
├── health/         # (Fas 3) Vaccinationer
├── photos/         # (Fas 4) Album
├── automation/     # (Fas 4) Hemautomation
├── assets/         # (Fas 6+) Generisk asset-modell – fastighets- och fordonsobjekt
│                   #          delar samma datamodell (Property, Vehicle är subtyper)
├── properties/     # (Fas 6) Fastighetsspecifik logik, handover-export
├── vehicles/       # (Fas 7) Fordonsspecifik logik, AI-skötselplan, handover
├── billing/        # Stripe-integration
├── i18n/           # Översättningsstöd
└── core/           # Delade utilities (DB, settings, etc.)
```

Varje modul har egna endpoints, services och modeller. Kommunicerar via funktion-anrop, inte HTTP. Gör att du kan extrahera till microservice senare om det verkligen behövs (det kommer det troligen inte göra).

### Princip: Dashboard som widget-system

Startsidan (`/app`) är en anpassningsbar dashboard. Användaren väljer själv vilka widgets som visas och var. Detta är viktigt av flera skäl:

- **Personalisering ökar engagement** – varje familj har olika prioriteter (en familj fokuserar på sport, en annan på sysslor)
- **Onboarding blir lättare** – default-layout visar de viktigaste widgets, resten upptäcks gradvis
- **Skalar med produkten** – nya features (Fas 3, 4, 5) lanseras som nya widgets, inte nya menypunkter
- **Tydlig hierarki** – kalendern stannar som "deep view" i sidebaren, dashboarden ger snabb översikt

**Teknisk modell:**

```
Frontend:
- WidgetRegistry: { type → { component, defaultSize, allowedSizes, requiredFeatures } }
- DashboardGrid: tar layout-array och renderar widgets enligt position+size
- Drag-and-drop med @dnd-kit: när användaren flyttar widget, spara ny layout

Backend:
- GET  /api/dashboard/layout       → returnerar användarens layout
- PUT  /api/dashboard/layout       → sparar ny layout (debounced från frontend)
- GET  /api/widgets/<type>/data    → varje widget hämtar sin data via egen endpoint

Widget-arkitektur (frontend):
- Varje widget är en self-contained komponent
- Tar in props: { size, config, familyId }
- Hämtar egen data via TanStack Query
- Hanterar egna loading/error states
- Rendrar inom angiven storlek (small/medium/large/full)
```

**Default-layouts** ska finnas för olika roller. T.ex. "förälder med småbarn" får dagskalender + sysslor + chat, medan "tonåring" får dagskalender + chat + poängställning. Default-uppsättningar kan justeras över tid baserat på användardata.

---

## 6. Datamodell (utkast)

```
User
├── id (UUID)
├── clerk_user_id (string)
├── email
├── locale (sv | en)
├── timezone
├── theme_preference (light | dark | forest | ocean | sunset | nordic | high_contrast | metro)
├── created_at

Family
├── id (UUID)
├── name
├── owner_user_id → User (familjens ägare/betalare)
├── stripe_customer_id
├── stripe_subscription_id
├── tier (standard | premium)
├── billing_cycle (monthly | yearly)
├── subscription_status (trialing | active | past_due | canceled | expired)
├── trial_ends_at                       # Initial Standard-trial (30 dagar från signup)
├── first_paid_at                       # När de blev betalande första gången
├── premium_trial_started_at            # Om/när Premium-trial aktiverades
├── premium_trial_ends_at               # Premium-trial slutdatum
├── has_used_premium_trial (bool)       # Engångsförmån, kan inte återställas
├── max_members (default 6)
├── storage_quota_bytes (25 GB Standard, 100 GB Premium + addons)
├── created_at

FamilyAddon
├── id (UUID)
├── family_id → Family
├── addon_type (extra_family | storage_25gb | storage_100gb | storage_500gb)
├── stripe_subscription_item_id
├── status (active | canceled)
├── activated_at, canceled_at
├── target_family_id (nullable – sätts för extra_family-addon)

UserFamilyMembership
├── id (UUID)
├── user_id → User
├── family_id → Family
├── is_primary (bool)  # En användare har EN primär familj
├── role (owner | parent | child)
├── display_name
├── color_hex (för kalender-events)
├── invited_email (för pending invites)
├── joined_at

ExternalCalendarFeed
├── id (UUID)
├── family_member_id → FamilyMember
├── name (etikett, t.ex. "Annas Google-kalender")
├── ical_url (krypterad – är en hemlig länk)
├── color_hex (override, annars medlemmens default)
├── last_fetched_at
├── last_fetch_status (success | failed | parse_error)
├── last_error_message
├── enabled (bool)
├── created_at, updated_at

CachedExternalEvent
├── id (UUID)
├── feed_id → ExternalCalendarFeed
├── external_uid (UID från iCal-feeden)
├── title
├── description
├── location
├── start_at, end_at
├── all_day (bool)
├── recurrence_rule (RRULE-string)
├── last_seen_at  # uppdateras vid varje fetch; events utan ny last_seen tas bort

InternalCalendarEvent
├── id (UUID)
├── family_id → Family
├── creator_user_id → User
├── title
├── description
├── location
├── start_at, end_at
├── all_day (bool)
├── recurrence_rule (RRULE-string)
├── visibility (family | private)
├── created_at, updated_at

UserDashboardLayout
├── id (UUID)
├── user_id → User
├── family_id → Family       # layout är per användare per familj
├── widgets (jsonb)          # array: [{type, position, size, config}]
├── updated_at

# Widget-typer i jsonb:
# - "calendar_today" (storlek: large/full)
# - "calendar_week" (medium)
# - "chores_today" (small/medium)
# - "family_chat" (medium) [Fas 2]
# - "shopping_list" (small) [Fas 3]
# - "meal_today" (small) [Fas 3]
# - "points_leaderboard" (small) [Fas 2]
# - "upcoming_vaccinations" (small) [Fas 3]
# - "recent_photos" (medium) [Fas 4]
# - "property_overview" (medium) [Fas 6]
# - "upcoming_property_service" (small) [Fas 6]
# - "vehicle_overview" (small) [Fas 7]
# - "upcoming_vehicle_service" (small) [Fas 7]
# - osv.

FamilyInvite
├── id (UUID)
├── family_id → Family
├── invited_email
├── invited_by_user_id → User
├── token_hash (SHA-256 av engångstoken som skickas i mejl)
├── expires_at
├── accepted_at
```

**Fas 2 tabeller (chat-relaterade):**

```
ChatChannel
├── id (UUID)
├── family_id → Family
├── type (general | event_thread | chore_thread)
├── context_id (UUID, nullable – peka på event/chore om type är thread)
├── name (för general: "Familjechat", för trådar: ärvs från event/chore)
├── created_at

ChatMessage
├── id (UUID)
├── channel_id → ChatChannel
├── sender_user_id → User
├── body (text)
├── attachment_url (nullable, för bilder)
├── reply_to_message_id (nullable, för svar)
├── edited_at
├── deleted_at (soft delete)
├── created_at

ChatReadReceipt
├── id (UUID)
├── channel_id → ChatChannel
├── user_id → User
├── last_read_message_id → ChatMessage
├── updated_at
```

Övriga Fas 2+ tabeller (Chore, ChoreCompletion, Achievement, Reward, Recipe, MealPlan, ShoppingList, ShoppingListItem, Vaccination, Photo, Album) läggs till per fas.

**Fas 6 tabeller (fastighet):**

Property och Vehicle delar grundstruktur via en gemensam `OwnedAsset`-modell (DRY-princip). Subtyper definieras med discriminator-kolumn.

```
OwnedAsset                  # Bas-modell för Property OCH Vehicle
├── id (UUID)
├── family_id → Family
├── type (property | vehicle)   # discriminator
├── name (t.ex. "Hemmet", "Volvon")
├── created_at
├── archived_at (nullable, för sålda objekt)

Property                    # extends OwnedAsset
├── owned_asset_id → OwnedAsset
├── property_type (villa | fritidshus | radhus | bostadsrätt | annat)
├── address
├── built_year
├── living_area_sqm
├── plot_area_sqm
├── current_value (nullable, för uppskattning)
├── purchase_date, purchase_price

Vehicle                     # extends OwnedAsset
├── owned_asset_id → OwnedAsset
├── registration_number
├── make (Volvo, Toyota, etc.)
├── model (XC60, RAV4, etc.)
├── year_model
├── current_mileage_km
├── fuel_type (petrol | diesel | hybrid | electric)
├── purchase_date, purchase_price
├── ai_service_plan_generated_at  # När AI senast genererade plan

Sub-asset                   # Tillgångar kopplade till en Property/Vehicle
├── id (UUID)
├── owned_asset_id → OwnedAsset
├── category (heating | pool | garden_equipment | car_tire | etc.)
├── name (t.ex. "Värmepanna IVT 590", "Vinterdäck Michelin")
├── manufacturer, model, serial_number
├── installed_at, warranty_until
├── notes

ServiceTask                 # Återkommande servicebehov
├── id (UUID)
├── sub_asset_id → Sub-asset (nullable, kan vara generell för objektet)
├── owned_asset_id → OwnedAsset
├── name (t.ex. "Service värmepanna", "Däckskifte")
├── description
├── recurrence_rule (RRULE: "varje år", "var 15000 km", "april + oktober")
├── recurrence_basis (date | mileage)  # bil-service kan vara mile-based
├── next_due_at (datum eller km-värde)
├── reminder_days_before
├── synced_to_calendar (bool)

ServiceTaskCompletion       # Historik
├── id (UUID)
├── service_task_id → ServiceTask
├── completed_at
├── completed_by_user_id → User
├── cost (nullable)
├── vendor (t.ex. "VVS-firma X", "Bilverkstad Y")
├── notes
├── document_ids (foreign keys till Document)

CostEntry                   # Driftkostnader och utgifter
├── id (UUID)
├── owned_asset_id → OwnedAsset
├── category (electricity | water | insurance | tax | fuel | service | etc.)
├── amount, currency
├── date_from, date_to       # för periodiska kostnader (el-räkning)
├── description
├── document_ids (foreign keys till Document för fakturan)

Project                     # Renoveringar, större jobb
├── id (UUID)
├── owned_asset_id → OwnedAsset
├── name (t.ex. "Renovera badrum")
├── status (planning | in_progress | completed | cancelled)
├── budget_amount, currency
├── started_at, completed_at
├── description

ProjectExpense
├── id (UUID)
├── project_id → Project
├── amount, currency
├── description
├── date
├── document_ids (foreign keys till Document)

Document                    # Generisk dokumentlagring
├── id (UUID)
├── family_id → Family
├── owned_asset_id (nullable)
├── project_id (nullable)
├── service_task_completion_id (nullable)
├── type (invoice | warranty | manual | photo | certificate | other)
├── filename
├── content_type
├── storage_url (krypterad – Cloud Storage signed URL)
├── uploaded_by_user_id → User
├── uploaded_at
```

**Designprincip:** En och samma `Document`-tabell används för alla dokument – fakturor, garantier, foton, intyg. Foreign keys är nullable så ett dokument kan kopplas till en kostnad, ett projekt, en service-completion, eller bara till objektet generellt.

**Notering om bilen:** AI-genererad skötselplan blir en samling `ServiceTask`-rader som AI skapar baserat på bilmodellen. Användaren kan sedan justera, lägga till och ta bort. AI:n är ett startförslag, inte sanning.

---

## 7. Säkerhet och GDPR

### Hard requirements från dag 1

- All data hostad i EU-region
- TLS 1.3 överallt, HSTS, secure cookies
- Kryptering i vila (default i samtliga managed databaser)
- Lösenordsfri login som default (passkeys + social login)
- MFA tillgängligt för alla konton
- iCal-URL:er krypterade i databasen (de är hemliga delningslänkar – använd appspecifik nyckel via KMS)
- Rate limiting på alla auth-endpoints
- CSP, CORS strikt konfigurerat
- Aldrig logga personuppgifter eller tokens
- Audit log för access till barndata

### GDPR

- Personuppgiftsbiträdesavtal (DPA) med samtliga underleverantörer (Clerk, Stripe, molnleverantör, Sentry, Vercel)
- Tydlig integritetspolicy + cookiepolicy
- Cookie consent (Cookiebot eller egen lösning)
- Rätt till radering implementerat – fullständig data-deletion inom 30 dagar
- Rätt till dataportabilitet – export i JSON
- Personuppgiftsinventering: vilken data har vi, var, hur länge
- Datalagringspolicy: ta bort inaktiva familjer efter X månader

### Barnspecifikt

- Föräldrar (familjeägare) godkänner barns konto
- Inga tredjepartsanalyser på sidor barn besöker
- Minimal datainsamling om barn (endast vad funktionen kräver)
- Tydlig age gating

---

## 8. Integrationer – realitetscheck

Det här är viktigt eftersom vissa drömfunktioner inte är tekniskt möjliga.

### Skärmtid – tyvärr svårt

- **Apple Screen Time**: inget publikt API. Kan inte programmatiskt lägga till tid.
- **Google Family Link**: inget publikt API.
- **Microsoft Family Safety**: inget publikt API.
- **PlayStation parental controls**: inget publikt API.

**Realistisk lösning:** Notifikation till föräldern ("Erik har tjänat 30 min skärmtid – godkänn?") där föräldern manuellt justerar i respektive app. Kan automatiseras delvis via push-notiser med deep links.

### Kalenderintegration – iCal-feed-strategi

**Beslut:** Vi använder iCal-feed-prenumeration (read-only) istället för OAuth + Calendar API. Användaren publicerar sin kalender hos sin leverantör och klistrar in den hemliga iCal-URL:en i vår app.

**Fördelar:**
- Ingen Google OAuth-verifiering (sparar 4–6 veckor + ev. CASA-revision)
- Ingen Microsoft Graph-app-registrering
- Apple iCloud Calendar fungerar gratis (stort plus i Sverige – många familjer har iPhone)
- Mindre känslig data lagras (URL:er, inte access tokens)
- Ingen token-livscykelhantering (inga refresh tokens, inga 401-fel)
- Tydligare GDPR-story (datasparsamhet)

**Begränsningar att vara ärlig om i marknadsföring:**
- Read-only – appen kan inte skapa events i användarens privata kalender
- Uppdateringar har viss fördröjning (ofta upp till 30 min för Google iCal-feeds)
- Användaren måste manuellt aktivera iCal-publicering (kräver bra onboarding-guider)
- Ingen automatisk upptäckt av nya kalendrar – manuellt tillägg per feed

**Hur det fungerar för användaren:**

| Plattform | Var hittar man iCal-länken |
|-----------|---------------------------|
| Google Calendar | Inställningar → välj kalender → "Secret address in iCal format" |
| Outlook.com / Microsoft 365 | Settings → Calendar → Shared calendars → Publish a calendar → ICS-link |
| Apple iCloud | iCloud.com → Calendar → välj kalender → "Public Calendar" → kopiera webcal-URL |

**Teknisk implementation:**
- `icalendar`-bibliotek (Python) parsar feeden
- `python-dateutil` expanderar RRULE för återkommande events
- Cron-jobb hämtar varje feed var 30:e minut
- Resultatet cachas i `CachedExternalEvent`-tabellen
- Frontend visar cache + manuell "uppdatera"-knapp för force refresh

**Senare uppgradering (Fas 5+):** Erbjud OAuth som premiumfeature ("realtidssync, två-vägs") om användare efterfrågar det. Du kan då även exponera familjekalendern som iCal-feed som användare kan prenumerera på i sin Google/Outlook.

### SportAdmin och andra föreningssystem

Passar **utmärkt** med vår iCal-strategi. Vissa föreningar exporterar iCal-feed för matcher och träningar. Användaren lägger till URL:en på samma sätt som sin privata kalender – ingen särskild integration behövs.

### ICA, Coop, Willys

Ingen har öppna API:er för inköpslistor. Lösningar:
- Generera lista som textformat användaren klistrar in i deras app
- Deep link till respektive app om de stödjer det
- Inbyggt receptbibliotek där användaren själv exporterar

### Hemautomation

- **Home Assistant**: utmärkt API (REST + WebSocket). Bästa valet för Fas 4.
- **Philips Hue**: Hue Remote API kräver registrerad partner. Lokal Bridge API funkar bäst.
- **Homey**: Web API finns, men kräver Homey Pro.

---

## 9. Internationalisering

### Strategi

- Alla UI-strängar i JSON-filer per språk: `/locales/sv/common.json`, `/locales/en/common.json`
- `next-intl` på frontend för automatisk laddning
- Backend returnerar `locale`-aware data där relevant (datum, valuta)
- Användarens språkval sparas i `User.locale`
- Default-språk avgörs av webbläsarens `Accept-Language`

### Att lägga till ett nytt språk

1. Skapa `/locales/<lang>/common.json` med översatta nycklar
2. Lägg till språket i `next-intl` config
3. Översätt eventuella e-postmallar
4. Testa datum-/talformatering

Inga kodändringar krävs i affärslogiken.

---

## 10. Tema-system

Användaren ska kunna välja tema för att personalisera appen. Implementeras via CSS-variabler som skrivs till `<html>`-elementet vid byte – hela appen uppdateras direkt utan reload.

### Tillgängliga teman i MVP

| Tema | Beskrivning |
|------|-------------|
| Light | Default. Vita/ljusa toner. |
| Dark | Mörka toner, mindre påfrestande på kvällen. |
| Forest | Jordnära gröna toner. |
| Ocean | Lugna blå/turkosa toner. |
| Sunset | Varma orange/rosa toner. |
| Nordic | Vita och ljusblå minimalistiska toner. |
| High contrast | För tillgänglighet (WCAG AAA). |
| Metro | Hyllning till Windows Phone-eran. |

### Metro-temat (specifikation)

Metro-temat är ett **visuellt tema** – det byter färger, typsnitt, kanter och spacing. Det är **inte** en omdesign av layouten med flippande live tiles (det skulle vara en helt annan app, ~6–8 veckors arbete utöver MVP).

Vad Metro-temat innehåller:
- Skarpa kanter (`border-radius: 0` på de flesta element)
- Segoe UI som typsnitt (gratis på Windows, fallback till systemfont)
- Solida färgblock istället för subtila skuggor
- Klassiska Metro-accentfärger (magenta, cyan, lime som valbara accentfärger)
- Stora typografihierarkier (XXL-rubriker)
- Minimal användning av gradienter och mjuka skuggor

**Tile-baserad dashboard-layout** med flippande live tiles kan adderas i Fas 5+ som en alternativ dashboard-layout (inte ett tema). Det skulle vara ett separat delprojekt.

### Implementation

```typescript
// Definition
const themes = {
  light: { "--color-bg-primary": "#ffffff", ... },
  dark: { "--color-bg-primary": "#1a1a1a", ... },
  metro: {
    "--color-bg-primary": "#000000",
    "--color-accent": "#0078D7",
    "--font-family": "'Segoe UI', sans-serif",
    "--border-radius-md": "0",
    ...
  },
  // ...
};

// Apply
function applyTheme(themeName: string) {
  const theme = themes[themeName];
  Object.entries(theme).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
}
```

Tema-valet sparas i `User.theme_preference` och i `localStorage` för snabbt initial-laddning innan auth.

### Lägga till nya teman

1. Definiera CSS-variabel-värden i `themes`-objektet
2. Lägg till tema-namnet i tema-väljaren
3. Översätt tema-namnet i `i18n`-filerna
4. Klart – inga andra kodändringar.

---

## 11. Plattformar och distribution

### Strategi: Webb först, native senare

**Beslut:** I MVP fokuserar vi enbart på webbappen som PWA. Native-appar adderas i Fas 1.5+ när produktmarknadsfit är validerad.

**Anledning:** Som solo-utvecklare är fokus den största framgångsfaktorn. PWA fungerar utmärkt på alla plattformar, kostar inget extra att distribuera, och kan installeras på hemskärmen. Native-appar adderar 4–8 veckors arbete och App Store-byråkrati som vi kan undvika tills marknaden är bevisad.

**När native blir relevant:** 100+ betalande familjer, eller tydlig efterfrågan från användare, eller behov av features som bara native ger (t.ex. djup OS-integration).

### Responsiv design – brytpunkter

| Breakpoint | Target | Layout |
|------------|--------|--------|
| < 640px | Mobil | 1-kolumns dashboard, bottom nav-bar, dagskalender |
| 640–1024px | Tablet | 2-kolumners dashboard, sidebar collapsible, veckokalender |
| > 1024px | Desktop | 3+ kolumners dashboard, fast sidebar, månadskalender |

### PWA-konfiguration

- **manifest.json** med ikoner i alla storlekar, theme color, display: standalone
- **Service Worker** (via `next-pwa`) för offline-stöd
- **Cache-strategi:** Network-first för API, cache-first för statiska tillgångar
- **App icons** i alla storlekar (16x16 till 512x512)
- **Splash screens** för iOS PWA
- **Web Push** för notifikationer (fungerar på Android/desktop, iOS Safari kräver iOS 16.4+)

### Native-strategi för Fas 1.5+

När det blir dags:

| Plattform | Distribution | Teknik | Estimerat arbete |
|-----------|--------------|--------|------------------|
| Apple App Store | Capacitor + native-features | Capacitor | 3–4 veckor |
| Google Play Store | Trusted Web Activity | Bubblewrap | 2–3 dagar |
| Microsoft Store | MSIX-paket | PWABuilder | 1–2 dagar |

**iOS är det stora jobbet.** Apple kräver att appen erbjuder native-features utöver bara en webview, annars avvisas den enligt App Store Review Guideline 4.2. Native-features som krävs:

- Push notifications via Apple Push Notification Service
- Biometrisk auth (Face ID / Touch ID) som komplement till passkeys
- Native deep linking (familjeinbjudningar i mejl öppnar appen)
- Native delning för kalender-events
- Camera-tillgång för fotouppladdning
- Local notifications för offline-påminnelser

### Apple In-App Purchase – varning för framtiden

Om native-iOS-app ska säljas i App Store: Apple kräver att digitala prenumerationer säljs via deras In-App Purchase med 30% första året / 15% därefter.

**Strategier (för när det blir aktuellt):**

1. **Sälj på webbplatsen, läs in status i appen.** Tillåtet sedan EU DMA-reglerna men i gråzon.
2. **Acceptera Apples avgift.** 30% av 49 SEK = 14:70 SEK Apple-avgift.
3. **Hybrid: ta lite mer betalt på iOS** för att kompensera (49 → 65 SEK).

Inte ett problem för MVP – vi säljer prenumeration via webbplatsen.

---

## 12. API-first design

För att framtidssäkra projektet och möjliggöra native-appar utan refaktorisering bygger vi backend som ett **konsumentagnostiskt API**.

### Princip

- **Webbappen är bara en av många klienter.** Andra framtida klienter: iOS-app, Android-app, Microsoft Store-app, eventuella tredjepartsintegrationer.
- **All affärslogik lever i backend.** Frontend är "tunn" – validerar input, visar data, hanterar UI-state. Inget mer.
- **Webbappen får inga gräddfiler.** Om webbappen behöver något, är det ett endpoint som vilken annan klient som helst kan använda.

### Vad det innebär konkret

**Endpoints är RESTful och resurs-orienterade:**

```
GET    /api/v1/families/{family_id}/calendar/events
POST   /api/v1/families/{family_id}/calendar/events
PUT    /api/v1/families/{family_id}/calendar/events/{event_id}
DELETE /api/v1/families/{family_id}/calendar/events/{event_id}

GET    /api/v1/families/{family_id}/dashboard/layout
PUT    /api/v1/families/{family_id}/dashboard/layout

GET    /api/v1/users/me
PATCH  /api/v1/users/me  # uppdatera theme_preference, locale, etc.
```

**Versionering** via URL-prefix (`/v1/`). När vi i framtiden bryter API-kompatibilitet introducerar vi `/v2/` parallellt och fasar ut `/v1/` gradvis. Native-klienter kan uppdateras i sin egen takt.

**Auth via JWT** (från Clerk) i `Authorization: Bearer`-header. Fungerar identiskt för alla klienter.

**JSON in, JSON ut.** Inga server-renderade HTML-fragment, inga sessions cookies för data, ingen klient-specifik logik.

### OpenAPI-dokumentation från start

FastAPI genererar OpenAPI 3-specifikation automatiskt från Pydantic-modellerna. Vi exponerar den på `/api/docs` (Swagger UI) och `/api/openapi.json`.

**Varför detta är viktigt:**
- Kan generera typade API-klienter för framtida iOS/Android-appar (Swift/Kotlin) automatiskt
- Webbappen använder samma spec för att generera TanStack Query-hooks
- Tredje part kan integrera mot ditt API utan dokumentations-sökmotor
- Du själv glömmer aldrig hur ett endpoint fungerar

### API-design-checklista

För varje nytt endpoint:

- [ ] Versionerat under `/v1/`
- [ ] Resource-orienterat (substantiv, inte verb)
- [ ] Korrekt HTTP-metod (GET/POST/PUT/PATCH/DELETE)
- [ ] Pydantic request- och response-modeller (= OpenAPI-doc)
- [ ] Auth-krav tydligt (kräver JWT? specifik roll?)
- [ ] Tenant-isolation: alla endpoints filtrerar på `family_id` från användarens medlemskap
- [ ] Pagination för list-endpoints (cursor-baserad om möjligt)
- [ ] Idempotens på POST där det är meningsfullt (Idempotency-Key-header)
- [ ] Felmeddelanden följer RFC 7807 Problem Details
- [ ] Inga internal-only fält i response (filtrera medvetet)

### Vad detta INTE betyder

- Ingen GraphQL (REST räcker, mindre komplexitet)
- Inga microservices (modulär monolit, samma backend serverar webb och senare native)
- Inga API-tokens till slutanvändare i MVP (Clerk JWT räcker)

### Pragmatiska undantag

Vissa endpoints kan vara webb-specifika i början (t.ex. server-side rendering data), men de byggs alltid OVANPÅ ett rent API. Aldrig istället för det.

---

## 13. Handover-export (Fas 6+)

En av de starkaste differentierande featurerna i projektet. När en användare säljer ett hus eller en bil kan de generera ett komplett "Handover Package" att lämna över till köparen.

### Vad som genereras

**För fastighet:**

En PDF + bilagor som innehåller:
- Översikt: typ, byggår, storlek, ägd sedan
- Lista över alla tillgångar (värmepanna, pool, etc.) med modell, ålder, garantier
- Komplett servicehistorik per tillgång ("Värmepannan servad 2024-04-12 av VVS X för 3 800 kr")
- Tidslinje över renoveringar med kostnader och bilder
- Driftkostnadssammanställning senaste 3 åren (el, vatten, etc.)
- Dokumentpaket: garantibevis, manualer, energideklaration, OVK-protokoll
- Rekommenderade hantverkare (de som använts tidigare)
- "Tips till nya ägaren" – fri text från säljaren

**För fordon:**

- Komplett servicebok (alla service-completions)
- Mätarställning över tid
- Kostnadssammanställning (bränsle, service, försäkring)
- Bilder genom åren
- AI-genererad "till köparen": "Bilen behöver däckskifte i oktober, kamrem ska bytas vid 120 000 km..."
- Dokumentpaket: registreringsbevis, försäkringsbevis, kvitton

### Varför detta är värdefullt

1. **Köparen får trygghet** – allt om bostaden/bilen är dokumenterat
2. **Säljaren får högre pris** – välskötta objekt med tydlig historik säljs för mer
3. **Det är unikt** – ingen konkurrent erbjuder detta
4. **Det är delbart** – PDF:en kan delas via email, vilket marknadsför appen
5. **Kraftigt argument för att INTE radera kontot** – när du säljer huset om 10 år vill du ha all historik

### Teknisk implementation

- Bakgrundsjobb genererar PDF (via WeasyPrint eller Playwright headless Chrome)
- Inkluderar embedded bilder och dokument
- Stora PDF:er (kan bli 50+ sidor med foton) genereras async och mejlas eller laddas ner
- Vattenmärkning: "Genererad av Boet" diskret i sidfoten – gratis marknadsföring

### Pricing-möjlighet

Detta kan motivera **premium-tier** eller engångsavgift för export:
- Standard: alla features ingår, men handover-export kostar 199 kr per export
- Premium: handover-export ingår

Beslut tas baserat på data när Fas 6 lanserats.

---

## 14. Prismodell och affärslogik

### Grundprincip: en prenumeration per familj

En familj köper **en prenumeration** som täcker alla familjemedlemmar. Detta matchar hur svenska familjer redan tänker på Spotify Family, Apple One Family, Microsoft 365 Family m.fl.

**Familjedefinition:** Upp till 6 medlemmar i samma familj. Större familjer behöver kontakta support för specialavtal.

### Tier-struktur

| Tier | Pris/mån | Pris/år | Beskrivning |
|------|----------|---------|-------------|
| Standard-trial | 0 kr | – | 30 dagar Standard utan kort vid signup |
| **Standard** | 79 kr | 790 kr (~10% rabatt) | Grundläggande familjeapp |
| Premium-trial | 0 kr | – | 30 dagar Premium efter 30 dagar som betalande Standard-kund (engångsförmån) |
| **Premium** | 149 kr | 1490 kr (~17% rabatt) | Allt + AI + fastighet/bil |

### Trial-modellen i detalj

Vi kör en **tvådelad trial-strategi** som skyddar marginalen och belönar lojalitet:

**Steg 1: Standard-trial vid signup**
- 30 dagar gratis vid registrering
- Inget kort krävs
- Full Standard-funktionalitet
- Vid trial-slut: måste lägga till betalning för att fortsätta

**Steg 2: Premium-trial efter en månad som betalande**
- Aktiveras manuellt av användaren (inte automatiskt)
- Tillgängligt **endast** om:
  - Familjen har varit aktivt betalande Standard-kund i minst 30 dagar
  - Premium-trial inte använts tidigare (engångsförmån)
- 30 dagar gratis Premium när aktiverad
- Vid trial-slut: tillbaka till Standard, kan uppgradera när som helst

**Varför denna modell:**

1. **Skyddar marginalen** – Premium-trial ges bara till bevisat betalande kunder
2. **Belönar lojalitet** – "tack för att du varit kund i en månad, här är något extra"
3. **Pre-qualifikation** – Den som betalat för Standard i en månad är mycket mer benägen att uppgradera
4. **Bygger förtroende** – upplevs som en uppgradering, inte ett desperat uppsäljförsök
5. **Naturlig conversion** – psykologiskt: efter 30 dagar med Premium-funktioner vill man inte gå tillbaka

**Eligibility-tabell:**

| Tillstånd | Premium-trial tillgänglig? |
|-----------|----------------------------|
| Standard-trial pågår | Nej |
| Active Standard, < 30 dagar som betalande | Nej (visa "Tillgängligt om X dagar") |
| Active Standard, ≥ 30 dagar som betalande, ej använt Premium-trial | **Ja** |
| Active Standard, har redan använt Premium-trial | Nej |
| Active Premium | Nej (är ju redan där) |
| Past_due eller canceled | Nej |

### Vad ingår per tier

**Standard (79 kr/mån):**
- Anpassningsbar dashboard
- Familjekalender (intern + iCal-feeds från Google/Outlook/iCloud)
- Familjemedlemmar (upp till 6) med rollhantering
- Gamifierade sysslor (Fas 2)
- Familjechat (Fas 2)
- Vaccinationskort (Fas 3)
- Fotoalbum (Fas 4)
- 25 GB delad familjelagring
- Alla teman (light/dark/forest/ocean/sunset/nordic/high-contrast/metro)
- PWA + responsive design
- Svenska och engelska

**Premium (149 kr/mån):**
- Allt i Standard, plus:
- AI-assistent för recept och veckomeny (Fas 3)
- AI-genererat shoppinglista
- AI-skötselplan för bilar (Fas 7)
- Fastighetsverktyg (Fas 6)
- Fordonsverktyg (Fas 7)
- Handover-export vid försäljning av fastighet/bil
- Hemautomation-integration (Fas 4)
- 100 GB delad familjelagring
- Prioriterad support

### Addons – köps utöver Standard eller Premium

**Extra familj** (addon):

En användare tillhör primärt sin egen familj men kan ingå i fler familjer (sommarstuga, delägd båt, mor-/farföräldrarnas hushåll). Den **andra familjen** måste själv ha en prenumeration **eller** vara en "extra familj"-addon från någon medlems primära prenumeration.

- **Extra familj på Standard**: +49 kr/mån eller +490 kr/år (per extra familj)
- **Extra familj på Premium**: +89 kr/mån eller +890 kr/år (per extra familj)

Den extra familjen får samma funktionalitet som ägarens primära tier. T.ex. om jag har Premium och köper "extra familj" så är även sommarstuge-familjen Premium.

**Storage-addons:**

| Addon | Pris/mån | Pris/år |
|-------|----------|---------|
| +25 GB | 19 kr | 190 kr |
| +100 GB | 49 kr | 490 kr |
| +500 GB | 149 kr | 1490 kr |

Addon-storage delas inom familjen.

### Driftkostnadsanalys

Baserat på Cloud Run + Cloud SQL + Cloud Storage + Claude API + Stripe + Clerk:

| Tier | Genomsnittlig driftkostnad/mån | Stripe-avgift | Netto till oss | Marginal |
|------|--------------------------------|----------------|-----------------|----------|
| Standard mån (79 kr) | ~15 kr | ~3 kr | 76 kr | ~61 kr |
| Standard år (66 kr/mån) | ~15 kr | ~2.50 kr/mån | 63.50 kr/mån | ~48.50 kr |
| Premium mån (149 kr) | ~40-55 kr | ~3.90 kr | 145 kr | ~90-105 kr |
| Premium år (124 kr/mån) | ~40-55 kr | ~3.30 kr/mån | 121 kr/mån | ~66-81 kr |

**Genomsnittlig marginal per kund och månad:** 60–90 kr beroende på tier-mix.

### Break-even-analys

Anta fasta kostnader (din tid värderas inte här):
- Cloud-baskostnader (även utan kunder): ~30 USD/mån = ~330 kr
- Diverse tjänster (Sentry, Resend, domain): ~10 USD/mån = ~110 kr
- **Totalt fasta kostnader: ~440 kr/mån**

Break-even med 60 kr genomsnittlig marginal: **~8 betalande familjer**.

### Konvertering och tillväxtprognos

Antaganden för år 1:
- Mix: 70% Standard / 25% Premium / 5% Standard+addon
- Trial-till-betald-konvertering: 30% (familjeappar har högre konvertering än B2B-SaaS)
- Genomsnittlig marginal: ~75 kr/familj

| Antal kunder | Brutto-intäkt/mån | Driftkostnad/mån | Netto/mån |
|--------------|-------------------|-------------------|-----------|
| 10 | ~960 kr | ~660 kr | ~300 kr |
| 50 | ~4 800 kr | ~1 540 kr | ~3 260 kr |
| 100 | ~9 600 kr | ~2 640 kr | ~6 960 kr |
| 500 | ~48 000 kr | ~11 440 kr | ~36 560 kr |
| 1 000 | ~96 000 kr | ~22 440 kr | ~73 560 kr |
| 5 000 | ~480 000 kr | ~110 000 kr | ~370 000 kr |

Vid 1 000 familjer ger det dig ~74 000 kr/mån netto = en hållbar verksamhet du kan leva på.

### Utvärdering över tid

Pricing är inte hugget i sten. Plana för **årliga prisjusteringar** baserat på data:

- Vilka features används mest? Vilka motiverar uppgradering?
- Var är frictionspunkterna? Lägger folk till storage-addons? Konverterar trial till Standard eller direkt till Premium?
- Vilken är genomsnittlig storage-användning? Behöver Premium 100 GB justeras till 50 eller 200?

### Tekniska implikationer av familjebaserad prissättning

Datamodellen i sektion 6 är redan uppdaterad för att stödja detta. Nyckelpunkter:

- `Family` har `tier`, `billing_cycle`, `subscription_status` och `storage_quota_bytes`
- `FamilyAddon` hanterar storage-addons och "extra familj"-addons
- `UserFamilyMembership` har `is_primary` (en användare har **en** primär familj)
- "Extra familj"-addon pekar via `target_family_id` på den familj addonet aktiverar

**Viktigt:** En användares **primära familj** är den de signade upp till eller skapade. Övriga familjer de ingår i är de som någon annan i den familjen har betalat för (via "extra familj"-addon).

**Owner-koncept:** Varje familj har en `owner` som är den som betalar och kan hantera prenumerationen. Andra föräldrar kan administrera familjen (events, sysslor, etc.) men inte ändra betalning eller avbeställa prenumeration.

### Frågor som behöver svar innan lansering

1. **Vad händer när `owner` lämnar familjen?** Förslag: ownership överförs till annan parent eller familjen avslutas efter 30 dagars varsel.
2. **Vad händer om prenumeration upphör?** Förslag: 30 dagars grace period sedan readonly-läge i ytterligare 30 dagar (du kan exportera data) sedan radering.
3. **Vad händer med "extra familjer" om huvudprenumerationen avslutas?** De avslutas också, ägaren av extra familjen får tillbaka kontrollen och kan starta egen prenumeration.
4. **Kan en användare köpa både Standard och addon för "extra familj" på Premium?** Nej – addon-tier matchar huvudtier.

---

## 15. Publik sajt + signup + betalning

### Struktur

Samma Next.js-app servar både publika sajten och appen, separerade på routes:

```
/                    # Landningssida
/pricing             # Priser
/features            # Funktioner
/about               # Om oss
/feedback            # Förslagslåda
/signup              # Skapa konto
/login               # Logga in
/app/*               # Inloggat läge (kräver auth)
```

### Signup-flöde

1. Användaren klickar "Kom igång" på landningssidan
2. Auth via Clerk (Google/Microsoft/passkey)
3. Skapar Family-objekt automatiskt med användaren som `owner`
4. Stripe Checkout för prenumeration (med eventuell trial)
5. Webhook från Stripe sätter `subscription_status = active`
6. Användaren landar i appen, kan börja bjuda in familjemedlemmar

### Förslagslåda

Enkel form som postar till backend → sparas i tabell `Feedback`. Optionellt e-postnotis till dig. Inget komplext.

### Stripe-uppsättning

- **Två produkter**: Standard och Premium
- **Fyra priser per produkt**: månad och år, vardera med valuta SEK
- **Standard-trial**: 30 dagar utan kort vid signup (hanteras i appen, inte via Stripe-trial)
- **Customer Portal aktiverat** (Stripe-hostat UI för avbeställning, byte av tier, fakturor)
- **Addon-priser** för storage (3 nivåer) och extra familj (2 tier-nivåer)
- **Webhooks**: `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.trial_will_end`, `invoice.paid` (sätter `first_paid_at` i Family)

---

## 16. MVP-definition (Fas 1)

### Måste finnas

- Landningssida (sv + en) med pricing och feature-översikt
- Signup med Google ELLER Microsoft (passkeys nice-to-have för MVP)
- Stripe-prenumeration. Två tiers: Standard (79 kr/mån eller 790 kr/år) och Premium (149 kr/mån eller 1490 kr/år). 30 dagars Standard-trial vid signup utan kort. Premium-trial låses upp efter 30 dagar som betalande Standard-kund.
- Skapa familj automatiskt vid signup
- Bjuda in familjemedlemmar via e-post (token-baserad inbjudan)
- **Anpassningsbar dashboard som startsida** med default-widgets för dagens kalender och pending invitations; drag-and-drop för att lägga till/ta bort/flytta widgets
- Familjekalender som visar både interna familje-events och prenumererade iCal-feeds från medlemmarnas privata kalendrar (Google/Outlook/iCloud) – read-only på externa
- Skapa/redigera/ta bort interna events
- Färgkoda events per familjemedlem
- Profil + språkval + tema-val
- **Tema-system** med 8 teman inklusive Metro
- **Responsiv design** på mobil, tablet och desktop
- **PWA** – installerbar från webbläsare, fungerar offline, push notifications
- **API-first design** – allt exponerat via dokumenterat REST-API (OpenAPI)
- Avbeställa prenumeration (via Stripe Customer Portal)
- Radera konto (GDPR)

### Kommer senare

- Sysslor, poäng, achievements
- Familjechat
- AI-assistent och inköpslistor
- Vaccinationer
- Foton, hemautomation
- Native-appar (iOS/Android/Microsoft Store)

### Framgångskriterier för MVP

- 10 betalande familjer inom 3 månader efter lansering
- < 1% errors i iCal-feed-fetch
- < 2s inläsningstid på mobil
- Kan onboarda en familj på < 5 minuter
- Genomsnittlig användare interagerar med 2+ widgets på dashboarden
- API-täckning: 100% av frontend-funktionalitet exponerad via dokumenterat API
- PWA-installationsgrad: minst 30% av aktiva användare installerar appen på sin enhet

---

## 17. Sprint-plan Fas 1

Antar 2-veckors sprintar. Justera efter din takt.

### Sprint 0 – Setup (1 vecka)
- Skapa GitHub repo, monorepo-struktur (frontend + backend)
- Sätt upp molnkonto + region
- Skapa Cloud SQL/Postgres + Object Storage
- Sätt upp Clerk-konto
- Skapa Stripe-konto (test-läge)
- Domän + DNS
- Lokal Docker-miljö
- CI/CD-skelett (GitHub Actions)
- API-versionering: alla endpoints under `/api/v1/`
- OpenAPI-dokumentation auto-genererad via FastAPI, exponerad på `/api/docs`

### Sprint 1 – Auth + grundstruktur (2 v)
- Clerk-integration på frontend
- FastAPI-skelett med JWT-validering mot Clerk
- User-tabell, registrering vid första login
- Skyddade routes
- Grundläggande layout, navigation, sidebar
- i18n-uppsättning (sv + en)
- Tema-system (light/dark först, övriga teman adderas i Sprint 6)
- Responsive layout-ramverk (brytpunkter satta, mobile-first CSS)

### Sprint 2 – Familjer + inbjudningar (2 v)
- Family- och FamilyMember-modeller
- Skapa familj automatiskt vid signup
- Bjud in via e-post (token, expiry)
- Acceptera inbjudan
- Familjeöversikt-sida

### Sprint 3 – Kalender bas (2 v)
- InternalCalendarEvent-modell
- CRUD för interna events
- Kalender-UI (månads-/vecko-/dagsvy) med FullCalendar
- Färgkodning per medlem
- Återkommande events (RRULE)

### Sprint 4 – Externa kalender-feeds (2 v)
- ExternalCalendarFeed- och CachedExternalEvent-modeller
- Lägg till feed (URL-validering, första fetch, krypterad lagring)
- iCal-parsing med `icalendar` + RRULE-expansion via `python-dateutil`
- Bakgrundsjobb för periodisk fetch (var 30:e min via Cloud Scheduler + Cloud Tasks)
- Visa externa events i kalendervyn med rätt färg
- Onboarding-guides för Google Calendar, Outlook, iCloud (skärmdumpar + ev. video)
- Felhantering (URL ogiltig, fetch failed, parse error, 404 efter att användaren regenererat länken)
- "Uppdatera nu"-knapp för manuell fetch
- Stöd för iCal-feeds från SportAdmin / föreningar (samma kodväg, ingen extra logik)

### Sprint 5 – Anpassningsbar dashboard (2 v)
- UserDashboardLayout-modell
- Widget-arkitektur (registry på frontend, varje widget är självständig komponent)
- Default layout för nya användare (förälder vs barn-roll får olika startlayout)
- Drag-and-drop med `@dnd-kit` för att flytta widgets
- "Lägg till widget"-väljare med tillgängliga widgets för aktuell fas
- Initial widgets: dagskalender (tidslinje), veckokalender (kompakt), familjemedlemmar
- Spara layout vid varje förändring (debounced)
- Mobile-anpassning (widgets staplas vertikalt, drag fungerar på touch)

### Sprint 6 – Tema, PWA och polish (2 v)
- Komplettera tema-systemet: forest, ocean, sunset, nordic, high-contrast, metro
- Tema-väljare i profil-vyn med live preview
- Spara tema-val i `User.theme_preference` + `localStorage`
- PWA-konfiguration: manifest.json, service worker via `next-pwa`
- Offline-stöd för dashboard (cache senaste data)
- Web Push notifications (kalenderpåminnelser)
- App-ikoner i alla storlekar
- Splash screens för iOS PWA
- Slutlig responsive-polish på alla vyer (mobile, tablet, desktop)
- Test på riktiga enheter (iOS Safari, Android Chrome, iPad)

### Sprint 7 – Stripe + automation av prenumerationsflöde (2 v)
- Stripe Checkout-integration för Standard och Premium (månad + år)
- Webhook-hantering med verifierade signaturer
- Webhook-events:
  - `checkout.session.completed` → aktivera prenumeration
  - `invoice.paid` → sätt `first_paid_at` om första gången
  - `customer.subscription.updated` → synka tier och status
  - `customer.subscription.deleted` → readonly-läge med grace period
  - `invoice.payment_failed` → notifiera användaren
- Initial Standard-trial vid signup (30 dagar, inget kort)
- Premium-trial-aktivering med eligibility-check (≥30 dagar betalande)
- Cloud Scheduler-jobb (dagligen):
  - 7 dagar innan Standard-trial slut → påminnelsemail
  - 1 dag innan → varningsmail
  - Trial slut utan betalning → status `expired`, readonly-läge
  - Premium-trial slut → email om att uppgradera
- Customer Portal-länk (Stripe-hostat UI för avbeställning, fakturor)
- Storage-addons (köp/avbeställ via Customer Portal)
- "Extra familj"-addon-flöde
- E-postmallar: welcome, trial expiring, payment failed, premium-trial-eligible, premium-trial-aktiverad, premium-trial-slut

### Sprint 8 – Publik sajt + signup (2 v)
- Landningssida med marknadsföringsinnehåll
- Pricing-sida
- Feature-översikt
- Förslagslåda (enkel form)
- Onboarding-flöde
- SEO-grunder (meta, sitemap, robots.txt)

### Sprint 9 – Polering + GDPR (2 v)
- Integritetspolicy + cookiepolicy
- Cookie consent
- Radera-konto-flöde (cascade delete)
- Dataexport (JSON)
- Audit logging
- Penetrationstest (egen eller billig tjänst)
- Performance-optimering
- API-dokumentation polish (Swagger UI exempel, README för API)

### Sprint 10 – Beta + buggfixar (2 v)
- Bjud in 5–10 testfamiljer
- Feedback-cykel
- Buggfixar
- Prestandajusteringar

### Sprint 11 – Lansering (1–2 v)
- Slutlig QA
- Marknadsföringsförberedelser (sociala medier, ev. Product Hunt)
- Öppna betalning (live Stripe)
- Bevaka noga första veckorna

**Totalt: ~21 veckor** (var 20 i v0.1, 17 i v0.2, 19 i v0.3, 21 i v0.4 med tema, PWA och responsive polish). Med deltidsarbete (10–15h/vecka) blir det 9–12 månader.

---

## 18. Risker och öppna frågor

### Tekniska risker

| Risk | Påverkan | Mitigering |
|------|----------|------------|
| Användare hittar inte iCal-publicering hos sin leverantör | Lägre adoption av kalenderfunktionen | Skarpa onboarding-guides per leverantör (text, bild, kort video). Utgå från att de flesta inte vet om funktionen. |
| iCal-feed-fördröjning (upp till 30 min) upplevs som "trasig" | Användare tror appen är buggig | Tydlig UI-text: "Senast uppdaterad: 12 minuter sedan". Manuell refresh-knapp. Förvänta-styra i marknadsföring. |
| iCal-URL läcker via supportkonversation eller skärmdump | Tredje part kan läsa privatkalender | Kryptering i databasen, aldrig logga URL:en, maskera i UI ("…/basic.ics"), one-click regenerera-instruktion |
| RRULE-edge cases (tidszoner, helgdagsundantag, oändliga rules) | Felaktiga events i kalendern | Använd `python-dateutil` (moget), begränsa expansion till ±1 år, robusta tester med riktiga feeds |
| Skala-till-noll cold starts irriterar användare | Sämre UX | Använd minimum 1 instans efter beta |
| Användarens leverantör ändrar iCal-URL-format eller stänger funktionen | Bryter integration | Lågt sannolikhet (iCal är RFC 5545-standard), men ha plan B: OAuth som fallback i Fas 5+ |
| Drag-and-drop fungerar dåligt på mobil | Sämre UX för dashboard | `@dnd-kit` har bra touch-stöd men testa tidigt; alternativ: "redigera"-läge med pilar upp/ner |
| Default dashboard-layout passar inte alla familjer | Sämre första intryck | A/B-testa olika defaults, samla data om vilka widgets som faktiskt används |
| Familjechat konkurrerar med WhatsApp utan att vinna | Användare stannar i WhatsApp ändå | Differentiering: kontextuella trådar på events/sysslor (det WhatsApp inte kan), inte försök bygga generisk chatt |
| WebSocket-anslutningar skalar dåligt på Cloud Run | Chat blir oförutsägbar vid hög last | Cloud Run stödjer WebSockets men har 60-min timeout; planera för reconnect-logik på klienten |
| iOS Safari PWA har begränsningar (ingen Web Push före iOS 16.4, ingen background sync) | Sämre UX för iOS-användare | Tydlig fallback till email-notifikationer, planera native iOS-app i Fas 1.5+ |
| API-breaking changes bryter framtida native-klienter | Hela installerade basen behöver uppdatera samtidigt | Strikt API-versionering från dag 1 (`/v1/`), parallell `/v2/`-deploy vid breaking changes, deprecation-headers |
| OpenAPI-spec divergerar från faktisk implementation | Native-klient-genering ger fel | FastAPI auto-genererar spec från Pydantic, så de håller sig i sync; CI testar mot spec |
| Fas 6/7 (fastighet/bil) blir för komplext för en solo-utvecklare | Försenar lansering, tappar fokus | Strikt fasering: lansera MVP innan Fas 6, validera marknad. Återanvänd existerande kod (Sysslor → ServiceTask, Photos → Document). |
| AI-genererad bilskötselplan ger felaktiga råd | Användare skadar bilen, dåligt rykte | Tydlig disclaimer: "AI:n ger startförslag, kontrollera mot bilens manual". Ingen automatisk genomförande, alltid manuellt godkännande. |
| Handover-PDF blir för stor (foton) | Långsam generering, mejl bouncar | Komprimera bilder, generera asynkront, leverera via signed download-link istället för bilaga |
| Användare lagrar känsliga dokument (försäkringar, identitetshandlingar) | Säkerhetsincident vid läcka | Klar kommunikation om vilken data som passar. Strikt access control, audit log. Erbjud INTE lagring av identitetshandlingar uttryckligen. |
| Prismodellen är fel kalibrerad – för dyr för marknaden eller för billig för marginal | Långsam tillväxt eller olönsamhet | Validera med ~10 potentiella kunder innan launch. A/B-testa prisnivåer efter 3 månader. Justera årligen baserat på data. |
| "Extra familj"-addon är förvirrande att förklara | Användare förstår inte erbjudandet | Tydlig FAQ + visuell illustration på pricing-sidan. Onboarding-guide när någon försöker skapa flera familjer. |
| Storage-quota nås innan användare hinner uppgradera | Frustration, tappade bilder | Mjuk varning vid 80%, stopp vid 100% med tydlig "uppgradera nu"-CTA. Exportmöjlighet vid avstängning. |
| Trial-konvertering blir lägre än 30% | Ej hållbar tillväxt | A/B-testa onboarding, lägg in milstolpar som visar värde i trial (din första vecka, första familjebjudan, etc.) |
| Användare exploaterar trial-modellen genom att skapa nya konton | Förlorad intäkt, missbruk av Premium-trial | Koppla `has_used_premium_trial` till email + Stripe Customer-id, inte bara till Family. Detektera via betalningsmönster och adressmatchning. |
| "Earn-it"-modellen för Premium-trial uppfattas som bestraffande | Användare överger appen innan månad 1 | Tydlig kommunikation under Standard-månad: "Premium-trial låses upp om X dagar". Visa value-prop tydligt så de förstår att det är ett tack. |

### Affärsmässiga risker

| Risk | Mitigering |
|------|------------|
| Familywall, Cozi och andra konkurrenter finns redan | Differentiering: svensk marknad, GDPR-fokus, gamification, anpassningsbar dashboard |
| Familjer är priskänsliga | Generös trial, tydligt värdeerbjudande, billigare än konkurrenter |
| Skärmtid-funktionen kan inte automatiseras fullt | Tydlig kommunikation om vad som är möjligt – sälj inte in funktioner som inte fungerar |

### Öppna frågor du behöver svara på

1. Kommer du att bygga heltid eller deltid? (Avgör tidsplan)
2. Behöver du juridisk hjälp med villkor/integritetspolicy? (Rekommenderas)
3. Hur ska du marknadsföra? (Påverkar budget och tidsplan)
4. Namn på appen? (Boet passar familje-fokus, kontrollera domän/varumärke)
5. Validera prismodellen mot ~10 potentiella användare innan Sprint 7 (Stripe-implementation)
6. Vad händer när `owner` lämnar familjen? (Förslag: ownership överförs eller familjen avslutas efter 30 dagars varsel)
7. Storage hard limit eller soft limit? (Stoppa uppladdning vid quota? Eller varna och låta dem fortsätta lite?)

---

## 19. Nästa steg

Direkt:

1. Reservera domännamn
2. Skapa GitHub-repo
3. Skapa konton: Clerk (eller Supabase), Stripe (test-läge), Sentry, Resend
4. Skissa varumärke (namn, logo, färger) – minst preliminärt
5. Skriv en kort feature-spec för Sprint 1 i detalj
6. Ansök till Google for Startups Cloud Program (kan ta veckor att behandla)

Inom 2 veckor:

1. Sprint 0 klar (lokal utvecklingsmiljö med Docker)
2. Skissa landningssidan på papper/Figma
3. Skriv onboarding-guides för iCal-publicering (Google, Outlook, iCloud)

Inom 1 månad:

1. Sprint 1 + 2 klar (auth, familjer)
2. Bolagsanvändning (SNI-koder, Stripe-onboarding) klar
3. Beställ DPA från alla underleverantörer (GCP, Clerk, Stripe, Vercel, Resend, Sentry)
