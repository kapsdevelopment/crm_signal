import { parseArgs } from "../args.js";
import { createDbClient } from "../db.js";

const domainTables = [
  "signal_feedback",
  "crm_account_signals",
  "crm_notes",
  "crm_activities",
  "crm_deals",
  "crm_pipeline_stages",
  "crm_pipelines",
  "crm_contacts",
  "crm_account_roles",
  "crm_accounts",
  "tenant_memberships",
  "crm_users",
  "tenants",
  "generated_signals",
  "organization_change_events",
  "watchlist_items",
  "watchlists",
  "icp_profiles",
  "organization_snapshots",
  "organizations",
  "ingest_runs",
  "audit_events",
];

export async function runResetData(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);

  if (args.yes !== true) {
    throw new Error(
      "Refusing to reset local data without --yes. This deletes domain data but keeps schema_migrations.",
    );
  }

  const client = createDbClient();
  await client.connect();

  try {
    await client.query("begin");
    await client.query(
      `truncate table ${domainTables.join(", ")}
       restart identity
       cascade`,
    );
    await client.query("commit");
    console.log("Local domain data reset completed");
    console.log(`Truncated tables: ${domainTables.join(", ")}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
