create table signal_feedback (
  id uuid primary key default gen_random_uuid(),
  generated_signal_id uuid not null references generated_signals(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  created_by_user_id uuid references crm_users(id) on delete set null,
  rating text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint signal_feedback_rating_check check (
    rating in ('useful', 'maybe', 'noise')
  )
);

create index signal_feedback_signal_created_idx
  on signal_feedback (generated_signal_id, created_at desc);

create index signal_feedback_tenant_rating_idx
  on signal_feedback (tenant_id, rating, created_at desc);

create index signal_feedback_rating_created_idx
  on signal_feedback (rating, created_at desc);
