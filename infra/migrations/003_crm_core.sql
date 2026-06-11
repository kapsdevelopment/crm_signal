create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format_check check (
    slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
  )
);

create table crm_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references crm_users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_role_check check (
    role in ('owner', 'admin', 'member', 'viewer')
  ),
  constraint tenant_memberships_status_check check (
    status in ('invited', 'active', 'suspended')
  ),
  unique (tenant_id, user_id)
);

create table crm_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  owner_user_id uuid references crm_users(id) on delete set null,
  display_name text,
  lifecycle_status text not null default 'open',
  source text not null default 'manual',
  created_from_signal_id uuid references generated_signals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_accounts_lifecycle_status_check check (
    lifecycle_status in ('open', 'archived')
  ),
  constraint crm_accounts_source_check check (
    source in ('manual', 'signal', 'import')
  ),
  unique (tenant_id, organization_id)
);

create table crm_account_roles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references crm_accounts(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint crm_account_roles_role_check check (
    role in ('prospect', 'customer', 'supplier', 'partner', 'competitor', 'other')
  ),
  constraint crm_account_roles_status_check check (
    status in ('active', 'inactive')
  ),
  unique (account_id, role)
);

create table crm_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  account_id uuid not null references crm_accounts(id) on delete cascade,
  full_name text not null,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_contacts_source_check check (
    source in ('manual', 'signal', 'import')
  )
);

create table crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references crm_pipelines(id) on delete cascade,
  name text not null,
  position integer not null,
  probability integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_pipeline_stages_position_check check (position >= 0),
  constraint crm_pipeline_stages_probability_check check (
    probability between 0 and 100
  ),
  constraint crm_pipeline_stages_terminal_check check (
    not (is_won and is_lost)
  ),
  unique (pipeline_id, name),
  unique (pipeline_id, position)
);

create table crm_deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  account_id uuid not null references crm_accounts(id) on delete cascade,
  stage_id uuid not null references crm_pipeline_stages(id) on delete restrict,
  owner_user_id uuid references crm_users(id) on delete set null,
  title text not null,
  value_amount numeric(12, 2),
  currency char(3) not null default 'NOK',
  status text not null default 'open',
  expected_close_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_deals_value_amount_check check (
    value_amount is null or value_amount >= 0
  ),
  constraint crm_deals_status_check check (
    status in ('open', 'won', 'lost', 'archived')
  )
);

create table crm_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  account_id uuid references crm_accounts(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  deal_id uuid references crm_deals(id) on delete cascade,
  owner_user_id uuid references crm_users(id) on delete set null,
  activity_type text not null default 'task',
  title text not null,
  body text,
  status text not null default 'open',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_activities_target_check check (
    account_id is not null or contact_id is not null or deal_id is not null
  ),
  constraint crm_activities_activity_type_check check (
    activity_type in ('task', 'call', 'email', 'meeting', 'follow_up', 'other')
  ),
  constraint crm_activities_status_check check (
    status in ('open', 'done', 'cancelled')
  )
);

create table crm_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  account_id uuid references crm_accounts(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete cascade,
  deal_id uuid references crm_deals(id) on delete cascade,
  author_user_id uuid references crm_users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_notes_target_check check (
    account_id is not null or contact_id is not null or deal_id is not null
  )
);

create table crm_account_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  account_id uuid not null references crm_accounts(id) on delete cascade,
  generated_signal_id uuid not null references generated_signals(id) on delete cascade,
  status text not null default 'new',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_account_signals_status_check check (
    status in ('new', 'seen', 'acted_on', 'dismissed')
  ),
  unique (tenant_id, generated_signal_id)
);

create trigger tenants_set_updated_at
before update on tenants
for each row
execute function set_updated_at();

create trigger crm_users_set_updated_at
before update on crm_users
for each row
execute function set_updated_at();

create trigger tenant_memberships_set_updated_at
before update on tenant_memberships
for each row
execute function set_updated_at();

create trigger crm_accounts_set_updated_at
before update on crm_accounts
for each row
execute function set_updated_at();

create trigger crm_contacts_set_updated_at
before update on crm_contacts
for each row
execute function set_updated_at();

create trigger crm_pipelines_set_updated_at
before update on crm_pipelines
for each row
execute function set_updated_at();

create trigger crm_pipeline_stages_set_updated_at
before update on crm_pipeline_stages
for each row
execute function set_updated_at();

create trigger crm_deals_set_updated_at
before update on crm_deals
for each row
execute function set_updated_at();

create trigger crm_activities_set_updated_at
before update on crm_activities
for each row
execute function set_updated_at();

create trigger crm_notes_set_updated_at
before update on crm_notes
for each row
execute function set_updated_at();

create trigger crm_account_signals_set_updated_at
before update on crm_account_signals
for each row
execute function set_updated_at();

create index tenant_memberships_tenant_idx
  on tenant_memberships (tenant_id, role, status);

create index crm_accounts_tenant_updated_idx
  on crm_accounts (tenant_id, updated_at desc);

create index crm_accounts_organization_idx
  on crm_accounts (organization_id);

create index crm_account_roles_role_idx
  on crm_account_roles (role);

create index crm_contacts_account_idx
  on crm_contacts (account_id, is_primary desc, full_name);

create unique index crm_pipelines_one_default_per_tenant_idx
  on crm_pipelines (tenant_id)
  where is_default = true;

create index crm_pipeline_stages_pipeline_position_idx
  on crm_pipeline_stages (pipeline_id, position);

create index crm_deals_tenant_status_idx
  on crm_deals (tenant_id, status, updated_at desc);

create index crm_deals_account_idx
  on crm_deals (account_id, status);

create index crm_activities_tenant_due_idx
  on crm_activities (tenant_id, status, due_at nulls last);

create index crm_activities_account_idx
  on crm_activities (account_id, status);

create index crm_notes_account_created_idx
  on crm_notes (account_id, created_at desc);

create index crm_account_signals_account_idx
  on crm_account_signals (account_id, status, created_at desc);
