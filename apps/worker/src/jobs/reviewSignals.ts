import pg from "pg";
import { getNumberArg, parseArgs } from "../args.js";
import { createDbClient } from "../db.js";

type ReviewSignalRow = {
  id: string;
  signal_type: string;
  score: number;
  confidence: string;
  title: string;
  reason: string;
  evidence: unknown;
  suggested_action: string | null;
  observed_at: Date;
  orgnr: string;
  organization_name: string;
  nace_code: string | null;
  nace_description: string | null;
  feedback_rating: string | null;
  feedback_reason: string | null;
  feedback_created_at: Date | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evidenceItems(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function formatEvidenceSummary(
  row: ReviewSignalRow,
  kind: "icp_match" | "watchlist_match",
): string[] {
  return evidenceItems(row.evidence)
    .filter((item) => item.kind === kind)
    .map((item) => {
      const name =
        kind === "icp_match"
          ? textValue(item.profileName) ?? textValue(item.profile_name) ?? "Ukjent ICP"
          : textValue(item.watchlistName) ??
            textValue(item.watchlist_name) ??
            "Ukjent watchlist";
      const reasons = textArray(item.reasons);

      return reasons.length > 0 ? `${name} (${reasons.join(", ")})` : name;
    });
}

function printSignal(row: ReviewSignalRow): void {
  console.log(`${row.id}`);
  console.log(
    `${row.observed_at.toISOString()}  score=${row.score}  ${row.signal_type}  ${row.confidence}`,
  );
  console.log(`${row.orgnr}  ${row.organization_name}`);

  if (row.nace_code || row.nace_description) {
    console.log(`NACE: ${row.nace_code ?? "ukjent"} ${row.nace_description ?? ""}`);
  }

  const icpMatches = formatEvidenceSummary(row, "icp_match");
  if (icpMatches.length > 0) {
    console.log(`Matched ICP: ${icpMatches.join(" | ")}`);
  }

  const watchlistMatches = formatEvidenceSummary(row, "watchlist_match");
  if (watchlistMatches.length > 0) {
    console.log(`Matched watchlist: ${watchlistMatches.join(" | ")}`);
  }

  console.log(row.title);
  console.log(row.reason);

  if (row.suggested_action) {
    console.log(`Action: ${row.suggested_action}`);
  }

  if (row.feedback_rating) {
    console.log(
      `Feedback: ${row.feedback_rating} ${
        row.feedback_created_at?.toISOString() ?? ""
      }`,
    );

    if (row.feedback_reason) {
      console.log(`Feedback reason: ${row.feedback_reason}`);
    }
  }

  console.log("");
}

export async function runReviewSignals(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const limit = getNumberArg(args, "limit", 20);
  const includeReviewed = args.all === true;

  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<ReviewSignalRow>(
      `with latest_feedback as (
         select distinct on (generated_signal_id)
           generated_signal_id,
           rating,
           reason,
           created_at
         from signal_feedback
         order by generated_signal_id, created_at desc, id desc
       )
       select
         gs.id,
         gs.signal_type,
         gs.score,
         gs.confidence,
         gs.title,
         gs.reason,
         gs.evidence,
         gs.suggested_action,
         gs.observed_at,
         o.orgnr,
         o.name as organization_name,
         o.nace_code,
         o.nace_description,
         lf.rating as feedback_rating,
         lf.reason as feedback_reason,
         lf.created_at as feedback_created_at
       from generated_signals gs
       join organizations o on o.id = gs.organization_id
       left join latest_feedback lf on lf.generated_signal_id = gs.id
       where ($2::boolean = true or lf.generated_signal_id is null)
       order by
         case when lf.generated_signal_id is null then 0 else 1 end,
         gs.score desc,
         gs.observed_at desc,
         gs.created_at desc
       limit $1`,
      [limit, includeReviewed],
    );

    if (result.rows.length === 0) {
      console.log(
        includeReviewed
          ? "No generated signals found."
          : "No unreviewed signals found. Use `--all` to include reviewed signals.",
      );
      return;
    }

    console.log(
      includeReviewed
        ? `Showing ${result.rows.length} signals`
        : `Showing ${result.rows.length} unreviewed signals`,
    );
    console.log("");

    for (const row of result.rows) {
      printSignal(row);
    }
  } finally {
    await client.end();
  }
}
