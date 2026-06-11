# crm-api

`apps/crm-api` er backend for den brukerrettede CRM-appen.

Dette er bevisst separat fra `apps/signal-api`:

- `signal-api`: signalproduktet for Console og eksterne CRM-integrasjoner.
- `crm-api`: vårt eget CRM-produkt med accounts, kontakter, pipeline, oppgaver og notater.

I lokal dev leser `crm-api` samme Postgres direkte. I prototype/produksjon kan
denne deployable flyttes til Supabase Edge Functions eller annen backend, men
produktgrensen skal bestå.

## Første Endepunkter

```text
GET  /health
GET  /crm/accounts
GET  /crm/accounts/:id
GET  /crm/signals
POST /crm/accounts/from-signal
```

Tenant velges foreløpig via header eller query string:

```text
X-Tenant-Slug: local-demo
?tenant=local-demo
```

Hvis ingen tenant er oppgitt brukes `local-demo`.

## Lokal Kjøring

Seed data først:

```bash
pnpm worker dev:seed-crm-context
```

Start API:

```bash
pnpm crm-api:dev
```

Standard URL:

```text
http://127.0.0.1:5185
```
