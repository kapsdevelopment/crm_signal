import pg from "pg";
import { getNumberArg, parseArgs } from "../args.js";
import { createDbClient } from "../db.js";

type TotalRow = {
  organizations: number;
  organizationSnapshots: number;
  changeEvents: number;
  generatedSignals: number;
  pendingChangeEvents: number;
  organizationCreatedEvents: number;
  newOrganizationMatchSignals: number;
};

type CountRow = {
  label: string;
  count: number;
};

type SignalEvidenceRow = {
  evidence: unknown;
};

type SignalEvidenceWithNaceRow = SignalEvidenceRow & {
  nace_code: string | null;
  nace_description: string | null;
};

type FeedbackSignalRow = SignalEvidenceWithNaceRow & {
  rating: "useful" | "maybe" | "noise";
};

type SignalSampleRow = {
  signal_type: string;
  score: number;
  confidence: string;
  title: string;
  reason: string;
  observed_at: Date;
  orgnr: string;
  organization_name: string;
};

type NaceBreakdown = {
  profileName: string;
  total: number;
  rows: CountRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evidenceItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number(value);
}

function percent(part: number, total: number): string {
  if (total === 0) {
    return "0.0%";
  }

  return `${((part / total) * 100).toFixed(1)}%`;
}

function printSection(title: string): void {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
}

function printMetric(label: string, value: number | string): void {
  console.log(`${label.padEnd(34)} ${String(value).padStart(8)}`);
}

function printCountRows(rows: CountRow[], emptyMessage: string): void {
  if (rows.length === 0) {
    console.log(emptyMessage);
    return;
  }

  for (const row of rows) {
    printMetric(row.label, row.count);
  }
}

function aggregateEvidenceMatches(
  rows: SignalEvidenceRow[],
  kind: "icp_match" | "watchlist_match",
  nameKey: "profileName" | "watchlistName",
): CountRow[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const item of evidenceItems(row.evidence)) {
      if (item.kind !== kind) {
        continue;
      }

      const name = textValue(item[nameKey]) ?? "Ukjent";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function naceLabel(row: SignalEvidenceWithNaceRow): string {
  const code = row.nace_code ?? "ukjent";
  const description = row.nace_description ?? "Ukjent næring";
  return `${code} ${description}`;
}

function aggregateNaceBreakdownByIcp(
  rows: SignalEvidenceWithNaceRow[],
): NaceBreakdown[] {
  const countsByProfile = new Map<string, Map<string, number>>();

  for (const row of rows) {
    for (const item of evidenceItems(row.evidence)) {
      if (item.kind !== "icp_match") {
        continue;
      }

      const profileName = textValue(item.profileName) ?? "Ukjent ICP";
      const label = naceLabel(row);
      const counts = countsByProfile.get(profileName) ?? new Map<string, number>();

      counts.set(label, (counts.get(label) ?? 0) + 1);
      countsByProfile.set(profileName, counts);
    }
  }

  return [...countsByProfile.entries()]
    .map(([profileName, counts]) => {
      const rows = [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.label.localeCompare(right.label),
        );

      return {
        profileName,
        total: rows.reduce((sum, row) => sum + row.count, 0),
        rows,
      };
    })
    .sort(
      (left, right) =>
        right.total - left.total || left.profileName.localeCompare(right.profileName),
    );
}

function aggregateFeedbackByRating(rows: FeedbackSignalRow[]): CountRow[] {
  const ratingOrder = new Map([
    ["useful", 0],
    ["maybe", 1],
    ["noise", 2],
  ]);
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.rating, (counts.get(row.rating) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        (ratingOrder.get(left.label) ?? 99) - (ratingOrder.get(right.label) ?? 99),
    );
}

function aggregateNoiseByIcp(rows: FeedbackSignalRow[]): CountRow[] {
  return aggregateEvidenceMatches(
    rows.filter((row) => row.rating === "noise"),
    "icp_match",
    "profileName",
  );
}

function aggregateNoiseByNace(rows: FeedbackSignalRow[]): CountRow[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.rating !== "noise") {
      continue;
    }

    const label = naceLabel(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function printNaceBreakdownByIcp(
  breakdowns: NaceBreakdown[],
  perProfileLimit: number,
): void {
  printSection("NACE Breakdown By ICP");

  if (breakdowns.length === 0) {
    console.log("Ingen ICP/NACE-treff i genererte signaler.");
    return;
  }

  for (const breakdown of breakdowns) {
    console.log("");
    console.log(`${breakdown.profileName} (${breakdown.total})`);

    for (const row of breakdown.rows.slice(0, perProfileLimit)) {
      printMetric(row.label, row.count);
    }

    const remaining = breakdown.rows.length - perProfileLimit;

    if (remaining > 0) {
      console.log(`... ${remaining} flere NACE-koder`);
    }
  }
}

function printSignalSample(title: string, rows: SignalSampleRow[]): void {
  printSection(title);

  if (rows.length === 0) {
    console.log("Ingen signaler funnet.");
    return;
  }

  for (const row of rows) {
    console.log(
      `${row.observed_at.toISOString()}  score=${row.score}  ${row.signal_type}`,
    );
    console.log(`${row.orgnr}  ${row.organization_name}`);
    console.log(row.title);
    console.log(row.reason);
    console.log("");
  }
}

async function fetchTotals(client: pg.Client): Promise<TotalRow> {
  const result = await client.query<Record<keyof TotalRow, unknown>>(
    `select
       (select count(*)::int from organizations) as "organizations",
       (select count(*)::int from organization_snapshots) as "organizationSnapshots",
       (select count(*)::int from organization_change_events) as "changeEvents",
       (select count(*)::int from generated_signals) as "generatedSignals",
       (
         select count(*)::int
         from organization_change_events ce
         where not exists (
           select 1
           from generated_signals gs
           where gs.change_event_id = ce.id
         )
       ) as "pendingChangeEvents",
       (
         select count(*)::int
         from organization_change_events
         where event_type = 'organization_created'
       ) as "organizationCreatedEvents",
       (
         select count(*)::int
         from generated_signals
         where signal_type = 'new_organization_match'
       ) as "newOrganizationMatchSignals"`,
  );
  const row = result.rows[0];

  return {
    organizations: numberValue(row.organizations),
    organizationSnapshots: numberValue(row.organizationSnapshots),
    changeEvents: numberValue(row.changeEvents),
    generatedSignals: numberValue(row.generatedSignals),
    pendingChangeEvents: numberValue(row.pendingChangeEvents),
    organizationCreatedEvents: numberValue(row.organizationCreatedEvents),
    newOrganizationMatchSignals: numberValue(row.newOrganizationMatchSignals),
  };
}

async function fetchCountRows(
  client: pg.Client,
  query: string,
): Promise<CountRow[]> {
  const result = await client.query<CountRow>(query);
  return result.rows.map((row) => ({
    label: row.label,
    count: numberValue(row.count),
  }));
}

async function fetchSignalEvidenceRows(
  client: pg.Client,
): Promise<SignalEvidenceWithNaceRow[]> {
  const result = await client.query<SignalEvidenceWithNaceRow>(
    `select
       gs.evidence,
       o.nace_code,
       o.nace_description
     from generated_signals gs
     join organizations o on o.id = gs.organization_id`,
  );

  return result.rows;
}

async function fetchLatestFeedbackRows(
  client: pg.Client,
): Promise<FeedbackSignalRow[]> {
  const result = await client.query<FeedbackSignalRow>(
    `with latest_feedback as (
       select distinct on (generated_signal_id)
         generated_signal_id,
         rating,
         created_at,
         id
       from signal_feedback
       order by generated_signal_id, created_at desc, id desc
     )
     select
       lf.rating,
       gs.evidence,
       o.nace_code,
       o.nace_description
     from latest_feedback lf
     join generated_signals gs on gs.id = lf.generated_signal_id
     join organizations o on o.id = gs.organization_id`,
  );

  return result.rows;
}

async function fetchSignalSamples(options: {
  client: pg.Client;
  limit: number;
  orderBy: "strongest" | "weakest";
}): Promise<SignalSampleRow[]> {
  const direction = options.orderBy === "strongest" ? "desc" : "asc";
  const result = await options.client.query<SignalSampleRow>(
    `select
       gs.signal_type,
       gs.score,
       gs.confidence,
       gs.title,
       gs.reason,
       gs.observed_at,
       o.orgnr,
       o.name as organization_name
     from generated_signals gs
     join organizations o on o.id = gs.organization_id
     order by gs.score ${direction}, gs.observed_at desc, gs.created_at desc
     limit $1`,
    [options.limit],
  );

  return result.rows;
}

export async function runEvaluateSignals(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const limit = getNumberArg(args, "limit", 20);
  const weakLimit = getNumberArg(args, "weak-limit", Math.min(limit, 10));
  const naceLimit = getNumberArg(args, "nace-limit", 10);

  const client = createDbClient();
  await client.connect();

  try {
    const totals = await fetchTotals(client);
    const eventTypeRows = await fetchCountRows(
      client,
      `select event_type as label, count(*)::int as count
       from organization_change_events
       group by event_type
       order by count desc, event_type`,
    );
    const signalTypeRows = await fetchCountRows(
      client,
      `select signal_type as label, count(*)::int as count
       from generated_signals
       group by signal_type
       order by count desc, signal_type`,
    );
    const scoreBandRows = await fetchCountRows(
      client,
      `select
         case
           when score >= 85 then '85-100'
           when score >= 70 then '70-84'
           when score >= 50 then '50-69'
           else '0-49'
         end as label,
         count(*)::int as count
       from generated_signals
       group by label
       order by max(score) desc`,
    );
    const evidenceRows = await fetchSignalEvidenceRows(client);
    const feedbackRows = await fetchLatestFeedbackRows(client);
    const strongestSignals = await fetchSignalSamples({
      client,
      limit,
      orderBy: "strongest",
    });
    const weakestSignals = await fetchSignalSamples({
      client,
      limit: weakLimit,
      orderBy: "weakest",
    });
    const icpRows = aggregateEvidenceMatches(
      evidenceRows,
      "icp_match",
      "profileName",
    );
    const watchlistRows = aggregateEvidenceMatches(
      evidenceRows,
      "watchlist_match",
      "watchlistName",
    );
    const naceBreakdowns = aggregateNaceBreakdownByIcp(evidenceRows);
    const feedbackRatingRows = aggregateFeedbackByRating(feedbackRows);
    const noiseByIcpRows = aggregateNoiseByIcp(feedbackRows);
    const noiseByNaceRows = aggregateNoiseByNace(feedbackRows);

    console.log("Signal evaluation");
    console.log("=================");

    printSection("Totals");
    printMetric("Organizations", totals.organizations);
    printMetric("Organization snapshots", totals.organizationSnapshots);
    printMetric("Change events", totals.changeEvents);
    printMetric("Generated signals", totals.generatedSignals);
    printMetric("Pending/no-signal events", totals.pendingChangeEvents);
    printMetric("organization_created events", totals.organizationCreatedEvents);
    printMetric("new_organization_match signals", totals.newOrganizationMatchSignals);
    printMetric(
      "Created -> match conversion",
      percent(totals.newOrganizationMatchSignals, totals.organizationCreatedEvents),
    );

    printSection("Change Events By Type");
    printCountRows(eventTypeRows, "Ingen change events funnet.");

    printSection("Signals By Type");
    printCountRows(signalTypeRows, "Ingen signaler funnet.");

    printSection("Score Distribution");
    printCountRows(scoreBandRows, "Ingen scorefordeling ennå.");

    printSection("Feedback Summary");
    printMetric(
      "Reviewed signals",
      `${feedbackRows.length} (${percent(feedbackRows.length, totals.generatedSignals)})`,
    );
    printMetric(
      "Unreviewed signals",
      totals.generatedSignals - feedbackRows.length,
    );
    printCountRows(
      feedbackRatingRows,
      "Ingen feedback ennå. Bruk `signals:review` og `signals:mark`.",
    );

    printSection("ICP Matches");
    printCountRows(icpRows, "Ingen ICP-treff i genererte signaler.");

    printSection("Watchlist Matches");
    printCountRows(watchlistRows, "Ingen watchlist-treff i genererte signaler.");

    printNaceBreakdownByIcp(naceBreakdowns, naceLimit);

    printSection("Noise By ICP");
    printCountRows(noiseByIcpRows, "Ingen noise-feedback per ICP ennå.");

    printSection("Noise By NACE");
    printCountRows(noiseByNaceRows, "Ingen noise-feedback per NACE ennå.");

    printSignalSample(`Strongest Signals (top ${limit})`, strongestSignals);
    printSignalSample(`Weakest Signals (bottom ${weakLimit})`, weakestSignals);
  } finally {
    await client.end();
  }
}
