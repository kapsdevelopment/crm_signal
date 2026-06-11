import pg from "pg";
import { createDbClient } from "../db.js";

type IdRow = {
  id: string;
};

type OrganizationSeedRow = {
  id: string;
  orgnr: string;
  name: string;
  municipality_name: string | null;
  nace_code: string | null;
  nace_description: string | null;
};

type SignalSeedRow = OrganizationSeedRow & {
  signal_id: string;
  signal_title: string;
  signal_score: number;
};

type AccountSeed = OrganizationSeedRow & {
  source: "signal" | "import";
  createdFromSignalId: string | null;
  roles: string[];
};

type SeedStats = {
  tenantId: string;
  userId: string;
  pipelineId: string;
  stages: Record<string, string>;
  sourceOrganizations: number;
  availableSignals: number;
  accounts: number;
  contacts: number;
  deals: number;
  activities: number;
  notes: number;
  signalLinks: number;
};

type TenantCrmCounts = {
  accounts: number;
  contacts: number;
  deals: number;
  activities: number;
  notes: number;
  signalLinks: number;
};

const tenantSlug = "local-demo";
const tenantName = "Lokal CRM Demo";
const userEmail = "ken@local.crm-signal.example";
const userDisplayName = "Ken";
const pipelineName = "Lokal salgspipeline";

const contactNames = [
  "Amalie Berg",
  "Jonas Eide",
  "Sara Linde",
  "Marius Holm",
  "Ida Strand",
  "Eirik Moen",
];

const roleSets = [
  ["prospect", "partner"],
  ["customer", "supplier"],
  ["prospect"],
  ["supplier"],
  ["partner"],
  ["prospect", "supplier"],
];

const pipelineStages = [
  { name: "Ny dialog", position: 0, probability: 10 },
  { name: "Kvalifisert", position: 1, probability: 30 },
  { name: "Tilbud", position: 2, probability: 65 },
  { name: "Vunnet", position: 3, probability: 100, isWon: true },
];

function slugPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, ".").replace(/^\.+|\.+$/gu, "");
}

function contactName(index: number): string {
  return contactNames[index % contactNames.length];
}

function rolesForIndex(index: number): string[] {
  return roleSets[index % roleSets.length];
}

function dealValueForIndex(index: number): number {
  return [95000, 42000, 28000, 67000, 36000, 52000][index] ?? 25000;
}

async function getOrCreateTenant(client: pg.Client): Promise<string> {
  const result = await client.query<IdRow>(
    `insert into tenants (slug, name)
     values ($1, $2)
     on conflict (slug) do update
       set name = excluded.name
     returning id`,
    [tenantSlug, tenantName],
  );

  return result.rows[0].id;
}

async function getOrCreateUser(client: pg.Client): Promise<string> {
  const existing = await client.query<IdRow>(
    `select id
     from crm_users
     where email = $1
     order by created_at
     limit 1`,
    [userEmail],
  );

  const row = existing.rows[0];
  if (row) {
    await client.query(
      `update crm_users
       set display_name = $2
       where id = $1`,
      [row.id, userDisplayName],
    );
    return row.id;
  }

  const created = await client.query<IdRow>(
    `insert into crm_users (email, display_name)
     values ($1, $2)
     returning id`,
    [userEmail, userDisplayName],
  );

  return created.rows[0].id;
}

async function upsertMembership(options: {
  client: pg.Client;
  tenantId: string;
  userId: string;
}): Promise<void> {
  await options.client.query(
    `insert into tenant_memberships (tenant_id, user_id, role, status)
     values ($1, $2, 'owner', 'active')
     on conflict (tenant_id, user_id) do update
       set role = 'owner',
           status = 'active'`,
    [options.tenantId, options.userId],
  );
}

async function getOrCreatePipeline(options: {
  client: pg.Client;
  tenantId: string;
}): Promise<string> {
  const result = await options.client.query<IdRow>(
    `insert into crm_pipelines (tenant_id, name, is_default)
     values ($1, $2, true)
     on conflict (tenant_id, name) do update
       set is_default = true
     returning id`,
    [options.tenantId, pipelineName],
  );

  return result.rows[0].id;
}

async function upsertPipelineStages(options: {
  client: pg.Client;
  pipelineId: string;
}): Promise<Record<string, string>> {
  const stageIds: Record<string, string> = {};

  for (const stage of pipelineStages) {
    const result = await options.client.query<IdRow>(
      `insert into crm_pipeline_stages (
         pipeline_id,
         name,
         position,
         probability,
         is_won,
         is_lost
       )
       values ($1, $2, $3, $4, $5, false)
       on conflict (pipeline_id, name) do update
         set position = excluded.position,
             probability = excluded.probability,
             is_won = excluded.is_won,
             is_lost = excluded.is_lost
       returning id`,
      [
        options.pipelineId,
        stage.name,
        stage.position,
        stage.probability,
        stage.isWon === true,
      ],
    );
    stageIds[stage.name] = result.rows[0].id;
  }

  return stageIds;
}

async function fetchOrganizations(
  client: pg.Client,
): Promise<OrganizationSeedRow[]> {
  const result = await client.query<OrganizationSeedRow>(
    `select
       id,
       orgnr,
       name,
       municipality_name,
       nace_code,
       nace_description
     from organizations
     order by
       case when municipality_number = '0301' then 0 else 1 end,
       case when is_active = true then 0 else 1 end,
       name
     limit 8`,
  );

  return result.rows;
}

async function fetchSignals(client: pg.Client): Promise<SignalSeedRow[]> {
  const result = await client.query<SignalSeedRow>(
    `select
       o.id,
       o.orgnr,
       o.name,
       o.municipality_name,
       o.nace_code,
       o.nace_description,
       gs.id as signal_id,
       gs.title as signal_title,
       gs.score as signal_score
     from generated_signals gs
     join organizations o on o.id = gs.organization_id
     where gs.status <> 'dismissed'
     order by gs.score desc, gs.observed_at desc, gs.created_at desc
     limit 12`,
  );

  return result.rows;
}

function buildAccountSeeds(options: {
  organizations: OrganizationSeedRow[];
  signals: SignalSeedRow[];
}): AccountSeed[] {
  const seeds: AccountSeed[] = [];
  const seenOrganizationIds = new Set<string>();

  for (const signal of options.signals) {
    if (seenOrganizationIds.has(signal.id)) {
      continue;
    }

    seenOrganizationIds.add(signal.id);
    seeds.push({
      id: signal.id,
      orgnr: signal.orgnr,
      name: signal.name,
      municipality_name: signal.municipality_name,
      nace_code: signal.nace_code,
      nace_description: signal.nace_description,
      source: "signal",
      createdFromSignalId: signal.signal_id,
      roles: rolesForIndex(seeds.length),
    });

    if (seeds.length >= 2) {
      break;
    }
  }

  for (const organization of options.organizations) {
    if (seenOrganizationIds.has(organization.id)) {
      continue;
    }

    seenOrganizationIds.add(organization.id);
    seeds.push({
      ...organization,
      source: "import",
      createdFromSignalId: null,
      roles: rolesForIndex(seeds.length),
    });

    if (seeds.length >= 4) {
      break;
    }
  }

  return seeds;
}

async function upsertAccount(options: {
  client: pg.Client;
  tenantId: string;
  userId: string;
  seed: AccountSeed;
}): Promise<string> {
  const result = await options.client.query<IdRow>(
    `insert into crm_accounts (
       tenant_id,
       organization_id,
       owner_user_id,
       display_name,
       source,
       created_from_signal_id
     )
     values ($1, $2, $3, $4, $5, $6)
     on conflict (tenant_id, organization_id) do update
       set owner_user_id = excluded.owner_user_id,
           display_name = excluded.display_name,
           source = excluded.source,
           created_from_signal_id = coalesce(
             crm_accounts.created_from_signal_id,
             excluded.created_from_signal_id
           )
     returning id`,
    [
      options.tenantId,
      options.seed.id,
      options.userId,
      options.seed.name,
      options.seed.source,
      options.seed.createdFromSignalId,
    ],
  );

  return result.rows[0].id;
}

async function upsertAccountRoles(options: {
  client: pg.Client;
  accountId: string;
  roles: string[];
}): Promise<void> {
  for (const role of options.roles) {
    await options.client.query(
      `insert into crm_account_roles (account_id, role, status)
       values ($1, $2, 'active')
       on conflict (account_id, role) do update
         set status = 'active'`,
      [options.accountId, role],
    );
  }
}

async function getOrCreateContact(options: {
  client: pg.Client;
  tenantId: string;
  accountId: string;
  seed: AccountSeed;
  index: number;
}): Promise<string> {
  const name = contactName(options.index);
  const email = `${slugPart(name)}.${options.seed.orgnr}@local.crm-signal.example`;
  const title = options.index % 2 === 0 ? "Daglig leder" : "Prosjektleder";
  const phone = `+47 9${options.index + 10} ${options.seed.orgnr.slice(0, 2)} ${options.seed.orgnr.slice(2, 5)}`;
  const existing = await options.client.query<IdRow>(
    `select id
     from crm_contacts
     where tenant_id = $1
       and account_id = $2
       and email = $3
     limit 1`,
    [options.tenantId, options.accountId, email],
  );

  const row = existing.rows[0];
  if (row) {
    await options.client.query(
      `update crm_contacts
       set full_name = $2,
           title = $3,
           phone = $4,
           is_primary = true,
           source = 'import'
       where id = $1`,
      [row.id, name, title, phone],
    );
    return row.id;
  }

  const created = await options.client.query<IdRow>(
    `insert into crm_contacts (
       tenant_id,
       account_id,
       full_name,
       title,
       email,
       phone,
       is_primary,
       source
     )
     values ($1, $2, $3, $4, $5, $6, true, 'import')
     returning id`,
    [options.tenantId, options.accountId, name, title, email, phone],
  );

  return created.rows[0].id;
}

async function getOrCreateDeal(options: {
  client: pg.Client;
  tenantId: string;
  accountId: string;
  userId: string;
  stageId: string;
  seed: AccountSeed;
  index: number;
}): Promise<string> {
  const title =
    options.seed.source === "signal"
      ? `Kvalifiser signalmulighet: ${options.seed.name}`
      : `Oppfølging: ${options.seed.name}`;
  const valueAmount = dealValueForIndex(options.index);
  const existing = await options.client.query<IdRow>(
    `select id
     from crm_deals
     where tenant_id = $1
       and account_id = $2
       and title = $3
     limit 1`,
    [options.tenantId, options.accountId, title],
  );

  const row = existing.rows[0];
  if (row) {
    await options.client.query(
      `update crm_deals
       set stage_id = $2,
           owner_user_id = $3,
           value_amount = $4,
           currency = 'NOK',
           status = 'open'
       where id = $1`,
      [row.id, options.stageId, options.userId, valueAmount],
    );
    return row.id;
  }

  const created = await options.client.query<IdRow>(
    `insert into crm_deals (
       tenant_id,
       account_id,
       stage_id,
       owner_user_id,
       title,
       value_amount,
       currency,
       status
     )
     values ($1, $2, $3, $4, $5, $6, 'NOK', 'open')
     returning id`,
    [
      options.tenantId,
      options.accountId,
      options.stageId,
      options.userId,
      title,
      valueAmount,
    ],
  );

  return created.rows[0].id;
}

async function upsertActivity(options: {
  client: pg.Client;
  tenantId: string;
  accountId: string;
  contactId: string;
  dealId: string;
  userId: string;
  seed: AccountSeed;
  index: number;
}): Promise<void> {
  const title =
    options.seed.source === "signal"
      ? `Kvalifiser ${options.seed.name}`
      : `Planlegg oppfølging med ${options.seed.name}`;
  const dueAt = new Date(Date.now() + (options.index + 1) * 24 * 60 * 60 * 1000);
  const existing = await options.client.query<IdRow>(
    `select id
     from crm_activities
     where tenant_id = $1
       and account_id = $2
       and title = $3
     limit 1`,
    [options.tenantId, options.accountId, title],
  );

  const row = existing.rows[0];
  if (row) {
    await options.client.query(
      `update crm_activities
       set contact_id = $2,
           deal_id = $3,
           owner_user_id = $4,
           activity_type = 'follow_up',
           status = 'open',
           due_at = $5
       where id = $1`,
      [row.id, options.contactId, options.dealId, options.userId, dueAt],
    );
    return;
  }

  await options.client.query(
    `insert into crm_activities (
       tenant_id,
       account_id,
       contact_id,
       deal_id,
       owner_user_id,
       activity_type,
       title,
       body,
       status,
       due_at
     )
     values ($1, $2, $3, $4, $5, 'follow_up', $6, $7, 'open', $8)`,
    [
      options.tenantId,
      options.accountId,
      options.contactId,
      options.dealId,
      options.userId,
      title,
      "Lokal CRM-seed for å teste account-arbeidsflyt.",
      dueAt,
    ],
  );
}

async function upsertNote(options: {
  client: pg.Client;
  tenantId: string;
  accountId: string;
  userId: string;
  seed: AccountSeed;
}): Promise<void> {
  const industry =
    options.seed.nace_code && options.seed.nace_description
      ? `${options.seed.nace_code} ${options.seed.nace_description}`
      : "ukjent næringskode";
  const body = `Seedet lokal CRM-account fra ${options.seed.source}. Bransje: ${industry}.`;
  const existing = await options.client.query<IdRow>(
    `select id
     from crm_notes
     where tenant_id = $1
       and account_id = $2
       and body = $3
     limit 1`,
    [options.tenantId, options.accountId, body],
  );

  const row = existing.rows[0];
  if (row) {
    await options.client.query(
      `update crm_notes
       set author_user_id = $2
       where id = $1`,
      [row.id, options.userId],
    );
    return;
  }

  await options.client.query(
    `insert into crm_notes (
       tenant_id,
       account_id,
       author_user_id,
       body
     )
     values ($1, $2, $3, $4)`,
    [options.tenantId, options.accountId, options.userId, body],
  );
}

async function upsertSignalLinks(options: {
  client: pg.Client;
  tenantId: string;
  accountIdsByOrganizationId: Map<string, string>;
  signals: SignalSeedRow[];
}): Promise<number> {
  let linkedCount = 0;

  for (const signal of options.signals) {
    const accountId = options.accountIdsByOrganizationId.get(signal.id);
    if (!accountId) {
      continue;
    }

    const status = signal.signal_score >= 85 ? "acted_on" : "seen";
    await options.client.query(
      `insert into crm_account_signals (
         tenant_id,
         account_id,
         generated_signal_id,
         status,
         note
       )
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, generated_signal_id) do update
         set account_id = excluded.account_id,
             status = excluded.status,
             note = excluded.note`,
      [
        options.tenantId,
        accountId,
        signal.signal_id,
        status,
        `Lokal CRM-link fra signal: ${signal.signal_title}`,
      ],
    );
    linkedCount += 1;
  }

  return linkedCount;
}

async function insertSeedAuditEvent(options: {
  client: pg.Client;
  tenantId: string;
  userId: string;
  stats: Omit<SeedStats, "tenantId" | "userId" | "pipelineId" | "stages">;
}): Promise<void> {
  const existing = await options.client.query<IdRow>(
    `select id
     from audit_events
     where tenant_id = $1
       and actor_user_id = $2
       and action = 'crm.dev_seeded'
       and entity_type = 'tenant'
       and entity_id = $1
     limit 1`,
    [options.tenantId, options.userId],
  );

  if (existing.rows[0]) {
    await options.client.query(
      `update audit_events
       set metadata = $2,
           occurred_at = now()
       where id = $1`,
      [existing.rows[0].id, options.stats],
    );
    return;
  }

  await options.client.query(
    `insert into audit_events (
       tenant_id,
       actor_user_id,
       action,
       entity_type,
       entity_id,
       metadata
     )
     values ($1, $2, 'crm.dev_seeded', 'tenant', $1, $3)`,
    [options.tenantId, options.userId, options.stats],
  );
}

async function fetchTenantCrmCounts(
  client: pg.Client,
  tenantId: string,
): Promise<TenantCrmCounts> {
  const result = await client.query<TenantCrmCounts>(
    `select
       (select count(*)::integer from crm_accounts where tenant_id = $1) as "accounts",
       (select count(*)::integer from crm_contacts where tenant_id = $1) as "contacts",
       (select count(*)::integer from crm_deals where tenant_id = $1) as "deals",
       (select count(*)::integer from crm_activities where tenant_id = $1) as "activities",
       (select count(*)::integer from crm_notes where tenant_id = $1) as "notes",
       (select count(*)::integer from crm_account_signals where tenant_id = $1) as "signalLinks"`,
    [tenantId],
  );

  return result.rows[0];
}

export async function runSeedCrmContext(): Promise<void> {
  const client = createDbClient();
  await client.connect();

  try {
    await client.query("begin");

    const tenantId = await getOrCreateTenant(client);
    const userId = await getOrCreateUser(client);
    await upsertMembership({ client, tenantId, userId });

    const pipelineId = await getOrCreatePipeline({ client, tenantId });
    const stages = await upsertPipelineStages({ client, pipelineId });
    const organizations = await fetchOrganizations(client);

    if (organizations.length === 0) {
      throw new Error(
        "No organizations found. Run `pnpm worker brreg:import --scope oslo --limit 10` first.",
      );
    }

    const signals = await fetchSignals(client);
    const accountSeeds = buildAccountSeeds({ organizations, signals });
    const accountIdsByOrganizationId = new Map<string, string>();

    for (const [index, seed] of accountSeeds.entries()) {
      const accountId = await upsertAccount({ client, tenantId, userId, seed });
      accountIdsByOrganizationId.set(seed.id, accountId);
      await upsertAccountRoles({ client, accountId, roles: seed.roles });

      const contactId = await getOrCreateContact({
        client,
        tenantId,
        accountId,
        seed,
        index,
      });

      const stageName = pipelineStages[Math.min(index, 2)].name;
      const stageId = stages[stageName];
      const dealId = await getOrCreateDeal({
        client,
        tenantId,
        accountId,
        userId,
        stageId,
        seed,
        index,
      });

      await upsertActivity({
        client,
        tenantId,
        accountId,
        contactId,
        dealId,
        userId,
        seed,
        index,
      });

      await upsertNote({ client, tenantId, accountId, userId, seed });
    }

    await upsertSignalLinks({
      client,
      tenantId,
      accountIdsByOrganizationId,
      signals,
    });

    const counts = await fetchTenantCrmCounts(client, tenantId);
    const stats: SeedStats = {
      tenantId,
      userId,
      pipelineId,
      stages,
      sourceOrganizations: organizations.length,
      availableSignals: signals.length,
      accounts: counts.accounts,
      contacts: counts.contacts,
      deals: counts.deals,
      activities: counts.activities,
      notes: counts.notes,
      signalLinks: counts.signalLinks,
    };

    await insertSeedAuditEvent({
      client,
      tenantId,
      userId,
      stats: {
        sourceOrganizations: stats.sourceOrganizations,
        availableSignals: stats.availableSignals,
        accounts: stats.accounts,
        contacts: stats.contacts,
        deals: stats.deals,
        activities: stats.activities,
        notes: stats.notes,
        signalLinks: stats.signalLinks,
      },
    });

    await client.query("commit");

    console.log("Local CRM context seeded");
    console.log(JSON.stringify(stats, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
