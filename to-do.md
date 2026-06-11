# To-do

Dette er arbeidslisten for å komme fra ide til lokal MVP, deretter prototype og til slutt mulig produksjon.

## Nå: Lokal crm_signal Dev på Mac

- [x] Velg første teknologistack for lokal MVP.
- [x] Sett opp grunnleggende monorepo-struktur.
- [x] Sett opp lokal Postgres.
- [x] Bestem om lokal storage først skal være filmappe eller MinIO.
- [x] Lag første rene SQL-database-migrasjoner.
- [x] Definer `organizations`.
- [x] Definer `organization_snapshots`.
- [x] Definer `organization_change_events`.
- [x] Definer `ingest_runs`.
- [x] Definer `icp_profiles`.
- [x] Definer `watchlists`.
- [x] Definer `generated_signals`.
- [x] Lag Brreg-klient for avgrenset import.
- [x] Lag normalisering fra Brreg-respons til intern organisasjonsmodell.
- [x] Lag raw snapshot-lagring.
- [x] Lag canonical hash for snapshots.
- [x] Lag diffing mellom forrige og ny snapshot.
- [x] Lag change events for endrede felter.
- [x] Lag `organization_created` change event for førstegangsimport.
- [x] Lag første signalgenerator.
- [x] Lag enkel scoring.
- [x] Lag enkel ICP/watchlist-basert signalboost.
- [x] Lag forklaring/evidence for signaler.
- [x] Lag terminal-preview eller enkel lokal webvisning av signalfeed.
- [x] Lag lokal evalueringsrapport for signaler.
- [x] Lag mer realistiske lokale ICP-profiler.
- [x] Splitt bygg/anlegg og eiendom/utleie/holding i separate lokale ICP-profiler.
- [x] Kjør første 300-organisasjoners Oslo-evaluering.
- [x] Kjør test på Oslo som første geografiske scope.
- [x] Oppdater arkitektur, roadmap og agent-kontekst.
- [x] Lag signal feedback/review: useful/maybe/noise/reason.
- [ ] Evaluer om signalene føles nyttige.
- [ ] Bruk feedback på flere signaler og juster ICP/scoring basert på noise-mønstre.
- [ ] Vurder CSV-export for rask manuell signalevaluering.

## Første Signaltyper

- [x] Ny virksomhet matcher ICP/watchlist.
- [x] Adresseendring.
- [ ] Ny underenhet.
- [ ] Endret næringskode.
- [ ] Endret foretaksstatus.
- [ ] Klynge av nye virksomheter i område/bransje.
- [ ] Leverandørendring eller leverandørrisiko.

## Lokal MVP Kvalitet

- [ ] Legg inn grunnleggende logging.
- [ ] Legg inn feilhåndtering for Brreg-kall.
- [ ] Legg inn idempotens for ingest.
- [ ] Legg inn retry-strategi for enkle jobber.
- [ ] Legg inn audit-lignende hendelser for viktige operasjoner.
- [x] Legg inn seed/testdata.
- [x] Lag enkle tester for normalisering.
- [x] Lag enkle tester for diffing.
- [x] Lag enkle tester for signalgenerering.
- [x] Lag dev-reset som sletter domeneinnhold, men beholder schema.

## crm_signal Console

- [x] Opprett `apps/signal-web`.
- [x] Velg første enkle frontend-stack for Console.
- [x] Lag dashboard med totals og siste signaler i lokal Console-scaffold.
- [x] Lag signalfeed med score, reason og evidence i lokal Console-scaffold.
- [x] Vis matched ICP/watchlist tydelig i signalfeed.
- [x] Vis vurderingsgrunnlag per signal: bransje, orgform/status, registreringsdato, ICP-kriterier og usikkerhet.
- [x] Vis NACE breakdown per ICP.
- [x] Lag enkel ICP/watchlist-visning.
- [x] Lag lokal opprettelse og justering av ICP-profiler.
- [x] Lag signal review UI: useful/maybe/noise.
- [x] Lag CSV-export fra signalfeed.
- [x] Legg inn API docs/eksempler.
- [x] Legg inn tydelig CTA til full CRM.
- [x] Koble ICP-profiler i Console til `signal-api`/Postgres.
- [x] La toggles for ICP-profiler påvirke workerens aktive scoring-kontekst.
- [x] Koble watchlists i Console til `signal-api`/Postgres.
- [x] La watchlist-toggles påvirke workerens aktive scoring-kontekst.
- [x] Koble Console til ekte `signal-api` for live dashboard og signalfeed.
- [x] Persister ICP-profiler via API/database i stedet for bare `localStorage`.
- [x] Persister watchlists via API/database i stedet for bare `localStorage`.
- [ ] Persister signal review via API/database i stedet for bare `localStorage`.

## crm_signal API

- [x] Opprett `apps/signal-api`.
- [x] Definer første signalfeed-endepunkt.
- [x] Definer første dashboard-endepunkt.
- [x] Definer første ICP-profil-endepunkter.
- [x] Definer første watchlist-endepunkter.
- [ ] Lag OpenAPI-start.
- [ ] Planlegg API keys/auth for prototype.

## Senere Enrichment- og Signalpakker

- [ ] Undersøk direkte tilgang til årsregnskap/regnskapsdata fra Brreg/Regnskapsregisteret.
- [ ] Avklar lisens, kostnad, API/filformat og oppdateringsfrekvens for regnskapsdata.
- [ ] Vurder datamodell for regnskapsnøkkeltall, f.eks. `organization_financials`.
- [ ] Lag senere indikatorer for omsetning, resultat, egenkapital, likviditet, vekst/fall og regnskapsalder.
- [ ] Vurder egne signaltyper basert på regnskap, f.eks. vekst, fallende omsetning, negativ egenkapital eller manglende/gammelt regnskap.

## Beslutningspunkt: Gå til Prototype?

Før prototype skal vi svare på:

- [ ] Er signalene interessante nok?
- [ ] Hvilken bruker skal prototypen demonstreres for?
- [ ] Er CRM-delen nødvendig i prototypen, eller holder signalfeed?
- [ ] Skal Supabase Cloud tas i bruk nå?
- [ ] Skal hjemmeserveren brukes som worker nå?
- [ ] Skal GitHub Pages brukes for `signal-web` Console?

## Prototype av crm_signal og Brukerrettet CRM

- [ ] Opprett Supabase-prosjekt.
- [ ] Vurder når datadekningen skal utvides fra Oslo til hele Norge.
- [ ] Flytt/speil SQL-migrasjoner til Supabase-kompatibelt oppsett.
- [ ] Sett opp Supabase Auth.
- [ ] Sett opp RLS for tenant-data.
- [ ] Sett opp Supabase Storage.
- [ ] Sett opp Edge Functions der privilegert backendlogikk trengs.
- [ ] Sett opp job/status-tabeller i Supabase.
- [ ] Flytt worker-kjøring til hjemmeserver.
- [ ] Sørg for at hjemmeserver kun trenger utgående nettverk.
- [ ] Sett opp secrets på hjemmeserver.
- [ ] Sett opp cron/systemd/Docker for worker.
- [ ] Deploy `signal-web` Console til GitHub Pages hvis valgt.
- [ ] Spør på nytt om hostingvalg for Flutter web: Vercel, GitHub Pages, Cloudflare Pages, Netlify eller annet.
- [x] Sett opp Flutter-app scaffold for brukerrettet CRM.
- [x] Lag lokal CRM-seed fra organisasjoner/signaler.
- [x] Lag separat lokal `crm-api` for CRM-produktet.
- [ ] Bygg Flutter web-target for prototype.
- [ ] Avklar når iOS/Android target skal testes.
- [ ] Test innlogging.
- [ ] Test signalfeed.
- [ ] Test filtilgang/signed URLs hvis vedlegg er med.
- [ ] Test audit for viktige handlinger.

- [x] Definer sluttbruker-MVP for CRM.
- [x] Bygg første accounts/organizations-visning med mock/repository-lag.
- [x] Bygg første organisasjonsroller.
- [x] Bygg første kontakter.
- [x] Bygg første aktiviteter/oppgaver.
- [x] Bygg første notater.
- [x] Bygg første enkel pipeline.
- [x] Koble signaler til organisasjoner/accounts i lokal seed/mock-flyt.
- [x] Bytt Flutter repository-adapter fra mock-store til `crm-api`.
- [ ] Avklar om produktet skal ha kunder, prospekter, leverandører og partnere i samme grensesnitt.

## Før Produksjon

- [ ] Flytt worker/prosessering bort fra hjemmeserver.
- [ ] Flytt frontend bort fra GitHub Pages.
- [ ] Avklar produksjonshosting.
- [ ] Innfør robust secrets-håndtering.
- [ ] Innfør overvåking/alerts.
- [ ] Innfør backup og restore-test.
- [ ] Innfør rate limiting/quotas.
- [ ] Innfør API keys/OAuth.
- [ ] Innfør webhook retry og delivery audit.
- [ ] Innfør billing hooks.
- [ ] Gjennomgå personvern og databehandlerbehov.
- [ ] Dokumenter API med OpenAPI.
- [ ] Lag produksjonsklar runbook.

## Ting Vi Bevisst Utsetter

- [ ] Full kommersiell SaaS-hosting.
- [ ] Betalingsintegrasjon.
- [ ] Mange datakilder samtidig.
- [ ] Tung Parquet/data lake-arkitektur.
- [ ] AIS/stor tidsserieprosessering.
- [ ] Avansert ABAC utover MVP-behov.
- [ ] Full OAuth-plattform for eksterne CRM-integrasjoner.
- [ ] Komplett self-hosted Supabase.
