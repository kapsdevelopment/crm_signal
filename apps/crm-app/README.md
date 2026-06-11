# crm_app

`apps/crm-app` er scaffoldet for den fremtidige brukerrettede CRM-appen.

Appen er planlagt bygget i Flutter for rask støtte av:

- web
- iOS
- Android

## Rolle

CRM-appen skal være det operative arbeidsverktøyet for kunder, prospekter,
leverandører og partnere.

Den skal konsumere `crm_signal` API-et på samme måte som eksterne CRM-systemer
kan gjøre senere. Signal-logikken skal ikke eies av CRM-appen.

## Planlagt CRM-MVP

- organisasjonsliste/accounts
- organisasjonsdetalj
- organisasjonsroller: prospect, customer, supplier, partner
- kontakter
- enkel pipeline
- aktiviteter/oppgaver
- notater
- signalfeed koblet til organisasjoner
- opprett account fra signal
- team/tilgangsstyring senere
- vedlegg senere

## Avgrensning Mot Console

`apps/signal-web` er Console for signalproduktet:

- forstå signaler
- justere ICP/watchlists
- evaluere signaler
- se API-eksempler

`apps/crm-app` er full CRM:

- jobbe operativt med accounts, kontakter, pipeline, aktiviteter og oppfølging

## Nåværende Status

Appen har nå en første navigerbar CRM-shell med API-backed store mot
`apps/crm-api`. Lokal mock-store ligger fortsatt bak samme interface og brukes
som fallback hvis lokal API ikke kjører, og som deterministisk testkilde.

- accounts-liste og account-detalj
- roller per account
- kontakter, pipeline, aktiviteter og notater
- signalfeed
- enkel "opprett account fra signal"-flyt
- `CrmWorkspaceStore`, `CrmRepository` og `SignalRepository`
- `CreateAccountFromSignalUseCase`
- `CrmWorkspaceController`
- `ApiCrmStore` mot `crm-api`
- `FallbackCrmStore` med mock-data

Hostingvalg for Flutter web skal tas på nytt når CRM-prototypen starter:

- Vercel
- GitHub Pages
- Cloudflare Pages
- Netlify
- annet

## Kommandoer

Start lokal CRM API fra repo-roten:

```bash
pnpm crm-api:dev
```

Fra `apps/crm-app`:

```bash
flutter pub get
flutter analyze
flutter test
flutter run -d chrome \
  --dart-define=CRM_API_BASE_URL=http://127.0.0.1:5185 \
  --dart-define=CRM_TENANT_SLUG=local-demo
```

Hvis `CRM_API_BASE_URL` ikke er satt, bruker appen
`http://127.0.0.1:5185`. Hvis API-et ikke svarer, faller appen tilbake til
mock-data.

Hvis FVM brukes i miljøet, kjør tilsvarende via `fvm flutter`.
