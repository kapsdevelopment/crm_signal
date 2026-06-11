# AGENTS.md

Dette dokumentet gir kort kontekst til AI-agenter og nye chattetråder som skal
jobbe i dette repoet.

## Prosjekt

`crm_signal` er et monorepo for et norsk signal-API og senere en full CRM-løsning
basert på norske åpne data.

Produktideen er en "norsk virksomhetsradar":

- ikke videresalg av Brreg-data
- verdi gjennom historikk, normalisering, diffing, timing, scoring, forklarbarhet, watchlists, webhooks og CRM-integrasjon

Første datakilde er Brønnøysundregistrene. Første lokale scope er Oslo.

## Produktdeling

### crm_signal API

Signalproduktet:

- ingest fra Brreg og senere andre offentlige kilder
- snapshots/historikk
- change events
- signalgenerering
- ICP-profiler
- watchlists
- scoring/evidence
- signal feedback/review
- API keys/webhooks senere
- OpenAPI senere

### crm_signal Console

Planlagt separat webfrontend for signalproduktet:

- dashboard med siste signaler
- signalfeed
- ICP-profiler
- watchlists
- NACE breakdown per ICP
- signal review: useful / maybe / noise
- CSV-export
- API docs/eksempler
- API keys/webhooks senere
- CTA/konvertering til full CRM

Console skal ikke bli full CRM. Ikke legg pipeline, kontakter, oppgaver, notater
eller vedlegg inn i Console-MVP.

### Full CRM-App

Planlagt Flutter-app for web, iOS og Android:

- organizations/accounts
- roller: prospect/customer/supplier/partner
- kontakter
- pipeline
- aktiviteter/oppgaver
- notater
- vedlegg senere
- signalfeed fra `crm_signal`
- ABAC/teamtilgang senere

CRM-appen skal konsumere signal-API-et, ikke eie signal-logikken.

## Nåværende Repo-Status

Faktisk eksisterende kode:

```text
apps/
  worker/          # TypeScript worker
  signal-api/      # lokal TypeScript API for signalproduktet
  signal-web/      # enkel statisk TypeScript/HTML-scaffold for Console
  crm-app/         # Flutter-scaffold for fremtidig CRM-app
packages/
  db/              # SQL migrasjonsrunner
infra/
  migrations/      # rene SQL-migrasjoner
compose.yaml       # Postgres + Adminer
```

Planlagt, men ikke opprettet ennå:

```text
apps/
packages/
  domain/
  signal-sdk/
  ui/
```

## Lokal Dev

Kjernen kjøres lokalt på Mac:

- Docker/Colima
- Postgres i Docker
- Adminer
- Node/TypeScript
- pnpm
- rene SQL-migrasjoner

Adminer:

```text
http://127.0.0.1:8081
System: PostgreSQL
Server: postgres
Username: crm_signal
Password: crm_signal_dev_password
Database: crm_signal
```

## Viktige Kommandoer

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm db:status
pnpm db:migrate
pnpm worker
pnpm signal-api:dev
pnpm signal-web:dev
```

Lokal signalflyt:

```bash
pnpm worker dev:reset-data --yes
pnpm worker brreg:import --scope oslo --limit 300 --page-size 100
pnpm worker dev:seed-local-context
pnpm worker signals:generate --limit 1000
pnpm worker signals:review --limit 20
pnpm worker signals:mark --id <signal-id> --rating useful|maybe|noise --reason "..."
pnpm worker signals:evaluate --limit 20 --weak-limit 10 --nace-limit 10
pnpm worker signals:preview --limit 20
```

## Implementert Signalkjerne

- Brreg-import for Oslo.
- Normalisering fra Brreg til intern organisasjonsmodell.
- `organizations`.
- `organization_snapshots`.
- `organization_change_events`.
- `generated_signals`.
- `icp_profiles`.
- `watchlists`.
- `watchlist_items`.
- `signal_feedback`.
- `organization_created` ved førstegangsimport.
- `new_organization_match` genereres bare ved aktiv ICP/watchlist-match.
- Adresseendring kan simuleres lokalt.
- Signaler har score, confidence, reason, evidence og suggested action.
- `signals:review` viser signaler som bør vurderes.
- `signals:mark` lagrer useful/maybe/noise-feedback.
- `signals:evaluate` viser totals, scorefordeling, ICP/watchlist-treff, NACE breakdown per ICP, feedback-oppsummering, noise per ICP/NACE og sterke/svake signaler.
- `apps/signal-api` eksponerer lokale dashboard-, signalfeed-, ICP-profil- og watchlist-endepunkter mot Postgres.
- `apps/signal-web` kan hente live dashboard/signalfeed og hente, opprette, endre, toggle og fjerne ICP-profiler og watchlists via `signal-api`; uten API faller ICP/watchlists tilbake til `localStorage`, mens live-signalflaten vises tom.
- `dev:seed-local-context` bevarer aktiv/inaktiv-status for eksisterende lokale ICP-profiler, slik at Console-toggles ikke overskrives.

Lokale evalueringsprofiler:

- `Lokal ICP: Oslo IT/SaaS`
- `Lokal ICP: Oslo B2B-rådgivning`
- `Lokal ICP: Oslo håndverk/utbygging`
- `Lokal ICP: Oslo eiendom/utleie/holding`

Siste kjente lokale evaluering:

- 500 Oslo-organisasjoner.
- 500 `organization_created` events.
- 35 `new_organization_match` signaler.
- ca. 7,0% created -> match conversion.
- Bare `Lokal ICP: Oslo IT/SaaS` er aktiv; lokal watchlist er deaktivert.

## Arkitekturbeslutninger

- Bruk rene SQL-migrasjoner, ikke Drizzle/Prisma foreløpig.
- `organizations` er kjernen, ikke `customers`.
- Samme organisasjon kan ha flere roller senere.
- Brreg-data lagres både normalisert og som raw/canonical snapshot.
- Postgres er kontrollplanet.
- Object storage brukes senere for PDF-er, vedlegg, raw snapshots og eksportfiler.
- Ikke lagre store PDF-er direkte i Postgres.
- Frontend skal ikke eksponere Postgres direkte.
- Storage skal beskyttes med policies, signed URLs eller backend-proxy.
- Backend/worker setter verifisert policy-kontekst.
- Brukere skal ikke kunne sette tenant/purpose/clearance selv.
- Audit bør bygges inn tidlig.

## Arbeidsregler

- Les eksisterende kode og docs før endringer.
- Bruk `rg`/`rg --files` for søk.
- Bruk `apply_patch` for manuelle filendringer.
- Ikke revert brukerens endringer.
- Ikke kjør destruktive datareset uten eksplisitt aksept.
- `dev:reset-data --yes` sletter lokalt domeneinnhold, men beholder schema/migrasjonshistorikk.
- For å regenerere signaler uten å slette importerte organisasjoner kan man truncate `generated_signals`, men spør først.
- Kjør `pnpm typecheck` og `pnpm test` etter kodeendringer.
- Ikke kjør `dart format` i dette repoet uten eksplisitt beskjed.
- Oppdater README/architecture/roadmap/to-do når produkt- eller arkitekturbeslutninger endres.

## Neste Naturlige Produktsteg

Anbefalt rekkefølge:

1. Bruk signal feedback/review på flere signaler og juster ICP/scoring basert på noise-mønstre.
2. Koble signal review/feedback i Console til `signal-api`.
3. Bruk Console-toggle til smale tester, f.eks. kun `Lokal ICP: Oslo IT/SaaS`, før signalgenerering.
4. CSV-export hvis det hjelper raskere manuell evaluering.
5. API keys/webhooks senere.
6. Flutter CRM-app når signalproduktet er validert bedre.
