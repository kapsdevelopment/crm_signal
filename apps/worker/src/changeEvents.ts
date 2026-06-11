import pg from "pg";
import type { ChangeEventDraft } from "./diff/organizationDiff.js";

export async function insertChangeEvents(options: {
  client: pg.Client;
  organizationId: string;
  ingestRunId: string | null;
  fromSnapshotId: string | null;
  toSnapshotId: string;
  source: string;
  changes: ChangeEventDraft[];
}): Promise<number> {
  for (const change of options.changes) {
    await options.client.query(
      `insert into organization_change_events (
         organization_id,
         ingest_run_id,
         from_snapshot_id,
         to_snapshot_id,
         source,
         event_type,
         field_path,
         old_value,
         new_value,
         evidence
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        options.organizationId,
        options.ingestRunId,
        options.fromSnapshotId,
        options.toSnapshotId,
        options.source,
        change.eventType,
        change.fieldPath,
        change.oldValue,
        change.newValue,
        change.evidence,
      ],
    );
  }

  return options.changes.length;
}
