# 0002 – Kalenderstrategi: iCal-feeds, inte OAuth

**Datum:** 2026-05-04
**Status:** Beslutad

## Kontext

För att visa familjemedlemmars privata kalendrar (Gmail, Outlook, iCloud)
finns två huvudvägar:

1. OAuth + Calendar API (Google Calendar API, Microsoft Graph)
2. iCal-feed-prenumeration (read-only)

OAuth ger realtid och tvåvägssync, men kräver:
- Verifiering av appen hos Google (4–6 veckor + ev. CASA-revision)
- App-registrering hos Microsoft för Graph
- Token-livscykelhantering (refresh tokens, säker lagring)
- Mer attack surface (vi lagrar tokens som ger läsåtkomst)
- iCloud Calendar har inget jämförbart API

## Beslut

iCal-feed-prenumeration (read-only). Användaren publicerar sin kalender hos
sin leverantör och klistrar in den hemliga iCal-URL:en i vår app.

## Konsekvenser

Positiva:
- Ingen Google OAuth-verifiering krävs (sparar 4–6 veckor)
- iCloud Calendar fungerar gratis (stort plus i Sverige)
- Mindre känslig data lagras (URL:er, inte access tokens)
- Ingen token-refresh-logik
- Tydligare GDPR-story (data minimization)

Negativa:
- Read-only – vi kan inte skapa events i användarens externa kalender
- Uppdateringar har viss fördröjning (oftast upp till 30 min)
- Användaren måste manuellt aktivera iCal-publicering
  (kräver bra onboarding-guider)

## Framtida möjlighet

OAuth kan adderas i Fas 5+ som premium-feature ("realtidssync, två-vägs")
om användare efterfrågar det.
