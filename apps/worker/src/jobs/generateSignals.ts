import pg from "pg";
import { getNumberArg, parseArgs } from "../args.js";
import { createDbClient } from "../db.js";
import { buildSignalForChangeEvent } from "../signals/rules.js";
import type {
  ChangeEventForSignal,
  GeneratedSignalDraft,
  IcpProfileForScoring,
  SignalScoringContext,
  WatchlistForScoring,
  WatchlistItemForScoring,
} from "../signals/rules.js";

type SignalGenerationStats = {
  scannedChangeEvents: number;
  eligibleChangeEvents: number;
  signalsCreated: number;
  skippedExistingSignals: number;
  skippedNoSignal: number;
  icpMatches: number;
  watchlistMatches: number;
};

type ExistingSignalRow = {
  id: string;
};

async function fetchPendingChangeEvents(
  client: pg.Client,
  limit: number,
): Promise<ChangeEventForSignal[]> {
  const result = await client.query<ChangeEventForSignal>(
    `select
       ce.id,
       ce.organization_id,
       o.orgnr,
       o.name as organization_name,
       o.municipality_number,
       o.municipality_name,
       o.nace_code,
       o.nace_description,
       o.organization_form_code,
       o.is_active,
       o.is_bankrupt,
       o.is_under_liquidation,
       o.is_deleted,
       ce.event_type,
       ce.field_path,
       ce.old_value,
       ce.new_value,
       ce.evidence,
       ce.source,
       ce.detected_at
     from organization_change_events ce
     join organizations o on o.id = ce.organization_id
     where not exists (
       select 1
       from generated_signals gs
       where gs.change_event_id = ce.id
     )
     order by ce.detected_at asc, ce.id asc
     limit $1`,
    [limit],
  );

  return result.rows;
}

async function fetchScoringContext(
  client: pg.Client,
): Promise<SignalScoringContext> {
  const icpProfiles = await client.query<IcpProfileForScoring>(
    `select id, name, criteria
     from icp_profiles
     where is_active = true
     order by name`,
  );
  const watchlists = await client.query<WatchlistForScoring>(
    `select id, name, criteria
     from watchlists
     where is_active = true
     order by name`,
  );
  const watchlistItems = await client.query<WatchlistItemForScoring>(
    `select watchlist_id, organization_id, orgnr
     from watchlist_items`,
  );

  return {
    icpProfiles: icpProfiles.rows,
    watchlists: watchlists.rows,
    watchlistItems: watchlistItems.rows,
  };
}

async function insertSignal(options: {
  client: pg.Client;
  event: ChangeEventForSignal;
  signal: GeneratedSignalDraft;
}): Promise<boolean> {
  const result = await options.client.query<ExistingSignalRow>(
    `insert into generated_signals (
       organization_id,
       change_event_id,
       signal_type,
       score,
       confidence,
       status,
       title,
       reason,
       evidence,
       suggested_action,
       source,
       observed_at
     )
     values ($1, $2, $3, $4, $5, 'new', $6, $7, $8, $9, $10, $11)
     on conflict (change_event_id, signal_type)
       where change_event_id is not null
       do nothing
     returning id`,
    [
      options.event.organization_id,
      options.event.id,
      options.signal.signalType,
      options.signal.score,
      options.signal.confidence,
      options.signal.title,
      options.signal.reason,
      JSON.stringify(options.signal.evidence),
      options.signal.suggestedAction,
      options.event.source,
      options.event.detected_at,
    ],
  );

  return result.rowCount === 1;
}

export async function runGenerateSignals(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const limit = getNumberArg(args, "limit", 100);

  const stats: SignalGenerationStats = {
    scannedChangeEvents: 0,
    eligibleChangeEvents: 0,
    signalsCreated: 0,
    skippedExistingSignals: 0,
    skippedNoSignal: 0,
    icpMatches: 0,
    watchlistMatches: 0,
  };

  const client = createDbClient();
  await client.connect();

  try {
    const changeEvents = await fetchPendingChangeEvents(client, limit);
    const scoringContext = await fetchScoringContext(client);
    stats.scannedChangeEvents = changeEvents.length;

    for (const event of changeEvents) {
      const signal = buildSignalForChangeEvent(event, scoringContext);

      if (!signal) {
        stats.skippedNoSignal += 1;
        continue;
      }

      if (signal.evidence.some((item) => item.kind === "icp_match")) {
        stats.icpMatches += 1;
      }

      if (signal.evidence.some((item) => item.kind === "watchlist_match")) {
        stats.watchlistMatches += 1;
      }

      stats.eligibleChangeEvents += 1;
      const created = await insertSignal({ client, event, signal });

      if (created) {
        stats.signalsCreated += 1;
      } else {
        stats.skippedExistingSignals += 1;
      }
    }

    console.log("Signal generation completed");
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await client.end();
  }
}
