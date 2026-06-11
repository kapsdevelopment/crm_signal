import pg from "pg";
import { getStringArg, parseArgs } from "../args.js";
import { insertChangeEvents } from "../changeEvents.js";
import { createDbClient } from "../db.js";
import { payloadHash } from "../diff/canonical.js";
import { diffOrganizationSnapshots } from "../diff/organizationDiff.js";

type OrganizationRow = {
  id: string;
  orgnr: string;
  name: string;
  current_snapshot_id: string;
};

type SnapshotRow = {
  canonical_payload: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
};

type SnapshotIdRow = {
  id: string;
};

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

async function createSimulationRun(
  client: pg.Client,
  scope: Record<string, unknown>,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into ingest_runs (source, scope, status)
     values ('dev-simulation', $1, 'running')
     returning id`,
    [scope],
  );

  return result.rows[0].id;
}

async function finishSimulationRun(
  client: pg.Client,
  ingestRunId: string,
  status: "succeeded" | "failed",
  stats: Record<string, unknown>,
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

async function findOrganization(
  client: pg.Client,
  orgnr: string | null,
): Promise<OrganizationRow> {
  const result = await client.query<OrganizationRow>(
    orgnr
      ? `select id, orgnr, name, current_snapshot_id
         from organizations
         where orgnr = $1
           and current_snapshot_id is not null`
      : `select id, orgnr, name, current_snapshot_id
         from organizations
         where current_snapshot_id is not null
         order by name
         limit 1`,
    orgnr ? [orgnr] : [],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error(
      orgnr
        ? `No imported organization found for orgnr ${orgnr}`
        : "No imported organizations found. Run brreg:import first.",
    );
  }

  return row;
}

async function getCurrentSnapshot(
  client: pg.Client,
  snapshotId: string,
): Promise<SnapshotRow> {
  const result = await client.query<SnapshotRow>(
    `select canonical_payload, raw_payload
     from organization_snapshots
     where id = $1`,
    [snapshotId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error(`Current snapshot not found: ${snapshotId}`);
  }

  return row;
}

function simulateBusinessAddressChange(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = cloneRecord(payload);
  const addresses = asRecord(next.addresses);
  const businessAddress = asRecord(addresses.business);
  const existingAddress = Array.isArray(businessAddress.adresse)
    ? businessAddress.adresse
    : [];

  addresses.business = {
    ...businessAddress,
    adresse: [
      ...existingAddress,
      `SIMULERT ADRESSEENDRING ${new Date().toISOString()}`,
    ],
    kommune: "OSLO",
    kommunenummer: "0301",
  };
  next.addresses = addresses;

  return next;
}

async function insertSimulationSnapshot(options: {
  client: pg.Client;
  organizationId: string;
  ingestRunId: string;
  orgnr: string;
  payload: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  hash: string;
}): Promise<string> {
  const result = await options.client.query<SnapshotIdRow>(
    `insert into organization_snapshots (
       organization_id,
       ingest_run_id,
       source,
       source_record_id,
       payload_hash,
       canonical_payload,
       raw_payload
     )
     values ($1, $2, 'dev-simulation', $3, $4, $5, $6)
     returning id`,
    [
      options.organizationId,
      options.ingestRunId,
      options.orgnr,
      options.hash,
      options.payload,
      {
        simulation: true,
        simulatedAt: new Date().toISOString(),
        basedOnRawPayload: options.rawPayload,
      },
    ],
  );

  return result.rows[0].id;
}

async function updateOrganizationAfterSimulation(options: {
  client: pg.Client;
  organizationId: string;
  snapshotId: string;
  hash: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const addresses = asRecord(options.payload.addresses);
  const businessAddress = asRecord(addresses.business);

  await options.client.query(
    `update organizations
     set business_address = $2,
         current_snapshot_id = $3,
         current_snapshot_hash = $4
     where id = $1`,
    [
      options.organizationId,
      businessAddress,
      options.snapshotId,
      options.hash,
    ],
  );
}

export async function runSimulateChange(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const type = getStringArg(args, "type", "business-address");
  const orgnr = getStringArg(args, "orgnr", "");

  if (type !== "business-address") {
    throw new Error("Only --type business-address is supported for now.");
  }

  const client = createDbClient();
  await client.connect();

  const organization = await findOrganization(client, orgnr || null);
  const ingestRunId = await createSimulationRun(client, {
    type: "dev_simulated_change",
    simulationType: type,
    orgnr: organization.orgnr,
  });

  const stats = {
    organizationId: organization.id,
    orgnr: organization.orgnr,
    simulationType: type,
    changeEventsCreated: 0,
  };

  console.log(
    `Simulating ${type} change for ${organization.orgnr} ${organization.name}`,
  );

  try {
    const currentSnapshot = await getCurrentSnapshot(
      client,
      organization.current_snapshot_id,
    );
    const nextPayload = simulateBusinessAddressChange(
      currentSnapshot.canonical_payload,
    );
    const hash = payloadHash(nextPayload);
    const changes = diffOrganizationSnapshots(
      currentSnapshot.canonical_payload,
      nextPayload,
    );

    await client.query("begin");

    try {
      const nextSnapshotId = await insertSimulationSnapshot({
        client,
        organizationId: organization.id,
        ingestRunId,
        orgnr: organization.orgnr,
        payload: nextPayload,
        rawPayload: currentSnapshot.raw_payload,
        hash,
      });

      stats.changeEventsCreated = await insertChangeEvents({
        client,
        organizationId: organization.id,
        ingestRunId,
        fromSnapshotId: organization.current_snapshot_id,
        toSnapshotId: nextSnapshotId,
        source: "dev-simulation",
        changes,
      });

      await updateOrganizationAfterSimulation({
        client,
        organizationId: organization.id,
        snapshotId: nextSnapshotId,
        hash,
        payload: nextPayload,
      });

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    await finishSimulationRun(client, ingestRunId, "succeeded", stats);
    console.log("Simulated change completed");
    console.log(JSON.stringify(stats, null, 2));
  } catch (error) {
    await finishSimulationRun(
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
