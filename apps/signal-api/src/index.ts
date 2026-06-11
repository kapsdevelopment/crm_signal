import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
import { createDbClient } from "./db.js";

type IcpCriteria = {
  municipalityNumbers: string[];
  organizationFormCodes: string[];
  nacePrefixes: string[];
  requireActive: boolean;
  scoreBoost: number;
};

type IcpProfile = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  hitCount: number;
  conversionRate: number;
  criteria: IcpCriteria;
};

type IcpProfileRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  criteria: unknown;
  hit_count: number;
  conversion_rate: number;
};

type WatchlistItem = {
  orgnr: string;
  name: string;
  note: string;
};

type Watchlist = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  scoreBoost: number;
  hitCount: number;
  items: WatchlistItem[];
};

type WatchlistRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  criteria: unknown;
  hit_count: number;
};

type WatchlistItemRow = {
  watchlist_id: string;
  orgnr: string | null;
  display_name: string | null;
  note: string | null;
  organization_name: string | null;
};

type EvidenceItem = {
  kind: "change_event" | "organization" | "icp_match" | "watchlist_match";
  label: string;
  detail: string;
  reasons?: string[];
};

type Signal = {
  id: string;
  signalType: string;
  score: number;
  confidence: "low" | "medium" | "high";
  status: "new" | "seen" | "acted_on" | "dismissed";
  title: string;
  reason: string;
  suggestedAction: string;
  observedAt: string;
  orgnr: string;
  organizationName: string;
  organizationFormCode: string;
  organizationFormDescription: string;
  isActive: boolean;
  isBankrupt: boolean;
  isUnderLiquidation: boolean;
  municipalityName: string;
  naceCode: string;
  naceDescription: string;
  registeredAt: string | null;
  evidence: EvidenceItem[];
};

type SignalRow = {
  id: string;
  signal_type: string;
  score: number;
  confidence: "low" | "medium" | "high";
  status: "new" | "seen" | "acted_on" | "dismissed";
  title: string;
  reason: string;
  suggested_action: string | null;
  observed_at: Date;
  orgnr: string;
  organization_name: string;
  organization_form_code: string | null;
  organization_form_description: string | null;
  is_active: boolean;
  is_bankrupt: boolean;
  is_under_liquidation: boolean;
  municipality_name: string | null;
  nace_code: string | null;
  nace_description: string | null;
  registered_at: Date | null;
  evidence: unknown;
};

type CountRow = {
  label: string;
  count: number;
};

type NaceBreakdown = {
  profileName: string;
  total: number;
  rows: CountRow[];
};

type DashboardSummary = {
  organizations: number;
  snapshots: number;
  changeEvents: number;
  generatedSignals: number;
  createdEvents: number;
  newOrganizationMatches: number;
  conversionRate: number;
  scoreDistribution: CountRow[];
  signalTypeRows: CountRow[];
  naceBreakdowns: NaceBreakdown[];
};

const host = process.env.HOST ?? "127.0.0.1";
const preferredPort = Number(process.env.PORT ?? 5175);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function evidenceRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "tom verdi";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function normalizeEvidence(value: unknown): EvidenceItem[] {
  return evidenceRecords(value).flatMap((item): EvidenceItem[] => {
    const kind = textValue(item.kind);

    if (kind === "change_event") {
      const eventType = textValue(item.eventType) ?? "change_event";
      const fieldPath = textValue(item.fieldPath);
      const oldValue = item.oldValue;
      const newValue = item.newValue;
      const detail = fieldPath
        ? `${fieldPath}: ${formatEvidenceValue(oldValue)} -> ${formatEvidenceValue(newValue)}`
        : textValue(item.source) ?? "Endring oppdaget";

      return [{ kind, label: eventType, detail }];
    }

    if (kind === "organization") {
      return [
        {
          kind,
          label: textValue(item.name) ?? "Organisasjon",
          detail: textValue(item.orgnr) ?? "",
        },
      ];
    }

    if (kind === "icp_match") {
      const reasons = stringArray(item.reasons);

      return [
        {
          kind,
          label: textValue(item.profileName) ?? textValue(item.profile_name) ?? "Ukjent ICP",
          detail: reasons.join(", ") || "ICP-treff",
          reasons,
        },
      ];
    }

    if (kind === "watchlist_match") {
      const reasons = stringArray(item.reasons);
      const matchType = textValue(item.matchType);

      return [
        {
          kind,
          label:
            textValue(item.watchlistName) ??
            textValue(item.watchlist_name) ??
            "Ukjent watchlist",
          detail: reasons.join(", ") || matchType || "Watchlist-treff",
          reasons,
        },
      ];
    }

    return [];
  });
}

function signalTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    new_organization_match: "Nytt funn",
    organization_status_changed: "Statusendring",
    organization_address_changed: "Adresse/geografi",
    industry_code_changed: "Næringskode",
  };

  return labels[value] ?? value;
}

function normalizeCriteria(value: unknown): IcpCriteria {
  const criteria = isRecord(value) ? value : {};
  const scoreBoost = Math.max(0, Math.min(35, numberValue(criteria.scoreBoost, 10)));

  return {
    municipalityNumbers: stringArray(criteria.municipalityNumbers),
    organizationFormCodes: stringArray(criteria.organizationFormCodes),
    nacePrefixes: stringArray(criteria.nacePrefixes),
    requireActive: booleanValue(criteria.requireActive, true),
    scoreBoost,
  };
}

function signalFromRow(row: SignalRow): Signal {
  return {
    id: row.id,
    signalType: row.signal_type,
    score: Number(row.score),
    confidence: row.confidence,
    status: row.status,
    title: row.title,
    reason: row.reason,
    suggestedAction: row.suggested_action ?? "",
    observedAt: row.observed_at.toISOString(),
    orgnr: row.orgnr,
    organizationName: row.organization_name,
    organizationFormCode: row.organization_form_code ?? "",
    organizationFormDescription: row.organization_form_description ?? "",
    isActive: row.is_active,
    isBankrupt: row.is_bankrupt,
    isUnderLiquidation: row.is_under_liquidation,
    municipalityName: row.municipality_name ?? "",
    naceCode: row.nace_code ?? "ukjent",
    naceDescription: row.nace_description ?? "",
    registeredAt: row.registered_at?.toISOString().slice(0, 10) ?? null,
    evidence: normalizeEvidence(row.evidence),
  };
}

function profileFromRow(row: IcpProfileRow): IcpProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    active: row.is_active,
    hitCount: Number(row.hit_count),
    conversionRate: Number(row.conversion_rate),
    criteria: normalizeCriteria(row.criteria),
  };
}

function watchlistScoreBoost(value: unknown): number {
  const criteria = isRecord(value) ? value : {};
  return Math.max(0, Math.min(35, numberValue(criteria.scoreBoost, 18)));
}

function watchlistFromRow(
  row: WatchlistRow,
  itemsByWatchlistId: Map<string, WatchlistItem[]>,
): Watchlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    active: row.is_active,
    scoreBoost: watchlistScoreBoost(row.criteria),
    hitCount: Number(row.hit_count),
    items: itemsByWatchlistId.get(row.id) ?? [],
  };
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  setCorsHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response: ServerResponse): void {
  setCorsHeaders(response);
  response.writeHead(204);
  response.end();
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

function validateProfilePayload(value: unknown): Omit<IcpProfile, "id" | "hitCount" | "conversionRate"> {
  if (!isRecord(value)) {
    throw new Error("Expected JSON object");
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description =
    typeof value.description === "string" ? value.description.trim() : "";
  const active = booleanValue(value.active, true);
  const criteria = normalizeCriteria(value.criteria);

  if (name.length < 3) {
    throw new Error("ICP profile name must be at least 3 characters");
  }

  if (criteria.nacePrefixes.length === 0) {
    throw new Error("ICP profile must include at least one NACE prefix");
  }

  return {
    name,
    description,
    active,
    criteria,
  };
}

function validateWatchlistPayload(value: unknown): Omit<Watchlist, "id" | "hitCount" | "items"> {
  if (!isRecord(value)) {
    throw new Error("Expected JSON object");
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description =
    typeof value.description === "string" ? value.description.trim() : "";
  const active = booleanValue(value.active, true);
  const criteria = isRecord(value.criteria) ? value.criteria : {};
  const scoreBoost = Math.max(
    0,
    Math.min(35, numberValue(value.scoreBoost, numberValue(criteria.scoreBoost, 18))),
  );

  if (name.length < 3) {
    throw new Error("Watchlist name must be at least 3 characters");
  }

  return {
    name,
    description,
    active,
    scoreBoost,
  };
}

function validateWatchlistItemPayload(value: unknown): WatchlistItem {
  if (!isRecord(value)) {
    throw new Error("Expected JSON object");
  }

  const orgnr = typeof value.orgnr === "string" ? value.orgnr.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const note = typeof value.note === "string" ? value.note.trim() : "";

  if (!/^[0-9]{9}$/.test(orgnr)) {
    throw new Error("Watchlist item orgnr must have 9 digits");
  }

  if (name.length < 1) {
    throw new Error("Watchlist item name is required");
  }

  return {
    orgnr,
    name,
    note: note || "Manuelt lagt til i Console.",
  };
}

async function listIcpProfiles(): Promise<IcpProfile[]> {
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<IcpProfileRow>(
      `with organization_total as (
         select count(*)::numeric as total
         from organizations
       ),
       profile_hits as (
         select
           (item->>'profileId')::uuid as profile_id,
           count(*)::integer as hit_count
         from generated_signals gs
         cross join lateral jsonb_array_elements(gs.evidence) item
         where item->>'kind' = 'icp_match'
           and item ? 'profileId'
         group by (item->>'profileId')::uuid
       )
       select
         p.id,
         p.name,
         p.description,
         p.is_active,
         p.criteria,
         coalesce(ph.hit_count, 0)::integer as hit_count,
         case
           when ot.total = 0 then 0
           else round((coalesce(ph.hit_count, 0)::numeric / ot.total) * 100, 1)
         end::float8 as conversion_rate
       from icp_profiles p
       cross join organization_total ot
       left join profile_hits ph on ph.profile_id = p.id
       where p.tenant_id is null
       order by p.created_at asc, p.name asc`,
    );

    return result.rows.map(profileFromRow);
  } finally {
    await client.end();
  }
}

async function getIcpProfile(id: string): Promise<IcpProfile | null> {
  const profiles = await listIcpProfiles();
  return profiles.find((profile) => profile.id === id) ?? null;
}

async function createIcpProfile(payload: Omit<IcpProfile, "id" | "hitCount" | "conversionRate">): Promise<IcpProfile> {
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<{ id: string }>(
      `insert into icp_profiles (name, description, criteria, is_active)
       values ($1, $2, $3, $4)
       returning id`,
      [payload.name, payload.description, payload.criteria, payload.active],
    );

    const profile = await getIcpProfile(result.rows[0].id);

    if (!profile) {
      throw new Error("Created ICP profile could not be loaded");
    }

    return profile;
  } finally {
    await client.end();
  }
}

async function updateIcpProfile(
  id: string,
  payload: Omit<IcpProfile, "id" | "hitCount" | "conversionRate">,
): Promise<IcpProfile | null> {
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<{ id: string }>(
      `update icp_profiles
       set name = $2,
           description = $3,
           criteria = $4,
           is_active = $5
       where id = $1
         and tenant_id is null
       returning id`,
      [id, payload.name, payload.description, payload.criteria, payload.active],
    );

    if (result.rowCount !== 1) {
      return null;
    }

    return await getIcpProfile(id);
  } finally {
    await client.end();
  }
}

async function deleteIcpProfile(id: string): Promise<boolean> {
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query(
      `delete from icp_profiles
       where id = $1
         and tenant_id is null`,
      [id],
    );

    return result.rowCount === 1;
  } finally {
    await client.end();
  }
}

async function listWatchlists(): Promise<Watchlist[]> {
  const client = createDbClient();
  await client.connect();

  try {
    const watchlists = await client.query<WatchlistRow>(
      `with watchlist_hits as (
         select
           (item->>'watchlistId')::uuid as watchlist_id,
           count(*)::integer as hit_count
         from generated_signals gs
         cross join lateral jsonb_array_elements(gs.evidence) item
         where item->>'kind' = 'watchlist_match'
           and item ? 'watchlistId'
         group by (item->>'watchlistId')::uuid
       )
       select
         w.id,
         w.name,
         w.description,
         w.is_active,
         w.criteria,
         coalesce(wh.hit_count, 0)::integer as hit_count
       from watchlists w
       left join watchlist_hits wh on wh.watchlist_id = w.id
       where w.tenant_id is null
       order by w.created_at asc, w.name asc`,
    );

    const items = await client.query<WatchlistItemRow>(
      `select
         wi.watchlist_id,
         wi.orgnr,
         wi.display_name,
         wi.note,
         coalesce(org_by_id.name, org_by_orgnr.name) as organization_name
       from watchlist_items wi
       left join organizations org_by_id on org_by_id.id = wi.organization_id
       left join organizations org_by_orgnr on org_by_orgnr.orgnr = wi.orgnr
       order by wi.created_at asc, wi.id asc`,
    );

    const itemsByWatchlistId = new Map<string, WatchlistItem[]>();

    for (const item of items.rows) {
      const orgnr = item.orgnr ?? "";
      const rows = itemsByWatchlistId.get(item.watchlist_id) ?? [];
      rows.push({
        orgnr,
        name: item.organization_name ?? item.display_name ?? orgnr,
        note: item.note ?? "",
      });
      itemsByWatchlistId.set(item.watchlist_id, rows);
    }

    return watchlists.rows.map((row) => watchlistFromRow(row, itemsByWatchlistId));
  } finally {
    await client.end();
  }
}

async function getWatchlist(id: string): Promise<Watchlist | null> {
  const watchlists = await listWatchlists();
  return watchlists.find((watchlist) => watchlist.id === id) ?? null;
}

async function createWatchlist(
  payload: Omit<Watchlist, "id" | "hitCount" | "items">,
): Promise<Watchlist> {
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<{ id: string }>(
      `insert into watchlists (name, description, criteria, is_active)
       values ($1, $2, $3, $4)
       returning id`,
      [
        payload.name,
        payload.description,
        { scoreBoost: payload.scoreBoost },
        payload.active,
      ],
    );

    const watchlist = await getWatchlist(result.rows[0].id);

    if (!watchlist) {
      throw new Error("Created watchlist could not be loaded");
    }

    return watchlist;
  } finally {
    await client.end();
  }
}

async function updateWatchlist(
  id: string,
  payload: Omit<Watchlist, "id" | "hitCount" | "items">,
): Promise<Watchlist | null> {
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<{ id: string }>(
      `update watchlists
       set name = $2,
           description = $3,
           criteria = $4,
           is_active = $5
       where id = $1
         and tenant_id is null
       returning id`,
      [
        id,
        payload.name,
        payload.description,
        { scoreBoost: payload.scoreBoost },
        payload.active,
      ],
    );

    if (result.rowCount !== 1) {
      return null;
    }

    return await getWatchlist(id);
  } finally {
    await client.end();
  }
}

async function deleteWatchlist(id: string): Promise<boolean> {
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query(
      `delete from watchlists
       where id = $1
         and tenant_id is null`,
      [id],
    );

    return result.rowCount === 1;
  } finally {
    await client.end();
  }
}

async function addWatchlistItem(
  watchlistId: string,
  item: WatchlistItem,
): Promise<Watchlist | null> {
  const client = createDbClient();
  await client.connect();

  try {
    const watchlist = await client.query<{ id: string }>(
      `select id
       from watchlists
       where id = $1
         and tenant_id is null
       limit 1`,
      [watchlistId],
    );

    if (!watchlist.rows[0]) {
      return null;
    }

    const organization = await client.query<{ id: string }>(
      `select id
       from organizations
       where orgnr = $1
       limit 1`,
      [item.orgnr],
    );

    await client.query(
      `insert into watchlist_items (
         watchlist_id,
         organization_id,
         orgnr,
         display_name,
         note
       )
       values ($1, $2, $3, $4, $5)
       on conflict (watchlist_id, orgnr)
       do update set
         organization_id = coalesce(excluded.organization_id, watchlist_items.organization_id),
         display_name = excluded.display_name,
         note = excluded.note`,
      [
        watchlistId,
        organization.rows[0]?.id ?? null,
        item.orgnr,
        item.name,
        item.note,
      ],
    );

    return await getWatchlist(watchlistId);
  } finally {
    await client.end();
  }
}

async function deleteWatchlistItem(
  watchlistId: string,
  orgnr: string,
): Promise<Watchlist | null> {
  const client = createDbClient();
  await client.connect();

  try {
    const watchlist = await client.query<{ id: string }>(
      `select id
       from watchlists
       where id = $1
         and tenant_id is null
       limit 1`,
      [watchlistId],
    );

    if (!watchlist.rows[0]) {
      return null;
    }

    await client.query(
      `delete from watchlist_items
       where watchlist_id = $1
         and orgnr = $2`,
      [watchlistId, orgnr],
    );

    return await getWatchlist(watchlistId);
  } finally {
    await client.end();
  }
}

async function listSignals(limit: number): Promise<Signal[]> {
  const client = createDbClient();
  await client.connect();

  try {
    const result = await client.query<SignalRow>(
      `select
         gs.id,
         gs.signal_type,
         gs.score,
         gs.confidence,
         gs.status,
         gs.title,
         gs.reason,
         gs.suggested_action,
         gs.observed_at,
         gs.evidence,
         o.orgnr,
         o.name as organization_name,
         o.organization_form_code,
         o.organization_form_description,
         o.is_active,
         o.is_bankrupt,
         o.is_under_liquidation,
         o.municipality_name,
         o.nace_code,
         o.nace_description,
         o.registered_at
       from generated_signals gs
       join organizations o on o.id = gs.organization_id
       order by gs.score desc, gs.observed_at desc, gs.created_at desc
       limit $1`,
      [limit],
    );

    return result.rows.map(signalFromRow);
  } finally {
    await client.end();
  }
}

async function getDashboardSummary(): Promise<DashboardSummary> {
  const client = createDbClient();
  await client.connect();

  try {
    const totals = await client.query<{
      organizations: string;
      snapshots: string;
      change_events: string;
      generated_signals: string;
      created_events: string;
      new_organization_matches: string;
    }>(
      `select
         (select count(*) from organizations) as organizations,
         (select count(*) from organization_snapshots) as snapshots,
         (select count(*) from organization_change_events) as change_events,
         (select count(*) from generated_signals) as generated_signals,
         (select count(*) from organization_change_events where event_type = 'organization_created') as created_events,
         (select count(*) from generated_signals where signal_type = 'new_organization_match') as new_organization_matches`,
    );

    const scoreDistribution = await client.query<CountRow>(
      `with buckets(label, sort_order, min_score, max_score) as (
         values
           ('85-100', 1, 85, 100),
           ('70-84', 2, 70, 84),
           ('50-69', 3, 50, 69),
           ('0-49', 4, 0, 49)
       )
       select b.label, count(gs.id)::integer as count
       from buckets b
       left join generated_signals gs
         on gs.score between b.min_score and b.max_score
       group by b.label, b.sort_order
       order by b.sort_order`,
    );

    const signalTypes = await client.query<{ label: string; count: number }>(
      `select signal_type as label, count(*)::integer as count
       from generated_signals
       group by signal_type
       order by count(*) desc, signal_type asc`,
    );

    const naceRows = await client.query<{
      profile_name: string;
      nace_label: string;
      count: number;
    }>(
      `select
         item->>'profileName' as profile_name,
         coalesce(o.nace_code, 'ukjent') || ' ' || coalesce(o.nace_description, '') as nace_label,
         count(*)::integer as count
       from generated_signals gs
       join organizations o on o.id = gs.organization_id
       cross join lateral jsonb_array_elements(gs.evidence) item
       where item->>'kind' = 'icp_match'
       group by item->>'profileName', o.nace_code, o.nace_description
       order by item->>'profileName' asc, count(*) desc, o.nace_code asc`,
    );

    const row = totals.rows[0];
    const createdEvents = Number(row.created_events);
    const newOrganizationMatches = Number(row.new_organization_matches);
    const conversionRate =
      createdEvents === 0
        ? 0
        : Math.round((newOrganizationMatches / createdEvents) * 1000) / 10;
    const breakdowns = new Map<string, CountRow[]>();

    for (const naceRow of naceRows.rows) {
      const rows = breakdowns.get(naceRow.profile_name) ?? [];
      rows.push({ label: naceRow.nace_label.trim(), count: Number(naceRow.count) });
      breakdowns.set(naceRow.profile_name, rows);
    }

    return {
      organizations: Number(row.organizations),
      snapshots: Number(row.snapshots),
      changeEvents: Number(row.change_events),
      generatedSignals: Number(row.generated_signals),
      createdEvents,
      newOrganizationMatches,
      conversionRate,
      scoreDistribution: scoreDistribution.rows.map((item) => ({
        label: item.label,
        count: Number(item.count),
      })),
      signalTypeRows: signalTypes.rows.map((item) => ({
        label: signalTypeLabel(item.label),
        count: Number(item.count),
      })),
      naceBreakdowns: [...breakdowns.entries()].map(([profileName, rows]) => ({
        profileName,
        total: rows.reduce((sum, item) => sum + item.count, 0),
        rows,
      })),
    };
  } finally {
    await client.end();
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, service: "crm_signal_api" });
    return;
  }

  if (segments[0] !== "v1") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  if (segments[1] === "signals") {
    if (request.method === "GET" && segments.length === 2) {
      const rawLimit = Number(url.searchParams.get("limit") ?? 100);
      const limit = Math.max(1, Math.min(500, Number.isFinite(rawLimit) ? rawLimit : 100));
      sendJson(response, 200, { signals: await listSignals(limit) });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (segments[1] === "dashboard") {
    if (request.method === "GET" && segments.length === 2) {
      sendJson(response, 200, { dashboard: await getDashboardSummary() });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (segments[1] === "icp-profiles") {
    if (request.method === "GET" && segments.length === 2) {
      sendJson(response, 200, { profiles: await listIcpProfiles() });
      return;
    }

    if (request.method === "POST" && segments.length === 2) {
      const payload = validateProfilePayload(await readJson(request));
      sendJson(response, 201, { profile: await createIcpProfile(payload) });
      return;
    }

    const profileId = segments[2];

    if (!profileId || segments.length !== 3) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (request.method === "PATCH") {
      const payload = validateProfilePayload(await readJson(request));
      const profile = await updateIcpProfile(profileId, payload);

      if (!profile) {
        sendJson(response, 404, { error: "ICP profile not found" });
        return;
      }

      sendJson(response, 200, { profile });
      return;
    }

    if (request.method === "DELETE") {
      const deleted = await deleteIcpProfile(profileId);

      if (!deleted) {
        sendJson(response, 404, { error: "ICP profile not found" });
        return;
      }

      sendNoContent(response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (segments[1] === "watchlists") {
    if (request.method === "GET" && segments.length === 2) {
      sendJson(response, 200, { watchlists: await listWatchlists() });
      return;
    }

    if (request.method === "POST" && segments.length === 2) {
      const payload = validateWatchlistPayload(await readJson(request));
      sendJson(response, 201, { watchlist: await createWatchlist(payload) });
      return;
    }

    const watchlistId = segments[2];

    if (!watchlistId) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (segments.length === 3 && request.method === "PATCH") {
      const payload = validateWatchlistPayload(await readJson(request));
      const watchlist = await updateWatchlist(watchlistId, payload);

      if (!watchlist) {
        sendJson(response, 404, { error: "Watchlist not found" });
        return;
      }

      sendJson(response, 200, { watchlist });
      return;
    }

    if (segments.length === 3 && request.method === "DELETE") {
      const deleted = await deleteWatchlist(watchlistId);

      if (!deleted) {
        sendJson(response, 404, { error: "Watchlist not found" });
        return;
      }

      sendNoContent(response);
      return;
    }

    if (segments.length === 4 && segments[3] === "items" && request.method === "POST") {
      const payload = validateWatchlistItemPayload(await readJson(request));
      const watchlist = await addWatchlistItem(watchlistId, payload);

      if (!watchlist) {
        sendJson(response, 404, { error: "Watchlist not found" });
        return;
      }

      sendJson(response, 201, { watchlist });
      return;
    }

    if (segments.length === 5 && segments[3] === "items" && request.method === "DELETE") {
      const orgnr = segments[4];

      if (!/^[0-9]{9}$/.test(orgnr)) {
        sendJson(response, 400, { error: "Watchlist item orgnr must have 9 digits" });
        return;
      }

      const watchlist = await deleteWatchlistItem(watchlistId, orgnr);

      if (!watchlist) {
        sendJson(response, 404, { error: "Watchlist not found" });
        return;
      }

      sendJson(response, 200, { watchlist });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function start(port: number): void {
  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(response, 500, { error: message });
    });
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `crm_signal API could not start: http://${host}:${port} is already in use.`,
      );
      console.error("Stop the old process or set PORT to a free explicit port.");
      process.exitCode = 1;
      return;
    }

    throw error;
  });

  server.listen(port, host, () => {
    console.log(`crm_signal API: http://${host}:${port}`);
  });
}

start(preferredPort);
