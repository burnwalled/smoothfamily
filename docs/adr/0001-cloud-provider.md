# 0001 – Val av molnleverantör: Google Cloud

**Datum:** 2026-05-04
**Status:** Beslutad

## Kontext

Solo-utvecklare som bygger en familjeapp som ska skalas över tid. Behöver välja
molnleverantör med fokus på time-to-market, kostnad och tillförlitlighet.

Tre alternativ utvärderades: Google Cloud, Azure, AWS.

## Beslut

Google Cloud Platform, region `europe-north1` (Stockholm).

Primära tjänster:
- Cloud Run för backend
- Cloud SQL for PostgreSQL för databas
- Cloud Storage för filer
- Cloud Tasks + Cloud Scheduler för bakgrundsjobb
- Secret Manager för secrets
- Artifact Registry för Docker-images

## Konsekvenser

Positiva:
- Skala-till-noll med Cloud Run = låga initiala kostnader
- Snabb DX, mindre DevOps-tid för solo-utvecklare
- Stockholm-region uppfyller GDPR-krav
- $300 free credit i 90 dagar för start

Negativa:
- AWS har lägre compute-pris vid hög skala (irrelevant för MVP)
- Mindre djup Microsoft Graph-integration än Azure (men Graph är ett vanligt REST API)

## Lock-in-mitigering

Vi använder portabla byggstenar: containers (Docker), PostgreSQL, S3-kompatibel
storage. Ingen direkt användning av Google-specifika tjänster som Firestore eller
Spanner. Migration till annat moln är möjlig på 2–4 veckor om det skulle behövas
i framtiden.
