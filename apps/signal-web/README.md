# crm_signal Console

`apps/signal-web` er webfrontenden for `crm_signal`-produktet.

Formålet er å gi brukeren et kontrollpanel for signalproduktet, ikke å være full
CRM.

## Rolle

Console skal hjelpe brukeren å:

- se siste signaler
- forstå score, reason og evidence
- justere ICP-profiler
- administrere watchlists
- se NACE breakdown per ICP
- markere signaler som useful / maybe / noise
- eksportere signaler til CSV
- se API-eksempler og dokumentasjon
- senere administrere API keys og webhooks

Console skal også være en konverteringsflate til full CRM-produktet.

## Avgrensning

Console-MVP skal ikke inneholde:

- pipeline
- kontakter som full CRM-modul
- oppgaver/aktiviteter
- notater
- vedlegg/dokumenthåndtering

Dette hører hjemme i `apps/crm-app`.

## Nåværende Status

Første lokale Console-versjon finnes som avhengighetsfri statisk
HTML/TypeScript-app.

Den inkluderer:

1. dashboard med live evalueringsnøkkeltall og siste signaler fra `signal-api`
2. signalfeed med score, reason, suggested action og evidence fra `signal-api`
3. review-markering med useful / maybe / noise
4. tydelig visning av hvilken ICP/watchlist et signal matcher
5. vurderingsgrunnlag per signal: bransje, orgform/status, registreringsdato, ICP-kriterier og enkle usikkerhetsflagg
6. opprettelse av nye ICP-profiler med kommune, orgform, NACE-prefikser, aktiv-krav og score boost
7. ICP-justering av aktiv status, næringsvalg og score boost via `signal-api` når API-et kjører
8. watchlist-visning, toggle, score boost og add/remove av orgnr via `signal-api` når API-et kjører
9. NACE breakdown per ICP
10. CSV-export av filtrert signalfeed
11. API-eksempler med copy-knapp
12. tydelig CTA videre mot full CRM uten å bygge CRM-funksjoner inn i Console

Dashboard, signalfeed, ICP-profiler og watchlists hentes via `apps/signal-api`
når API-et kjører lokalt. ICP-profiler og watchlists lagres også via API-et.
Hvis API-et ikke er tilgjengelig, faller Console tilbake til lokal browser-state
for ICP/watchlist og viser tom live-signalflate. Review-status ligger fortsatt
lokalt i nettleseren.

## Kommandoer

Fra repo-root:

```bash
pnpm signal-web:dev
pnpm signal-api:dev
pnpm signal-web:build
pnpm --filter @crm-signal/signal-web typecheck
pnpm --filter @crm-signal/signal-web build
pnpm --filter @crm-signal/signal-web dev
```
