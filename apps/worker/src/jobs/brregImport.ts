import pg from "pg";
import { getNumberArg, getStringArg, parseArgs } from "../args.js";
import { fetchBrregEntitiesPage } from "../brreg/client.js";
import type { BrregEntity } from "../brreg/client.js";
import { normalizeBrregEntity } from "../brreg/normalize.js";
import type { NormalizedOrganization } from "../brreg/normalize.js";
import { insertChangeEvents } from "../changeEvents.js";
import { createDbClient } from "../db.js";
import { payloadHash } from "../diff/canonical.js";
import { diffOrganizationSnapshots } from "../diff/organizationDiff.js";

type ImportStats = {
  processed: number;
  insertedOrganizations: number;
  changedOrganizations: number;
  unchangedOrganizations: number;
  snapshotsCreated: number;
  changeEventsCreated: number;
  pagesFetched: number;
  totalAvailable: number | null;
};

type OrganizationRow = {
  id: string;
  current_snapshot_id: string | null;
  current_snapshot_hash: string | null;
};

type SnapshotRow = {
  id: string;
};

type SnapshotPayloadRow = {
  canonical_payload: Record<string, unknown>;
};

export const osloScope = {
  type: "municipality",
  municipalityNumber: "0301",
  municipalityName: "OSLO",
  addressField: "forretningsadresse.kommunenummer",
};

async function createIngestRun(
  client: pg.Client,
  scope: Record<string, unknown>,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into ingest_runs (source, scope, status)
     values ($1, $2, 'running')
     returning id`,
    ["brreg", scope],
  );

  return result.rows[0].id;
}

async function finishIngestRun(
  client: pg.Client,
  ingestRunId: string,
  status: "succeeded" | "failed",
  stats: ImportStats,
  errorMessage?: string,
): Promise<void> {
  await client.query(
    `update ingest_runs
     set status = $2,
         finished_at = now(),
         stats = $3,
         error_message = $4
     where id = $1`,
    [ingestRunId, status, stats, errorMessage ?? null],
  );
}

async function getOrCreateOrganization(
  client: pg.Client,
  organization: NormalizedOrganization,
): Promise<{ row: OrganizationRow; inserted: boolean }> {
  const insertResult = await client.query<OrganizationRow>(
    `insert into organizations (
       orgnr,
       name,
       organization_form_code,
       organization_form_description,
       is_active,
       is_bankrupt,
       is_under_liquidation,
       is_deleted,
       nace_code,
       nace_description,
       municipality_number,
       municipality_name,
       county_number,
       county_name,
       business_address,
       postal_address,
       registered_at,
       source,
       source_updated_at
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, 'brreg', $18
     )
     on conflict (orgnr) do nothing
     returning id, current_snapshot_id, current_snapshot_hash`,
    [
      organization.orgnr,
      organization.name,
      organization.organizationFormCode,
      organization.organizationFormDescription,
      organization.isActive,
      organization.isBankrupt,
      organization.isUnderLiquidation,
      organization.isDeleted,
      organization.naceCode,
      organization.naceDescription,
      organization.municipalityNumber,
      organization.municipalityName,
      organization.countyNumber,
      organization.countyName,
      organization.businessAddress,
      organization.postalAddress,
      organization.registeredAt,
      organization.sourceUpdatedAt,
    ],
  );

  const inserted = insertResult.rowCount === 1;

  if (inserted) {
    return { row: insertResult.rows[0], inserted };
  }

  const selectResult = await client.query<OrganizationRow>(
    `select id, current_snapshot_id, current_snapshot_hash
     from organizations
     where orgnr = $1`,
    [organization.orgnr],
  );

  const row = selectResult.rows[0];

  if (!row) {
    throw new Error(`Could not find organization after upsert: ${organization.orgnr}`);
  }

  return { row, inserted };
}

async function getSnapshotPayload(
  client: pg.Client,
  snapshotId: string,
): Promise<Record<string, unknown>> {
  const result = await client.query<SnapshotPayloadRow>(
    `select canonical_payload
     from organization_snapshots
     where id = $1`,
    [snapshotId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error(`Could not find snapshot payload: ${snapshotId}`);
  }

  return row.canonical_payload;
}

async function getOrCreateSnapshot(options: {
  client: pg.Client;
  organizationId: string;
  ingestRunId: string;
  organization: NormalizedOrganization;
  hash: string;
  rawPayload: BrregEntity;
}): Promise<{ snapshotId: string; created: boolean }> {
  const insertResult = await options.client.query<SnapshotRow>(
    `insert into organization_snapshots (
       organization_id,
       ingest_run_id,
       source,
       source_record_id,
       payload_hash,
       canonical_payload,
       raw_payload,
       source_updated_at
     )
     values ($1, $2, 'brreg', $3, $4, $5, $6, $7)
     on conflict (organization_id, source, payload_hash) do nothing
     returning id`,
    [
      options.organizationId,
      options.ingestRunId,
      options.organization.orgnr,
      options.hash,
      options.organization.canonicalPayload,
      options.rawPayload,
      options.organization.sourceUpdatedAt,
    ],
  );

  if (insertResult.rowCount === 1) {
    return { snapshotId: insertResult.rows[0].id, created: true };
  }

  const selectResult = await options.client.query<SnapshotRow>(
    `select id
     from organization_snapshots
     where organization_id = $1
       and source = 'brreg'
       and payload_hash = $2`,
    [options.organizationId, options.hash],
  );

  const row = selectResult.rows[0];

  if (!row) {
    throw new Error(
      `Could not find snapshot after insert conflict: ${options.organization.orgnr}`,
    );
  }

  return { snapshotId: row.id, created: false };
}

async function updateOrganizationCurrentSnapshot(options: {
  client: pg.Client;
  organizationId: string;
  organization: NormalizedOrganization;
  snapshotId: string;
  hash: string;
}): Promise<void> {
  await options.client.query(
    `update organizations
     set name = $2,
         organization_form_code = $3,
         organization_form_description = $4,
         is_active = $5,
         is_bankrupt = $6,
         is_under_liquidation = $7,
         is_deleted = $8,
         nace_code = $9,
         nace_description = $10,
         municipality_number = $11,
         municipality_name = $12,
         county_number = $13,
         county_name = $14,
         business_address = $15,
         postal_address = $16,
         registered_at = $17,
         source_updated_at = $18,
         current_snapshot_id = $19,
         current_snapshot_hash = $20
     where id = $1`,
    [
      options.organizationId,
      options.organization.name,
      options.organization.organizationFormCode,
      options.organization.organizationFormDescription,
      options.organization.isActive,
      options.organization.isBankrupt,
      options.organization.isUnderLiquidation,
      options.organization.isDeleted,
      options.organization.naceCode,
      options.organization.naceDescription,
      options.organization.municipalityNumber,
      options.organization.municipalityName,
      options.organization.countyNumber,
      options.organization.countyName,
      options.organization.businessAddress,
      options.organization.postalAddress,
      options.organization.registeredAt,
      options.organization.sourceUpdatedAt,
      options.snapshotId,
      options.hash,
    ],
  );
}

async function importEntity(options: {
  client: pg.Client;
  ingestRunId: string;
  entity: BrregEntity;
  stats: ImportStats;
}): Promise<void> {
  const organization = normalizeBrregEntity(options.entity);
  const hash = payloadHash(organization.canonicalPayload);

  await options.client.query("begin");

  try {
    const { row, inserted } = await getOrCreateOrganization(
      options.client,
      organization,
    );

    if (inserted) {
      options.stats.insertedOrganizations += 1;
    }

    if (row.current_snapshot_hash === hash) {
      options.stats.unchangedOrganizations += 1;
      await options.client.query("commit");
      return;
    }

    if (!inserted && row.current_snapshot_hash !== null) {
      options.stats.changedOrganizations += 1;
    }

    const snapshot = await getOrCreateSnapshot({
      client: options.client,
      organizationId: row.id,
      ingestRunId: options.ingestRunId,
      organization,
      hash,
      rawPayload: options.entity,
    });

    if (snapshot.created) {
      options.stats.snapshotsCreated += 1;
    }

    if (inserted) {
      options.stats.changeEventsCreated += await insertChangeEvents({
        client: options.client,
        organizationId: row.id,
        ingestRunId: options.ingestRunId,
        fromSnapshotId: null,
        toSnapshotId: snapshot.snapshotId,
        source: "brreg",
        changes: [
          {
            eventType: "organization_created",
            fieldPath: null,
            oldValue: null,
            newValue: organization.canonicalPayload,
            evidence: {
              strategy: "first_seen_import",
              source: "brreg",
              scope: osloScope,
              sourceRecordId: organization.orgnr,
            },
          },
        ],
      });
    } else if (row.current_snapshot_id) {
      const previousPayload = await getSnapshotPayload(
        options.client,
        row.current_snapshot_id,
      );
      const changes = diffOrganizationSnapshots(
        previousPayload,
        organization.canonicalPayload,
      );

      options.stats.changeEventsCreated += await insertChangeEvents({
        client: options.client,
        organizationId: row.id,
        ingestRunId: options.ingestRunId,
        fromSnapshotId: row.current_snapshot_id,
        toSnapshotId: snapshot.snapshotId,
        source: "brreg",
        changes,
      });
    }

    await updateOrganizationCurrentSnapshot({
      client: options.client,
      organizationId: row.id,
      organization,
      snapshotId: snapshot.snapshotId,
      hash,
    });

    await options.client.query("commit");
  } catch (error) {
    await options.client.query("rollback");
    throw error;
  }
}

export async function runBrregImport(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const scopeName = getStringArg(args, "scope", "oslo").toLowerCase();
  const limit = getNumberArg(args, "limit", 100);
  const pageSize = Math.min(getNumberArg(args, "page-size", 100), 100);

  if (scopeName !== "oslo") {
    throw new Error("Only --scope oslo is supported in local dev for now.");
  }

  const stats: ImportStats = {
    processed: 0,
    insertedOrganizations: 0,
    changedOrganizations: 0,
    unchangedOrganizations: 0,
    snapshotsCreated: 0,
    changeEventsCreated: 0,
    pagesFetched: 0,
    totalAvailable: null,
  };

  const client = createDbClient();
  await client.connect();

  const ingestRunId = await createIngestRun(client, {
    ...osloScope,
    limit,
    pageSize,
  });

  console.log(
    `Started Brreg import ${ingestRunId} for Oslo, limit=${limit}, pageSize=${pageSize}`,
  );

  try {
    for (let page = 0; stats.processed < limit; page += 1) {
      const remaining = limit - stats.processed;
      const size = Math.min(pageSize, remaining);
      const response = await fetchBrregEntitiesPage({
        municipalityNumber: osloScope.municipalityNumber,
        page,
        size,
      });
      const entities = response._embedded?.enheter ?? [];

      stats.pagesFetched += 1;
      stats.totalAvailable = response.page?.totalElements ?? stats.totalAvailable;

      if (entities.length === 0) {
        break;
      }

      for (const entity of entities) {
        if (stats.processed >= limit) {
          break;
        }

        await importEntity({
          client,
          ingestRunId,
          entity,
          stats,
        });
        stats.processed += 1;
      }

      console.log(
        `Imported ${stats.processed}/${limit} entities from ${stats.pagesFetched} page(s)`,
      );
    }

    await finishIngestRun(client, ingestRunId, "succeeded", stats);
    console.log("Brreg import completed");
    console.log(JSON.stringify(stats, null, 2));
  } catch (error) {
    await finishIngestRun(
      client,
      ingestRunId,
      "failed",
      stats,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    await client.end();
  }
}
