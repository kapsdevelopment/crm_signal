import pg from "pg";
import { getNumberArg, parseArgs } from "../args.js";
import { createDbClient } from "../db.js";

type SignalPreviewRow = {
  id: string;
  signal_type: string;
  score: number;
  confidence: string;
  status: string;
  title: string;
  reason: string;
  suggested_action: string | null;
  source: string;
  observed_at: Date;
  orgnr: string;
  organization_name: string;
};

function printSignal(row: SignalPreviewRow): void {
  console.log(`${row.observed_at.toISOString()}  score=${row.score}  ${row.signal_type}`);
  console.log(`${row.orgnr}  ${row.organization_name}`);
  console.log(row.title);
  console.log(row.reason);

  if (row.suggested_action) {
    console.log(`Action: ${row.suggested_action}`);
  }

  console.log("");
}

export async function runPreviewSignals(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const limit = getNumberArg(args, "limit", 20);

  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<SignalPreviewRow>(
      `select
         gs.id,
         gs.signal_type,
         gs.score,
         gs.confidence,
         gs.status,
         gs.title,
         gs.reason,
         gs.suggested_action,
         gs.source,
         gs.observed_at,
         o.orgnr,
         o.name as organization_name
       from generated_signals gs
       join organizations o on o.id = gs.organization_id
       order by gs.observed_at desc, gs.created_at desc
       limit $1`,
      [limit],
    );

    if (result.rows.length === 0) {
      console.log("No generated signals yet. Run `pnpm worker signals:generate` first.");
      return;
    }

    for (const row of result.rows) {
      printSignal(row);
    }
  } finally {
    await client.end();
  }
}
