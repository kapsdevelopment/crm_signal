# Architecture

Dette dokumentet beskriver ønsket arkitektur for `crm_signal`: et norsk signal-API
og etter hvert en full CRM-plattform basert på åpne norske data.

Hovedprinsippet er at signalkjernen skal være portabel. Hvor prosessene kjører
skal være en deploy-beslutning, ikke en domenebeslutning.

## Arkitekturprinsipper

- Signal-API-et designes som et eksternt API fra dag én.
- `signal-web` Console skal bruke samme API som eksterne kunder senere kan bruke.
- Full CRM-app skal konsumere signal-API-et, ikke eie signal-logikken.
- `organizations` er kjernen, ikke `customers`.
- En organisasjon kan ha flere roller: prospect, customer, supplier, partner osv.
- Offentlige data lagres som normaliserte strukturer pluss raw snapshot der det gir verdi.
- Postgres er kontrollplanet for katalog, CRM-data, policy, audit, metadata og signaler.
- Object storage brukes for PDF-er, vedlegg, raw snapshots og eksportfiler.
- Store historikk-/tidsseriemengder kan senere flyttes til Parquet/object storage.
- Backend/worker setter verifisert policy-kontekst.
- Frontend får aldri sette tenant, clearance, purpose eller andre autorisasjonsfakta selv.
- Postgres eksponeres ikke direkte til sluttbrukerfrontend uten et kontrollert API/RLS-lag.
- Storage eksponeres via policies, signed URLs eller backend/Edge Functions.
- Audit bygges inn tidlig.

## Konseptuell Monorepo-Struktur

Målstruktur:

```text
crm_signal/
  apps/
    worker/          # eksisterer: ingest, diffing, signalgenerering, evaluering
    signal-api/      # eksisterer: første lokale API for signalproduktet
    signal-web/      # eksisterer: crm_signal Console scaffold
    crm-api/         # eksisterer: første lokale API for full CRM-produktet
    crm-app/         # eksisterer: Flutter CRM-app scaffold
  packages/
    db/              # eksisterer: SQL migrasjonsrunner
    domain/          # planlagt: delt domenelogikk
    signal-sdk/      # planlagt: klient/SDK for signal-API
    ui/              # planlagt: delt UI/design tokens hvis relevant
  infra/
    migrations/      # eksisterer: rene SQL-migrasjoner
  compose.yaml       # eksisterer: lokal Postgres/Adminer
```

Faktisk status nå:

- `apps/worker` finnes og kjører TypeScript worker-kommandoer.
- `apps/signal-api` finnes med første lokale dashboard-, signalfeed-, ICP-profil- og watchlist-endepunkter.
- `apps/signal-web` finnes som enkel statisk TypeScript/HTML-scaffold for Console.
- `apps/crm-api` finnes med første lokale CRM-endepunkter for accounts, CRM-signalfeed og account fra signal.
- `apps/crm-app` finnes som Flutter-app med første navigerbare CRM-shell og mock-store.
- `packages/db` finnes og kjører rene SQL-migrasjoner.

## Produkter

### crm_signal API

Ansvar:

- import fra Brreg og senere andre offentlige kilder
- normalisering
- snapshots/historikk
- diffing/endringsdeteksjon
- signalgenerering
- ICP-profiler
- watchlists
- scoring og forklarbarhet
- signal review/feedback
- webhooks senere
- API keys/OAuth senere
- rate limiting/quotas senere
- OpenAPI
- audit

### crm_signal Console

Planlagt separat webfrontend for signalproduktet, ikke full CRM.

Ansvar:

- dashboard med siste signaler
- signalfeed med score, reason og evidence
- ICP-profiler og enkel justering av kriterier
- watchlists
- NACE breakdown per ICP
- signal review: useful / maybe / noise
- CSV-export
- API docs/eksempler
- senere API keys og webhook-konfig
- tydelig inngang/CTA til full CRM-produktet

Bevisst avgrensning:

- ingen pipeline
- ingen kontaktregister-MVP
- ingen oppgaver/notater som full CRM-funksjon
- ingen vedlegg/dokumenthåndtering

Console skal hjelpe brukeren å forstå, konfigurere og evaluere signalproduktet.
Full CRM skal være neste produktnivå for operativ oppfølging.

### Full CRM-App

Planlagt Flutter-app for web, iOS og Android.

Ansvar:

- accounts/organizations
- organisasjonsroller: prospect, customer, supplier, partner osv.
- kontakter
- pipeline/deals
- aktiviteter/oppgaver
- kommentarer/notater
- PDF-er/vedlegg
- signal-feed fra `crm_signal`
- handlinger som "opprett account fra signal"
- ABAC/teamtilgang
- audit

### CRM API

Separat backend for full CRM-produktet.

Ansvar:

- lese/skrive CRM-tenantdata
- accounts og account-detaljer
- kontakter, roller, pipeline, deals, aktiviteter og notater
- CRM-status på signaler
- handlingen "opprett account fra signal"
- senere auth, ABAC/RLS-kontekst, audit og vedleggstilgang

Bevisst avgrensning:

- skal ikke eie signalgenerering
- skal ikke være det offentlige signal-API-et for eksterne CRM-systemer
- skal konsumere signalproduktet via API-grense når vi går ut av lokal dev

## Worker

Ansvar:

- hente offentlige data
- skrive snapshots
- beregne diffs
- generere change events
- score signaler
- kjøre evaluering/diagnose
- senere levere webhooks
- senere kjøre batch/backfill

Worker skal kunne kjøres:

- manuelt på Mac
- som cron/systemd/Docker på hjemmeserver
- som managed worker i produksjon

## Fase 1: Lokal Dev På Mac

Mål: validere produktet uten live drift.

```text
Mac
  worker manuelt startet
  Postgres i Docker
  Adminer for inspeksjon
  lokal storage-mappe eller MinIO senere
  signal-api lokal dev server for dashboard, signalfeed, ICP-profiler og watchlists
  crm-api lokal dev server for CRM accounts, pipeline og CRM-signalhandlinger
  signal-web lokal dev server for Console
```

Nåværende flyt:

```text
Brreg import
  -> normalisering
  -> organizations
  -> organization_snapshots
  -> organization_change_events
  -> generated_signals
  -> signal_feedback
  -> signals:preview / signals:evaluate
```

Implementert nå:

- Brreg-import for Oslo.
- Førstegangsimport lager `organization_created`.
- `signal-api` eksponerer lokale dashboard-, signalfeed-, ICP-profil- og watchlist-endepunkter mot Postgres.
- `signal-web` kan vise live dashboard/signalfeed og opprette, endre og toggle ICP-profiler og watchlists via `signal-api`.
- `crm-api` eksponerer lokale CRM-endepunkter mot Postgres, separat fra `signal-api`.
- Endret snapshot lager feltbaserte change events.
- `organization_created` blir bare til `new_organization_match` hvis organisasjonen matcher aktiv ICP eller watchlist.
- Lokal seed lager fire evalueringsprofiler:
  - Oslo IT/SaaS
  - Oslo B2B-rådgivning
  - Oslo håndverk/utbygging
  - Oslo eiendom/utleie/holding
- `signals:evaluate` viser totals, scorefordeling, ICP/watchlist-treff, NACE breakdown per ICP og sterke/svake signaler.
- `signals:review` og `signals:mark` gir lokal useful/maybe/noise feedback-loop.
- `apps/signal-web` er scaffoldet, men trenger faktisk data-/API-integrasjon og UI.
- `apps/crm-app` har første navigerbare CRM-shell med accounts, signalfeed, pipeline og oppgaver.
- Siste lokale Oslo-evaluering ga 500 organisasjoner, 35 `new_organization_match` signaler og ca. 7,0% treffrate med bare `Lokal ICP: Oslo IT/SaaS` aktiv og lokal watchlist deaktivert.

## Fase 2: Prototype

Mål: kjørbar prototype med lav kost.

```text
GitHub Pages eller lignende
  signal-web Console
  crm_signal nettside/API-info

Supabase Cloud
  Auth
  Postgres
  Storage
  RLS
  Edge Functions ved behov
  job/status-tabeller

Hjemmeserver
  ingest worker
  diff worker
  scoring worker
  webhook worker senere
  lokal cache ved behov

Flutter
  crm-app
  web
  iOS
  Android
```

Anbefalt nettverksmodell:

```text
hjemmeserver -> Supabase
hjemmeserver -> offentlige API-er
signal-web -> signal-api/Supabase Edge Functions
crm-app -> crm-api/Supabase Edge Functions
crm-api -> signal-api for signaldata når lokal direkte DB-lesing fases ut
```

Hjemmeserveren bør i starten ikke eksponeres offentlig. Den gjør utgående kall
til Supabase og datakilder.

Datadekning:

- Lokal dev: Oslo først.
- Prototype: utvid til hele Norge når ingest, diffing og signalverdi er validert.
- Produksjon: hele Norge, med mulighet for kundespesifikke geografiske scope.

GitHub Pages-kompromisser:

- kun statisk hosting
- ingen server-side API-ruter
- ingen server secrets
- routing må håndteres som SPA
- privilegerte operasjoner må gå via Supabase Edge Functions eller annen backend

Hostingvalg for Flutter web skal tas på nytt når CRM-prototypen starter.

## Fase 3: Produksjon

Mål: robust drift for betalende kunder.

Sannsynlig produksjonsarkitektur:

```text
Profesjonell frontend-hosting
  signal-web
  crm-app web
  marketing/docs

Supabase Cloud eller tilsvarende
  Postgres
  Auth
  Storage
  RLS
  Edge Functions/API
  audit

Managed processing
  ingest workers
  diff/scoring workers
  webhook workers
  queue/cron
  monitoring
```

Produksjon bør ikke være avhengig av:

- hjemmeserver
- GitHub Pages
- manuelle ingest-kjøringer
- secrets i frontend
- utestet backup

## Datamodell: Nåværende Kjerne

```text
ingest_runs
organizations
organization_snapshots
organization_change_events
icp_profiles
watchlists
watchlist_items
generated_signals
signal_feedback
audit_events
```

Senere CRM-tabeller:

```text
tenants
users
teams
memberships
tenant_organizations
organization_roles
contacts
deals
activities
notes
attachments
signal_feedback
api_keys
webhooks
webhook_deliveries
```

Første konkrete CRM-migrasjon er lagt i `003_crm_core.sql`. Se
[docs/crm-app-architecture.md](docs/crm-app-architecture.md) for CRM-appens
produktgrense, datamodell og Flutter-struktur.

## Database-Migrasjoner

Prosjektet bruker rene SQL-migrasjoner som førstevalg.

Begrunnelse:

- Postgres er en sentral del av produktet, ikke bare en enkel lagringsdetalj.
- SQL gir full kontroll på `jsonb`, indekser, constraints, RLS, policies, triggers, views og extensions.
- Supabase-migrasjoner er også SQL-baserte, så denne retningen passer godt når vi går fra lokal dev til prototype.
- Vi trenger ikke Drizzle/Prisma som schema-abstraksjon i starten.

Praktisk struktur:

```text
infra/
  migrations/
    001_initial_core.sql
    002_generated_signals_idempotency.sql
    003_crm_core.sql
```

## Signalpipeline

```text
fetch source
  -> normalize
  -> store raw snapshot
  -> store normalized state
  -> compare with previous state
  -> create change events
  -> evaluate ICP/watchlists
  -> score and explain
  -> create generated signals
  -> preview/evaluate/review
  -> collect useful/maybe/noise feedback
  -> improve ICP/scoring/rules
  -> deliver webhooks later
  -> audit
```

Nåværende viktigste signal:

```text
organization_created
  -> ICP/watchlist match?
  -> new_organization_match
```

Kommende produktmessige steg:

- API-backed signal feedback/review i Console
- API keys/webhooks senere
