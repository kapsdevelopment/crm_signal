# crm_signal

CRM + signal-API basert på norske åpne data.

Prosjektet skal utforske en "norsk virksomhetsradar": ikke bare firmaoppslag, men et produkt som oppdager, forklarer og leverer relevante virksomhetssignaler til CRM- og leverandøroppfølging.

Målet i første fase er å validere produktnerven lokalt på Mac før vi bygger prototype eller produksjonsoppsett.

## Produktide

Verdien skal ikke være å videreselge offentlige data. Verdien skal være:

- historikk
- normalisering
- endringsdeteksjon
- timing
- scoring
- forklarbarhet
- watchlists
- webhooks
- CRM-integrasjon
- audit og tilgangsstyring

Første datakilde er sannsynligvis Brønnøysundregistrene. Andre datakilder, som Doffin/TED, SSB, Kartverket, Vegvesen, NVE, Entur, BarentsWatch/Kystverket AIS og andre åpne norske kilder, skal vurderes som senere signalpakker.

## Produkter

Prosjektet deles konseptuelt i to produkter:

1. `crm_signal_api`
   - ingest fra offentlige kilder
   - snapshots og historikk
   - diffing og endringsdeteksjon
   - signalgenerering
   - ICP-profiler
   - watchlists
   - signal feedback/review
   - webhooks
   - API-nøkler/OAuth senere
   - rate limiting/quotas senere
   - OpenAPI-dokumentasjon
   - audit

2. `crm_signal Console`
   - dashboard med siste signaler
   - signalfeed med score, reason og evidence
   - ICP-profiler og watchlists
   - NACE breakdown per ICP
   - signal review: useful / maybe / noise
   - CSV-export
   - API docs/eksempler
   - senere API keys og webhook-konfig
   - konvertering til full CRM-produktet

3. `crm_api`
   - backend for vårt eget CRM-produkt
   - accounts og account-detaljer
   - kontakter
   - pipeline/deals
   - aktiviteter/oppgaver
   - notater
   - CRM-status på signaler
   - opprett account fra signal
   - tenant-/teamtilgang og audit senere

4. CRM-verktøyet
   - organisasjoner/accounts
   - kontakter
   - pipeline
   - aktiviteter og oppgaver
   - kommentarer/notater
   - PDF-er og vedlegg
   - signal-feed fra eget API
   - teamtilgang/ABAC
   - roller som prospect, customer, supplier, partner osv.

## Nåværende beslutning

Første fase kjøres lokalt på Mac:

- lokal utvikling
- manuell start av ingest/diff/signal-prosesser
- lokal database/storage i dev
- ingen live-prototype før produktet føles fornuftig

Når vi er klare for prototype:

- crm_signal API/Console prototype: Supabase + hjemmeserver + GitHub Pages hvis mulig
- Brukerrettet CRM prototype: Flutter + Supabase, med hostingvalg for web tatt på nytt da

Ved eventuell produksjonssetting:

- Supabase for database, storage og API-relaterte tjenester
- noe annet enn hjemmeserver for prosessering
- noe annet enn GitHub Pages for seriøs hosting

## Dokumenter

- [architecture.md](architecture.md) beskriver dev-, prototype- og produksjonsarkitektur.
- [docs/crm-app-architecture.md](docs/crm-app-architecture.md) konkretiserer CRM-appens arkitektur, datamodell og Flutter-struktur.
- [roadmap.md](roadmap.md) beskriver fasene fremover.
- [to-do.md](to-do.md) beskriver konkrete steg vi skal gjennomføre.
- [AGENTS.md](AGENTS.md) gir kort kontekst og arbeidsregler for nye AI-tråder.
- [apps/signal-api](apps/signal-api) inneholder første lokale API for dashboard, signalfeed, ICP-profiler og watchlists.
- [apps/signal-web/README.md](apps/signal-web/README.md) beskriver Console-scaffolden.
- [apps/crm-api/README.md](apps/crm-api/README.md) beskriver separat CRM API.
- [apps/crm-app/README.md](apps/crm-app/README.md) beskriver Flutter CRM-scaffolden.

## Første tekniske mål

Bygg en lokal, portabel kjerne:

```text
Brreg ingest
  -> normalisering
  -> snapshots
  -> diffing
  -> change events
  -> signalgenerering
  -> enkel signal-preview
```

Dette skal først kunne kjøres manuelt. Senere kan samme kode kjøres av hjemmeserver, cron, kø, Supabase eller annen skyplattform.

## Lokalt Dev-Miljø

Foreløpig lokal base:

- Docker CLI + Docker Compose
- Colima som lokal Docker-motor
- Postgres i Docker
- Node + pnpm
- Flutter installert for senere brukerrettet CRM

Start lokal database:

```bash
docker compose up -d postgres
```

Database URL:

```text
postgresql://crm_signal:crm_signal_dev_password@localhost:54329/crm_signal
```

Adminer:

```text
http://127.0.0.1:8081
```

Adminer-login:

```text
System: PostgreSQL
Server: postgres
Username: crm_signal
Password: crm_signal_dev_password
Database: crm_signal
```

Installer Node-avhengigheter:

```bash
pnpm install
```

Kjør tester:

```bash
pnpm test
```

Start separat CRM API:

```bash
pnpm crm-api:dev
```

Sjekk migrasjonsstatus:

```bash
pnpm db:status
```

Kjør migrasjoner:

```bash
pnpm db:migrate
```

Worker-skall:

```bash
pnpm worker
```

Start lokal `signal-api` for Console-admin:

```bash
pnpm signal-api:dev
```

Start lokal Console i en annen terminal:

```bash
pnpm signal-web:dev
```

Console prøver `http://127.0.0.1:5175` for dashboard, signalfeed, ICP-profiler
og watchlists. Når `signal-api` kjører, leses live signaldata fra Postgres, og
opprettelse, endring og toggling av ICP/watchlists skrives til Postgres. Hvis
API-et ikke kjører, faller Console tilbake til lokal browser-state for
ICP/watchlists og viser tom live-signalflate.

Reset lokalt domeneinnhold, men behold schema og migrasjonshistorikk:

```bash
pnpm worker dev:reset-data --yes
```

Importer de første Brreg-enhetene for Oslo:

```bash
pnpm worker brreg:import --scope oslo --limit 100
```

Ved førstegangsimport av en organisasjon opprettes et `organization_created`
change event. Senere importer lager bare change events når normalisert snapshot
faktisk avviker fra gjeldende snapshot.

For en liten røyk-test:

```bash
pnpm worker brreg:import --scope oslo --limit 10
```

Simuler en lokal adresseendring for å teste diffing:

```bash
pnpm worker dev:simulate-change --type business-address
```

Seed lokal ICP-profil og watchlist for scoring-test:

```bash
pnpm worker dev:seed-local-context
```

Seedingen lager fire lokale evalueringsprofiler:

- `Lokal ICP: Oslo IT/SaaS`
- `Lokal ICP: Oslo B2B-rådgivning`
- `Lokal ICP: Oslo håndverk/utbygging`
- `Lokal ICP: Oslo eiendom/utleie/holding`

Den lager også en manuell watchlist med én importert organisasjon som direkte
watchlist-treff. Gamle brede/blandede lokale profiler deaktiveres hvis de finnes.
For eksisterende lokale ICP-profiler oppdateres beskrivelse/kriterier, men valgt
aktiv/inaktiv-status beholdes slik at Console-toggles ikke overskrives av seed.

Kjør Brreg-import etter simulering for å se at importen lager en ny change event når faktisk Brreg-data avviker fra lokal current snapshot:

```bash
pnpm worker brreg:import --scope oslo --limit 10
```

Generer signaler fra change events:

```bash
pnpm worker signals:generate --limit 100
```

`organization_created` blir bare til `new_organization_match` når
organisasjonen matcher aktiv ICP-profil eller watchlist. Nye organisasjoner uten
match beholdes som rå change events, men lager ikke signalstøy.

List signaler som bør vurderes:

```bash
pnpm worker signals:review --limit 20
```

Marker et signal som nyttig, kanskje eller støy:

```bash
pnpm worker signals:mark --id <signal-id> --rating useful --reason "Relevant lead"
pnpm worker signals:mark --id <signal-id> --rating maybe --reason "Interessant, men ikke prioritert nå"
pnpm worker signals:mark --id <signal-id> --rating noise --reason "For bred NACE-match"
```

Seed lokal CRM-kontekst fra importerte organisasjoner og genererte signaler:

```bash
pnpm worker dev:seed-crm-context
```

Seedingen lager demo-tenant, demo-bruker, membership, pipeline/stages,
accounts, roller, kontakter, deals, aktiviteter, notater og koblinger mellom
accounts og relevante `generated_signals`.

Evaluer signalene i terminal:

```bash
pnpm worker signals:evaluate --limit 20 --nace-limit 10
```

Rapporten viser blant annet totals, scorefordeling, ICP/watchlist-treff,
NACE-fordeling per ICP, feedback-oppsummering, noise per ICP/NACE og eksempler
på sterke/svake signaler.

En større lokal evalueringsrunde kan kjøres slik:

```bash
pnpm worker dev:reset-data --yes
pnpm worker brreg:import --scope oslo --limit 300 --page-size 100
pnpm worker dev:seed-local-context
pnpm worker signals:generate --limit 1000
pnpm worker dev:seed-crm-context
pnpm worker signals:evaluate --limit 20 --weak-limit 10 --nace-limit 10
```

Forhåndsvis signalfeed i terminal:

```bash
pnpm worker signals:preview --limit 20
```
