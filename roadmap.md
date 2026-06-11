# Roadmap

Dette roadmapet skal holde kostnadene lave så lenge som mulig, samtidig som
arkitekturen ikke låser prosjektet til Mac, hjemmeserver eller GitHub Pages.

Produktstigen vi styrer mot:

```text
1. crm_signal API
2. crm_signal API + Console
3. Full CRM-app
```

## Fase 0: Produktavgrensning

Status: i praksis gjennomført for første lokale MVP, men produktvurdering pågår.

MVP-setning:

> Et system som oppdager og forklarer relevante endringer i norske virksomheter
> for salgs-, markeds- og leverandøroppfølging.

Første datakilde:

- Brønnøysundregistrene.

Første geografiske scope:

- Oslo i lokal dev.
- Hele Norge vurderes først i prototypefasen.

Første signalspor:

- ny virksomhet matcher ICP/watchlist
- adresseendring
- endret næringskode
- endret foretaksstatus
- ny underenhet senere
- klynge av nye virksomheter senere
- leverandørendring eller leverandørrisiko senere

## Fase 1: Lokal Signalkjerne På Mac

Status: pågår, med mye av signalkjernen implementert.

Mål:

- kjøre alt lokalt
- starte ingest/diff/signal-prosesser manuelt
- validere om signalene faktisk føles nyttige
- bygge portabel kode som senere kan flyttes til Supabase/hjemmeserver/sky
- fokusere på `crm_signal` før full CRM bygges ut

Lokal stack:

- Node/TypeScript worker
- pnpm monorepo
- Postgres i Docker
- Adminer for databaseinspeksjon
- rene SQL-migrasjoner
- terminal-preview/evaluering av signalfeed

Implementert:

- lokal Postgres/Adminer via Docker Compose
- SQL-migrasjoner
- Brreg-import for Oslo
- normalisering av Brreg-enheter
- raw og canonical snapshots
- canonical hash
- diffing mellom snapshots
- `organization_created` ved førstegangsimport
- feltbaserte change events for endringer
- signalgenerering
- `new_organization_match` kun ved ICP/watchlist-match
- idempotens for generated signals
- seed av lokale ICP-profiler og watchlist
- split av håndverk/utbygging og eiendom/utleie/holding
- `signals:preview`
- `signals:evaluate` med NACE breakdown per ICP
- `signals:review` og `signals:mark` for useful/maybe/noise feedback
- enkel `apps/signal-web` scaffold
- første `apps/signal-api` med dashboard-, signalfeed-, ICP-profil- og watchlist-endepunkter
- Console kan vise live dashboard/signalfeed og opprette, endre og toggle ICP-profiler og watchlists via `signal-api`/Postgres
- Flutter `apps/crm-app` scaffold
- tester for normalisering, diffing og signalregler

Nåværende evalueringsstatus:

- 500 Oslo-organisasjoner importert i lokal test.
- 500 `organization_created` events.
- 35 `new_organization_match` signaler.
- ca. 7,0% created -> match conversion.
- bare `Lokal ICP: Oslo IT/SaaS` aktiv, lokal watchlist deaktivert
- Fordeling:
  - Oslo IT/SaaS: 35
  - manuell watchlist: 0

Senere enrichment-spor:

- undersøk direkte tilgang til årsregnskap/regnskapsdata fra Brreg/Regnskapsregisteret
- vurder egen datamodell for regnskapsnøkkeltall
- bygg senere indikatorer for omsetning, resultat, egenkapital, likviditet, vekst/fall og regnskapsalder
- vurder regnskapsbaserte signaltyper som vekst, fallende omsetning, negativ egenkapital eller manglende/gammelt regnskap

Neste anbefalte steg i fase 1:

- bruk signal feedback på flere signaler
- juster ICP, NACE-koder og scoring basert på noise-mønstre
- koble signal review/feedback i Console til `signal-api`
- gjør ren IT/SaaS-evaluering med bare relevant ICP/watchlist aktiv
- vurder CSV-export hvis review i regneark er raskere enn web først

Fase 1 exit criteria:

- vi kan hente et avgrenset Brreg-datasett for Oslo
- vi kan lagre normaliserte organisasjoner og raw snapshots
- vi kan finne endringer mellom kjøringer
- vi kan generere og forklare relevante signaler
- vi kan manuelt vurdere signaler som useful/maybe/noise
- signalfeed virker nyttig nok til at prototype er verdt tiden
- første lokale Console/API-retning er tydelig

## Fase 1B: crm_signal Console

Status: scaffoldet, men produkt-UI ikke implementert.

Mål:

- lage en separat webfrontend for signalproduktet
- gi brukeren et kontrollpanel for signaler, ICP og watchlists
- gjøre produktet lettere å demonstrere og selge
- skape konvertering til full CRM senere

Console-MVP:

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

Viktig avgrensning:

- Console skal ikke bli CRM.
- Ingen pipeline, kontakter, oppgaver, notater eller vedlegg i Console-MVP.
- Console skal bruke samme signal-API som eksterne kunder senere kan bruke.

## Fase 2: Prototype

Status: planlagt, ikke startet.

Mål:

- gjøre intern/egen prototype tilgjengelig uten full produksjonsdrift
- bruke Supabase som database, lagring og API-grunnlag
- bruke hjemmeserver til prosessering
- bruke GitHub Pages eller lignende statisk hosting der det er tilstrekkelig
- inkludere `signal-web` Console
- inkludere brukerrettet CRM bygget i Flutter når signalproduktet er validert
- utvide datadekningen fra Oslo til hele Norge når signalkjernen fungerer

Planlagt prototype-arkitektur:

- Supabase Cloud
  - Postgres
  - Auth
  - Storage
  - RLS
  - Edge Functions ved behov
  - job/status-tabeller
- Hjemmeserver
  - ingest worker
  - diff worker
  - signal/scoring worker
  - webhook worker senere
  - eventuell lokal cache
- GitHub Pages eller lignende
  - `signal-web` Console
  - crm_signal nettside
  - API-info/docs
- Flutter
  - `crm-app`
  - web target i prototypen
  - iOS/Android target når appopplevelsen skal testes

Hostingvalg for Flutter web skal tas på nytt før denne delen deployes:

- Vercel
- GitHub Pages
- Cloudflare Pages
- Netlify
- annen hosting

Spørsmålet som skal stilles på nytt:

> Skal brukerrettet CRM-prototypen hostes på Vercel, GitHub Pages eller et annet alternativ?

Fase 2 exit criteria:

- systemet kan kjøre periodisk uten manuell start
- signaler dukker opp i webgrensesnitt
- bruker kan justere ICP/watchlists i Console
- Supabase RLS beskytter tenant-/brukerdata
- worker kan kjøre outbound-only fra hjemmeserver
- vi har enkel audit for viktige hendelser
- vi kan demonstrere produktet for andre
- innlogget CRM-bruker kan administrere organisasjoner
- organisasjon kan ha roller som prospect, customer, supplier, partner osv.
- signalfeed kan kobles til accounts/organizations

## Fase 3: Full CRM-App

Status: Flutter-scaffold finnes, men produktfunksjonalitet er ikke startet.

Teknologi:

- Flutter for rask støtte av web, iOS og Android.

CRM-MVP:

- organisasjonsliste/accounts
- organisasjonsdetalj
- roller: prospect/customer/supplier/partner
- kontakter
- enkel pipeline
- aktiviteter/oppgaver
- notater
- signalfeed koblet til organisasjoner
- enkel "opprett account fra signal"
- team/tilgangsstyring senere
- vedlegg senere

Viktig prinsipp:

- CRM-appen skal konsumere `crm_signal` API-et.
- CRM-appen skal ikke eie signal-logikken direkte.

## Fase 4: Eventuell Produksjonssetting

Status: ikke startet.

Mål:

- flytte bort fra prototype-hosting
- flytte prosessering bort fra hjemmeserver
- innføre mer robust drift, observability, backup og sikkerhet

Sannsynlig produksjonsretning:

- Supabase eller tilsvarende for database, auth, storage og relevante API-tjenester
- managed worker/compute i stedet for hjemmeserver
- Vercel eller annen profesjonell hosting i stedet for GitHub Pages
- produksjonsklar auth/session-håndtering
- API-nøkler/OAuth
- rate limiting og quotas
- webhook retry/delivery audit
- billing hooks
- tydelig databehandler-/personvernoppsett

Produksjons-exit criteria:

- betalende kunde eller sterk betalingsindikasjon
- restore-testet backup
- audit-logg for sensitive handlinger
- stabil worker-drift
- tydelig API-kontrakt/OpenAPI
- overvåking av ingest, signalgenerering og webhook delivery
- sikker håndtering av secrets

## Senere Signalpakker

Mulige utvidelser:

- Doffin/TED for offentlige anbud
- SSB for markedsindikatorer
- Kartverket/Geonorge for sted/geografi
- Vegvesen DATEX/NVDB
- Entur
- NVE HydAPI
- BarentsWatch/Kystverket AIS
- MET/Frost
- Norges Bank
- Stortinget
- FHI/Helsedirektoratet

Disse skal ikke inn i første MVP med mindre Brreg-signaler alene ikke er nok til
å validere produktideen.
