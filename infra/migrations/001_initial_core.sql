create extension if not exists pgcrypto;

create table ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  constraint ingest_runs_status_check check (
    status in ('running', 'succeeded', 'failed', 'cancelled')
  )
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  orgnr text not null unique,
  name text not null,
  organization_form_code text,
  organization_form_description text,
  is_active boolean not null default true,
  is_bankrupt boolean not null default false,
  is_under_liquidation boolean not null default false,
  is_deleted boolean not null default false,
  nace_code text,
  nace_description text,
  municipality_number text,
  municipality_name text,
  county_number text,
  county_name text,
  business_address jsonb not null default '{}'::jsonb,
  postal_address jsonb not null default '{}'::jsonb,
  registered_at date,
  source text not null default 'brreg',
  source_updated_at timestamptz,
  current_snapshot_id uuid,
  current_snapshot_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_orgnr_format_check check (orgnr ~ '^[0-9]{9}$')
);

create table organization_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  ingest_run_id uuid references ingest_runs(id) on delete set null,
  source text not null default 'brreg',
  source_record_id text not null,
  payload_hash text not null,
  canonical_payload jsonb not null,
  raw_payload jsonb not null,
  fetched_at timestamptz not null default now(),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, source, payload_hash)
);

alter table organizations
  add constraint organizations_current_snapshot_id_fkey
  foreign key (current_snapshot_id)
  references organization_snapshots(id)
  on delete set null;

create table organization_change_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  ingest_run_id uuid references ingest_runs(id) on delete set null,
  from_snapshot_id uuid references organization_snapshots(id) on delete set null,
  to_snapshot_id uuid references organization_snapshots(id) on delete set null,
  source text not null default 'brreg',
  event_type text not null,
  field_path text,
  old_value jsonb,
  new_value jsonb,
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table icp_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  name text not null,
  description text,
  criteria jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table watchlists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  name text not null,
  description text,
  criteria jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  orgnr text,
  note text,
  created_at timestamptz not null default now(),
  constraint watchlist_items_orgnr_format_check check (
    orgnr is null or orgnr ~ '^[0-9]{9}$'
  ),
  constraint watchlist_items_target_check check (
    organization_id is not null or orgnr is not null
  ),
  unique (watchlist_id, orgnr)
);

create table generated_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  organization_id uuid not null references organizations(id) on delete cascade,
  change_event_id uuid references organization_change_events(id) on delete set null,
  signal_type text not null,
  score integer not null,
  confidence text not null default 'medium',
  status text not null default 'new',
  title text not null,
  reason text not null,
  evidence jsonb not null default '[]'::jsonb,
  suggested_action text,
  source text not null default 'brreg',
  observed_at timestamptz not null default now(),
  generated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint generated_signals_score_check check (score between 0 and 100),
  constraint generated_signals_confidence_check check (
    confidence in ('low', 'medium', 'high')
  ),
  constraint generated_signals_status_check check (
    status in ('new', 'seen', 'acted_on', 'dismissed')
  )
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on organizations
for each row
execute function set_updated_at();

create trigger icp_profiles_set_updated_at
before update on icp_profiles
for each row
execute function set_updated_at();

create trigger watchlists_set_updated_at
before update on watchlists
for each row
execute function set_updated_at();

create index organizations_municipality_idx
  on organizations (municipality_number, municipality_name);

create index organizations_nace_idx
  on organizations (nace_code);

create index organizations_source_updated_at_idx
  on organizations (source_updated_at desc nulls last);

create index organization_snapshots_organization_fetched_idx
  on organization_snapshots (organization_id, fetched_at desc);

create index organization_snapshots_ingest_run_idx
  on organization_snapshots (ingest_run_id);

create index organization_change_events_organization_detected_idx
  on organization_change_events (organization_id, detected_at desc);

create index organization_change_events_type_idx
  on organization_change_events (event_type);

create index generated_signals_status_observed_idx
  on generated_signals (status, observed_at desc);

create index generated_signals_type_score_idx
  on generated_signals (signal_type, score desc);

create index generated_signals_organization_idx
  on generated_signals (organization_id, observed_at desc);

create index audit_events_occurred_idx
  on audit_events (occurred_at desc);

create index audit_events_entity_idx
  on audit_events (entity_type, entity_id);
