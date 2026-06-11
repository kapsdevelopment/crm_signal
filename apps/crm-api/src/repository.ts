import pg from "pg";
import { createDbClient } from "./db.js";
import { notFound } from "./errors.js";
import type {
  AccountDetail,
  AccountRole,
  AccountSummary,
  ActivityDto,
  ContactDto,
  CreateAccountFromSignalInput,
  CrmApiService,
  CrmSignalDto,
  DealDto,
  NoteDto,
  TenantContext,
} from "./types.js";

type TenantRow = {
  id: string;
};

type UserRow = {
  id: string;
};

type AccountRow = {
  id: string;
  organization_id: string;
  orgnr: string;
  name: string;
  municipality_name: string | null;
  nace_code: string | null;
  nace_description: string | null;
  roles: string[] | null;
  owner_name: string | null;
  source: "manual" | "signal" | "import";
  updated_at: Date;
};

type ContactRow = {
  id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

type DealRow = {
  id: string;
  title: string;
  stage_name: string;
  value_amount: string | null;
  currency: string;
  status: string;
  owner_name: string | null;
};

type ActivityRow = {
  id: string;
  title: string;
  body: string | null;
  activity_type: string;
  status: string;
  due_at: Date | null;
  owner_name: string | null;
};

type NoteRow = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: Date;
};

type SignalRow = {
  id: string | null;
  generated_signal_id: string;
  organization_id: string;
  linked_account_id: string | null;
  orgnr: string;
  organization_name: string;
  title: string;
  reason: string;
  score: number;
  status: "new" | "seen" | "acted_on" | "dismissed";
  observed_at: Date;
};

type GeneratedSignalRow = {
  signal_id: string;
  organization_id: string;
  organization_name: string;
};

function mapAccount(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    orgnr: row.orgnr,
    name: row.name,
    municipalityName: row.municipality_name,
    naceCode: row.nace_code,
    naceDescription: row.nace_description,
    roles: (row.roles ?? []).filter((role): role is AccountRole =>
      ["prospect", "customer", "supplier", "partner", "competitor", "other"].includes(role),
    ),
    ownerName: row.owner_name,
    source: row.source,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapContact(row: ContactRow): ContactDto {
  return {
    id: row.id,
    fullName: row.full_name,
    title: row.title,
    email: row.email,
    phone: row.phone,
    isPrimary: row.is_primary,
  };
}

function mapDeal(row: DealRow): DealDto {
  return {
    id: row.id,
    title: row.title,
    stageName: row.stage_name,
    valueAmount: row.value_amount,
    currency: row.currency,
    status: row.status,
    ownerName: row.owner_name,
  };
}

function mapActivity(row: ActivityRow): ActivityDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    activityType: row.activity_type,
    status: row.status,
    dueAt: row.due_at?.toISOString() ?? null,
    ownerName: row.owner_name,
  };
}

function mapNote(row: NoteRow): NoteDto {
  return {
    id: row.id,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at.toISOString(),
  };
}

function mapSignal(row: SignalRow): CrmSignalDto {
  return {
    id: row.id ?? row.generated_signal_id,
    generatedSignalId: row.generated_signal_id,
    organizationId: row.organization_id,
    linkedAccountId: row.linked_account_id,
    orgnr: row.orgnr,
    organizationName: row.organization_name,
    title: row.title,
    reason: row.reason,
    score: row.score,
    status: row.status,
    observedAt: row.observed_at.toISOString(),
  };
}

async function getTenantId(
  client: pg.Client,
  context: TenantContext,
): Promise<string> {
  const result = await client.query<TenantRow>(
    `select id
     from tenants
     where slug = $1
     limit 1`,
    [context.slug],
  );

  const row = result.rows[0];
  if (!row) {
    throw notFound(
      `Tenant '${context.slug}' not found. Run pnpm worker dev:seed-crm-context first.`,
    );
  }

  return row.id;
}

async function getDefaultUserId(
  client: pg.Client,
  tenantId: string,
): Promise<string> {
  const result = await client.query<UserRow>(
    `select tm.user_id as id
     from tenant_memberships tm
     join crm_users u on u.id = tm.user_id
     where tm.tenant_id = $1
       and tm.status = 'active'
     order by
       case tm.role when 'owner' then 0 when 'admin' then 1 else 2 end,
       u.created_at
     limit 1`,
    [tenantId],
  );

  const row = result.rows[0];
  if (!row) {
    throw notFound("No active CRM user found for tenant.");
  }

  return row.id;
}

async function fetchAccountRow(
  client: pg.Client,
  tenantId: string,
  accountId: string,
): Promise<AccountRow | null> {
  const result = await client.query<AccountRow>(
    `select
       ca.id,
       ca.organization_id,
       o.orgnr,
       coalesce(ca.display_name, o.name) as name,
       o.municipality_name,
       o.nace_code,
       o.nace_description,
       array_remove(array_agg(distinct car.role order by car.role), null) as roles,
       owner.display_name as owner_name,
       ca.source,
       ca.updated_at
     from crm_accounts ca
     join organizations o on o.id = ca.organization_id
     left join crm_account_roles car on car.account_id = ca.id
     left join crm_users owner on owner.id = ca.owner_user_id
     where ca.tenant_id = $1
       and ca.id = $2
     group by ca.id, o.id, owner.id`,
    [tenantId, accountId],
  );

  return result.rows[0] ?? null;
}

async function fetchAccountSignals(
  client: pg.Client,
  tenantId: string,
  accountId: string,
): Promise<CrmSignalDto[]> {
  const result = await client.query<SignalRow>(
    `select
       cas.id,
       gs.id as generated_signal_id,
       gs.organization_id,
       cas.account_id as linked_account_id,
       o.orgnr,
       o.name as organization_name,
       gs.title,
       gs.reason,
       gs.score,
       cas.status,
       gs.observed_at
     from crm_account_signals cas
     join generated_signals gs on gs.id = cas.generated_signal_id
     join organizations o on o.id = gs.organization_id
     where cas.tenant_id = $1
       and cas.account_id = $2
     order by gs.observed_at desc, gs.score desc`,
    [tenantId, accountId],
  );

  return result.rows.map(mapSignal);
}

export class PostgresCrmApiService implements CrmApiService {
  async listAccounts(context: TenantContext): Promise<AccountSummary[]> {
    const client = createDbClient();
    await client.connect();

    try {
      const tenantId = await getTenantId(client, context);
      const result = await client.query<AccountRow>(
        `select
           ca.id,
           ca.organization_id,
           o.orgnr,
           coalesce(ca.display_name, o.name) as name,
           o.municipality_name,
           o.nace_code,
           o.nace_description,
           array_remove(array_agg(distinct car.role order by car.role), null) as roles,
           owner.display_name as owner_name,
           ca.source,
           ca.updated_at
         from crm_accounts ca
         join organizations o on o.id = ca.organization_id
         left join crm_account_roles car on car.account_id = ca.id
         left join crm_users owner on owner.id = ca.owner_user_id
         where ca.tenant_id = $1
         group by ca.id, o.id, owner.id
         order by ca.updated_at desc, ca.created_at desc`,
        [tenantId],
      );

      return result.rows.map(mapAccount);
    } finally {
      await client.end();
    }
  }

  async getAccount(
    context: TenantContext,
    accountId: string,
  ): Promise<AccountDetail | null> {
    const client = createDbClient();
    await client.connect();

    try {
      const tenantId = await getTenantId(client, context);
      const account = await fetchAccountRow(client, tenantId, accountId);

      if (!account) {
        return null;
      }

      const contacts = await client.query<ContactRow>(
        `select id, full_name, title, email, phone, is_primary
         from crm_contacts
         where tenant_id = $1
           and account_id = $2
         order by is_primary desc, full_name`,
        [tenantId, accountId],
      );
      const deals = await client.query<DealRow>(
        `select
           d.id,
           d.title,
           s.name as stage_name,
           d.value_amount::text,
           d.currency,
           d.status,
           owner.display_name as owner_name
         from crm_deals d
         join crm_pipeline_stages s on s.id = d.stage_id
         left join crm_users owner on owner.id = d.owner_user_id
         where d.tenant_id = $1
           and d.account_id = $2
         order by d.updated_at desc`,
        [tenantId, accountId],
      );
      const activities = await client.query<ActivityRow>(
        `select
           a.id,
           a.title,
           a.body,
           a.activity_type,
           a.status,
           a.due_at,
           owner.display_name as owner_name
         from crm_activities a
         left join crm_users owner on owner.id = a.owner_user_id
         where a.tenant_id = $1
           and a.account_id = $2
         order by a.status, a.due_at nulls last, a.created_at desc`,
        [tenantId, accountId],
      );
      const notes = await client.query<NoteRow>(
        `select
           n.id,
           n.body,
           author.display_name as author_name,
           n.created_at
         from crm_notes n
         left join crm_users author on author.id = n.author_user_id
         where n.tenant_id = $1
           and n.account_id = $2
         order by n.created_at desc`,
        [tenantId, accountId],
      );
      const signals = await fetchAccountSignals(client, tenantId, accountId);

      return {
        ...mapAccount(account),
        contacts: contacts.rows.map(mapContact),
        deals: deals.rows.map(mapDeal),
        activities: activities.rows.map(mapActivity),
        notes: notes.rows.map(mapNote),
        signals,
      };
    } finally {
      await client.end();
    }
  }

  async listSignals(context: TenantContext): Promise<CrmSignalDto[]> {
    const client = createDbClient();
    await client.connect();

    try {
      const tenantId = await getTenantId(client, context);
      const result = await client.query<SignalRow>(
        `select
           cas.id,
           gs.id as generated_signal_id,
           gs.organization_id,
           cas.account_id as linked_account_id,
           o.orgnr,
           o.name as organization_name,
           gs.title,
           gs.reason,
           gs.score,
           coalesce(cas.status, 'new') as status,
           gs.observed_at
         from generated_signals gs
         join organizations o on o.id = gs.organization_id
         left join crm_account_signals cas
           on cas.generated_signal_id = gs.id
          and cas.tenant_id = $1
         where gs.status <> 'dismissed'
         order by
           case when cas.id is null then 0 else 1 end,
           gs.score desc,
           gs.observed_at desc
         limit 50`,
        [tenantId],
      );

      return result.rows.map(mapSignal);
    } finally {
      await client.end();
    }
  }

  async createAccountFromSignal(
    context: TenantContext,
    input: CreateAccountFromSignalInput,
  ): Promise<AccountDetail> {
    const client = createDbClient();
    await client.connect();

    try {
      await client.query("begin");

      const tenantId = await getTenantId(client, context);
      const userId = await getDefaultUserId(client, tenantId);
      const signalResult = await client.query<GeneratedSignalRow>(
        `select
           gs.id as signal_id,
           gs.organization_id,
           o.name as organization_name
         from generated_signals gs
         join organizations o on o.id = gs.organization_id
         where gs.id = $1
         limit 1`,
        [input.signalId],
      );

      const signal = signalResult.rows[0];
      if (!signal) {
        throw notFound(`Signal '${input.signalId}' not found.`);
      }

      const accountResult = await client.query<{ id: string }>(
        `insert into crm_accounts (
           tenant_id,
           organization_id,
           owner_user_id,
           display_name,
           source,
           created_from_signal_id
         )
         values ($1, $2, $3, $4, 'signal', $5)
         on conflict (tenant_id, organization_id) do update
           set owner_user_id = excluded.owner_user_id,
               source = 'signal',
               created_from_signal_id = coalesce(
                 crm_accounts.created_from_signal_id,
                 excluded.created_from_signal_id
               )
         returning id`,
        [
          tenantId,
          signal.organization_id,
          userId,
          signal.organization_name,
          signal.signal_id,
        ],
      );
      const accountId = accountResult.rows[0].id;

      await client.query(
        `insert into crm_account_roles (account_id, role, status)
         values ($1, 'prospect', 'active')
         on conflict (account_id, role) do update
           set status = 'active'`,
        [accountId],
      );
      await client.query(
        `insert into crm_account_signals (
           tenant_id,
           account_id,
           generated_signal_id,
           status,
           note
         )
         values ($1, $2, $3, 'acted_on', 'Opprettet account fra signal.')
         on conflict (tenant_id, generated_signal_id) do update
           set account_id = excluded.account_id,
               status = 'acted_on',
               note = excluded.note`,
        [tenantId, accountId, signal.signal_id],
      );
      const activityTitle = `Kvalifiser ${signal.organization_name}`;
      const existingActivity = await client.query<{ id: string }>(
        `select id
         from crm_activities
         where tenant_id = $1
           and account_id = $2
           and title = $3
         limit 1`,
        [tenantId, accountId, activityTitle],
      );

      if (existingActivity.rows[0]) {
        await client.query(
          `update crm_activities
           set owner_user_id = $2,
               activity_type = 'follow_up',
               body = $3,
               status = 'open'
           where id = $1`,
          [
            existingActivity.rows[0].id,
            userId,
            "Oppgave opprettet fra CRM API-handling.",
          ],
        );
      } else {
        await client.query(
          `insert into crm_activities (
             tenant_id,
             account_id,
             owner_user_id,
             activity_type,
             title,
             body,
             status,
             due_at
           )
           values ($1, $2, $3, 'follow_up', $4, $5, 'open', now() + interval '1 day')`,
          [
            tenantId,
            accountId,
            userId,
            activityTitle,
            "Oppgave opprettet fra CRM API-handling.",
          ],
        );
      }
      await client.query(
        `insert into audit_events (
           tenant_id,
           actor_user_id,
           action,
           entity_type,
           entity_id,
           metadata
         )
         values ($1, $2, 'crm.account_created_from_signal', 'crm_account', $3, $4)`,
        [
          tenantId,
          userId,
          accountId,
          {
            generatedSignalId: signal.signal_id,
            organizationId: signal.organization_id,
          },
        ],
      );

      await client.query("commit");

      const account = await this.getAccount(context, accountId);
      if (!account) {
        throw notFound(`Created account '${accountId}' could not be loaded.`);
      }

      return account;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      await client.end();
    }
  }
}
