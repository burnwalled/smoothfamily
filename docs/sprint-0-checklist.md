# Sprint 0 – Setup-checklista

> Konkreta steg för att gå från noll till "redo att skriva kod" på ~5 arbetsdagar (deltid).

Vald molnleverantör: **Google Cloud Platform**, region `europe-north1` (Stockholm).

## Externa tjänster

- [ ] Domän reserverad (`.se` och `.com` om möjligt)
- [ ] GCP-projekt skapat med billing alert (50 USD/mån varning)
- [ ] Cloud SQL-instans up and running (kan vänta tills första deploy)
- [ ] Cloud Storage bucket skapad
- [ ] Secret Manager innehåller alla secrets
- [ ] Clerk-projekt konfigurerat med Google + Microsoft providers
- [ ] Stripe-konto i test mode med produkt + priser skapade
  - [ ] Standard-månad
  - [ ] Standard-år
  - [ ] Premium-månad
  - [ ] Premium-år
- [ ] Resend-konto med verifierad domän (kan vänta tills email behövs)
- [ ] Sentry-projekt skapade (frontend + backend)

## Lokal utvecklingsmiljö

- [ ] GitHub-repo skapat
- [ ] CI körs grön på första commit
- [ ] Docker compose startar Postgres lokalt
- [ ] Backend startar och `/api/v1/health` svarar
- [ ] Frontend startar och visar landningssidan
- [ ] `.env` och `.env.local` ifyllda med riktiga värden

## Dokumentation

- [ ] CLAUDE.md läst och förstådd
- [ ] Projektplanen läst
- [ ] ADR:er läses

## Nästa: Sprint 1

När checklistan är klar är du redo för Sprint 1 (Auth + grundstruktur). Det är
där vi börjar bygga User-modellen, JWT-validering mot Clerk, och de första
skyddade endpointsen.
