type ViewId =
  | "dashboard"
  | "signals"
  | "icp"
  | "watchlists"
  | "evaluation"
  | "api";

type Confidence = "low" | "medium" | "high";
type ReviewState = "useful" | "maybe" | "noise";
type ReviewFilter = "all" | "unreviewed" | ReviewState;
type ApiStatus = "checking" | "connected" | "offline";

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
  confidence: Confidence;
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

type CountRow = {
  label: string;
  count: number;
};

type NaceBreakdown = {
  profileName: string;
  total: number;
  rows: CountRow[];
};

type EvaluationTotals = {
  organizations: number;
  snapshots: number;
  changeEvents: number;
  generatedSignals: number;
  createdEvents: number;
  newOrganizationMatches: number;
  conversionRate: number;
};

type DashboardSummary = EvaluationTotals & {
  scoreDistribution: CountRow[];
  signalTypeRows: CountRow[];
  naceBreakdowns: NaceBreakdown[];
};

type Filters = {
  query: string;
  minScore: number;
  review: ReviewFilter;
  signalType: string;
};

type AppState = {
  activeView: ViewId;
  apiStatus: ApiStatus;
  apiMessage: string;
  filters: Filters;
  reviews: Record<string, ReviewState>;
  icpProfiles: IcpProfile[];
  watchlists: Watchlist[];
  toast: string | null;
};

const reviewStorageKey = "crm_signal_console_reviews_v1";
const icpProfileStorageKey = "crm_signal_console_icp_profiles_v1";
const watchlistStorageKey = "crm_signal_console_watchlists_v1";
const signalApiBaseUrl = "http://127.0.0.1:5175";

const navItems: Array<{ id: ViewId; label: string; kicker: string }> = [
  { id: "dashboard", label: "Dashboard", kicker: "oversikt" },
  { id: "signals", label: "Signalfeed", kicker: "review" },
  { id: "icp", label: "ICP-profiler", kicker: "kriterier" },
  { id: "watchlists", label: "Watchlists", kicker: "prioritet" },
  { id: "evaluation", label: "Evaluering", kicker: "NACE" },
  { id: "api", label: "API", kicker: "docs" },
];

const naceCatalog: Array<{ prefix: string; label: string }> = [
  { prefix: "41.", label: "Oppføring av bygninger" },
  { prefix: "42.", label: "Anlegg og infrastruktur" },
  { prefix: "43.", label: "Håndverk og installasjon" },
  { prefix: "62.", label: "IT, programvare og konsulenttjenester" },
  { prefix: "63.1", label: "Databehandling og hosting" },
  { prefix: "64.2", label: "Holdingselskaper" },
  { prefix: "68.", label: "Eiendom, utleie og forvaltning" },
  { prefix: "70.22", label: "Bedriftsrådgivning" },
  { prefix: "71.1", label: "Teknisk rådgivning og arkitektur" },
  { prefix: "73.", label: "Reklame og markedsføring" },
  { prefix: "74.9", label: "Annen spesialisert tjenesteyting" },
  { prefix: "82.", label: "Kontor- og forretningsstøtte" },
];

let signals: Signal[] = [];

let evaluationTotals: EvaluationTotals = {
  organizations: 0,
  snapshots: 0,
  changeEvents: 0,
  generatedSignals: 0,
  createdEvents: 0,
  newOrganizationMatches: 0,
  conversionRate: 0,
};

let scoreDistribution: CountRow[] = [
  { label: "85-100", count: 0 },
  { label: "70-84", count: 0 },
  { label: "50-69", count: 0 },
  { label: "0-49", count: 0 },
];

let signalTypeRows: CountRow[] = [];

let naceBreakdowns: NaceBreakdown[] = [];

const initialIcpProfiles: IcpProfile[] = [
  {
    id: "icp-it",
    name: "Lokal ICP: Oslo IT/SaaS",
    description: "Aktive aksjeselskaper i Oslo innen programvare, IT-drift og datatjenester.",
    active: true,
    hitCount: 0,
    conversionRate: 0,
    criteria: {
      municipalityNumbers: ["0301"],
      organizationFormCodes: ["AS"],
      nacePrefixes: ["62.", "63.1"],
      requireActive: true,
      scoreBoost: 15,
    },
  },
  {
    id: "icp-advisory",
    name: "Lokal ICP: Oslo B2B-rådgivning",
    description:
      "Aktive aksjeselskaper i Oslo innen bedriftsrådgivning, teknisk rådgivning, marked og spesialisert tjenesteyting.",
    active: true,
    hitCount: 0,
    conversionRate: 0,
    criteria: {
      municipalityNumbers: ["0301"],
      organizationFormCodes: ["AS"],
      nacePrefixes: ["70.22", "71.1", "73.", "74.9"],
      requireActive: true,
      scoreBoost: 12,
    },
  },
  {
    id: "icp-build",
    name: "Lokal ICP: Oslo håndverk/utbygging",
    description: "Aktive aksjeselskaper i Oslo innen bygg, anlegg, håndverk og installasjon.",
    active: true,
    hitCount: 0,
    conversionRate: 0,
    criteria: {
      municipalityNumbers: ["0301"],
      organizationFormCodes: ["AS"],
      nacePrefixes: ["41.", "42.", "43."],
      requireActive: true,
      scoreBoost: 10,
    },
  },
  {
    id: "icp-property",
    name: "Lokal ICP: Oslo eiendom/utleie/holding",
    description: "Aktive aksjeselskaper i Oslo innen eiendom, utleie, eiendomsforvaltning og holding.",
    active: true,
    hitCount: 0,
    conversionRate: 0,
    criteria: {
      municipalityNumbers: ["0301"],
      organizationFormCodes: ["AS"],
      nacePrefixes: ["64.2", "68."],
      requireActive: true,
      scoreBoost: 6,
    },
  },
];

const initialWatchlists: Watchlist[] = [
  {
    id: "wl-local",
    name: "Lokal manuell watchlist",
    description: "Manuell prioritering av enkeltorganisasjoner i lokal evaluering.",
    active: true,
    scoreBoost: 18,
    hitCount: 0,
    items: [],
  },
];

const apiExamples = {
  latestSignals: `curl -sS \\
  -H "Authorization: Bearer $CRM_SIGNAL_API_KEY" \\
  "https://api.crm-signal.no/v1/signals?status=new&min_score=70"`,
  signalPayload: `{
  "id": "sig_01jz8e6h",
  "signal_type": "new_organization_match",
  "score": 88,
  "confidence": "high",
  "organization": {
    "orgnr": "931120884",
    "name": "Nordlys Dataflyt AS",
    "nace_code": "63.110",
    "municipality_name": "Oslo"
  },
  "reason": "Matcher aktiv ICP-profil Lokal ICP: Oslo IT/SaaS.",
  "evidence": [
    {
      "kind": "icp_match",
      "profile_name": "Lokal ICP: Oslo IT/SaaS",
      "reasons": ["kommune Oslo", "orgform AS", "databehandling og hosting"]
    }
  ],
  "suggested_action": "Vurder om virksomheten bør legges til som prospect."
}`,
  webhookPayload: `{
  "event": "signal.created",
  "created_at": "2026-06-09T08:30:00.000Z",
  "data": {
    "signal_id": "sig_01jz8e6h",
    "organization_orgnr": "931120884",
    "score": 88,
    "signal_type": "new_organization_match"
  }
}`,
};

const dateFormatter = new Intl.DateTimeFormat("no-NO", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateOnlyFormatter = new Intl.DateTimeFormat("no-NO", {
  dateStyle: "medium",
});

const state: AppState = {
  activeView: "dashboard",
  apiStatus: "checking",
  apiMessage: "Kobler til signal-api",
  filters: {
    query: "",
    minScore: 50,
    review: "all",
    signalType: "all",
  },
  reviews: loadReviews(),
  icpProfiles: loadIcpProfiles(),
  watchlists: loadWatchlists(),
  toast: null,
};

const appElement = getAppElement();

function getAppElement(): HTMLDivElement {
  const element = document.querySelector<HTMLDivElement>("#app");

  if (!element) {
    throw new Error("Missing #app element");
  }

  return element;
}

function loadReviews(): Record<string, ReviewState> {
  try {
    const raw = localStorage.getItem(reviewStorageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveReviews(): void {
  localStorage.setItem(reviewStorageKey, JSON.stringify(state.reviews));
}

function loadIcpProfiles(): IcpProfile[] {
  try {
    const raw = localStorage.getItem(icpProfileStorageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as IcpProfile[]) : structuredClone(initialIcpProfiles);
  } catch {
    return structuredClone(initialIcpProfiles);
  }
}

function saveIcpProfiles(): void {
  localStorage.setItem(icpProfileStorageKey, JSON.stringify(state.icpProfiles));
}

function loadWatchlists(): Watchlist[] {
  try {
    const raw = localStorage.getItem(watchlistStorageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Watchlist[]) : structuredClone(initialWatchlists);
  } catch {
    return structuredClone(initialWatchlists);
  }
}

function saveWatchlists(): void {
  localStorage.setItem(watchlistStorageKey, JSON.stringify(state.watchlists));
}

type IcpProfilesResponse = {
  profiles: IcpProfile[];
};

type IcpProfileResponse = {
  profile: IcpProfile;
};

type WatchlistsResponse = {
  watchlists: Watchlist[];
};

type WatchlistResponse = {
  watchlist: Watchlist;
};

type SignalsResponse = {
  signals: Signal[];
};

type DashboardResponse = {
  dashboard: DashboardSummary;
};

function apiIsConnected(): boolean {
  return state.apiStatus === "connected";
}

function icpProfilePayload(profile: IcpProfile): Omit<IcpProfile, "id" | "hitCount" | "conversionRate"> {
  return {
    name: profile.name,
    description: profile.description,
    active: profile.active,
    criteria: profile.criteria,
  };
}

function watchlistPayload(watchlist: Watchlist): Omit<Watchlist, "id" | "hitCount" | "items"> {
  return {
    name: watchlist.name,
    description: watchlist.description,
    active: watchlist.active,
    scoreBoost: watchlist.scoreBoost,
  };
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${signalApiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `API request failed with ${response.status}`;

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function replaceIcpProfile(profile: IcpProfile): void {
  state.icpProfiles = state.icpProfiles.map((item) =>
    item.id === profile.id ? profile : item,
  );
}

function replaceWatchlist(watchlist: Watchlist): void {
  state.watchlists = state.watchlists.map((item) =>
    item.id === watchlist.id ? watchlist : item,
  );
}

async function hydrateSignalConfigFromApi(): Promise<void> {
  try {
    const [icpResponse, watchlistResponse, signalsResponse, dashboardResponse] = await Promise.all([
      requestJson<IcpProfilesResponse>("/v1/icp-profiles"),
      requestJson<WatchlistsResponse>("/v1/watchlists"),
      requestJson<SignalsResponse>("/v1/signals?limit=200"),
      requestJson<DashboardResponse>("/v1/dashboard"),
    ]);
    state.icpProfiles = icpResponse.profiles;
    state.watchlists = watchlistResponse.watchlists;
    signals = signalsResponse.signals;
    evaluationTotals = dashboardResponse.dashboard;
    scoreDistribution = dashboardResponse.dashboard.scoreDistribution;
    signalTypeRows = dashboardResponse.dashboard.signalTypeRows;
    naceBreakdowns = dashboardResponse.dashboard.naceBreakdowns;
    state.apiStatus = "connected";
    state.apiMessage = "Postgres via signal-api";
    saveIcpProfiles();
    saveWatchlists();
    render();
  } catch {
    state.apiStatus = "offline";
    state.apiMessage = "Lokal fallback";
    render();
  }
}

async function createIcpProfile(profile: IcpProfile): Promise<void> {
  if (!apiIsConnected()) {
    state.icpProfiles = [profile, ...state.icpProfiles];
    saveIcpProfiles();
    setToast(`${profile.name} opprettet lokalt`);
    return;
  }

  try {
    const response = await requestJson<IcpProfileResponse>("/v1/icp-profiles", {
      method: "POST",
      body: JSON.stringify(icpProfilePayload(profile)),
    });
    state.icpProfiles = [response.profile, ...state.icpProfiles];
    saveIcpProfiles();
    setToast(`${response.profile.name} opprettet i Postgres`);
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Kunne ikke opprette ICP-profil");
  }
}

async function persistIcpProfile(profile: IcpProfile, message?: string): Promise<void> {
  if (!apiIsConnected()) {
    saveIcpProfiles();
    if (message) {
      setToast(message);
    }
    return;
  }

  try {
    const response = await requestJson<IcpProfileResponse>(
      `/v1/icp-profiles/${profile.id}`,
      {
        method: "PATCH",
        body: JSON.stringify(icpProfilePayload(profile)),
      },
    );
    replaceIcpProfile(response.profile);
    saveIcpProfiles();

    if (message) {
      setToast(message);
    } else {
      render();
    }
  } catch (error) {
    state.apiStatus = "offline";
    state.apiMessage = "Lokal fallback";
    saveIcpProfiles();
    setToast(error instanceof Error ? error.message : "API utilgjengelig, endringen er lokal");
  }
}

async function deleteIcpProfile(profile: IcpProfile): Promise<void> {
  if (apiIsConnected()) {
    try {
      await fetch(`${signalApiBaseUrl}/v1/icp-profiles/${profile.id}`, {
        method: "DELETE",
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Kunne ikke fjerne ICP-profil (${response.status})`);
        }
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Kunne ikke fjerne ICP-profil");
      return;
    }
  }

  state.icpProfiles = state.icpProfiles.filter((item) => item.id !== profile.id);
  saveIcpProfiles();
  setToast(`${profile.name} fjernet`);
}

async function persistWatchlist(watchlist: Watchlist, message?: string): Promise<void> {
  if (!apiIsConnected()) {
    saveWatchlists();
    if (message) {
      setToast(message);
    }
    return;
  }

  try {
    const response = await requestJson<WatchlistResponse>(
      `/v1/watchlists/${watchlist.id}`,
      {
        method: "PATCH",
        body: JSON.stringify(watchlistPayload(watchlist)),
      },
    );
    replaceWatchlist(response.watchlist);
    saveWatchlists();

    if (message) {
      setToast(message);
    } else {
      render();
    }
  } catch (error) {
    state.apiStatus = "offline";
    state.apiMessage = "Lokal fallback";
    saveWatchlists();
    setToast(error instanceof Error ? error.message : "API utilgjengelig, endringen er lokal");
  }
}

async function addWatchlistItem(watchlist: Watchlist, item: WatchlistItem): Promise<void> {
  if (!apiIsConnected()) {
    watchlist.items = [
      ...watchlist.items.filter((existing) => existing.orgnr !== item.orgnr),
      item,
    ];
    saveWatchlists();
    setToast(`${item.name} lagt til i watchlist lokalt`);
    return;
  }

  try {
    const response = await requestJson<WatchlistResponse>(
      `/v1/watchlists/${watchlist.id}/items`,
      {
        method: "POST",
        body: JSON.stringify(item),
      },
    );
    replaceWatchlist(response.watchlist);
    saveWatchlists();
    setToast(`${item.name} lagt til i watchlist`);
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Kunne ikke legge til watchlist-item");
  }
}

async function removeWatchlistItem(watchlist: Watchlist, orgnr: string): Promise<void> {
  if (!apiIsConnected()) {
    watchlist.items = watchlist.items.filter((item) => item.orgnr !== orgnr);
    saveWatchlists();
    render();
    return;
  }

  try {
    const response = await requestJson<WatchlistResponse>(
      `/v1/watchlists/${watchlist.id}/items/${encodeURIComponent(orgnr)}`,
      { method: "DELETE" },
    );
    replaceWatchlist(response.watchlist);
    saveWatchlists();
    setToast(`${orgnr} fjernet fra watchlist`);
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Kunne ikke fjerne watchlist-item");
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function formatDateOnly(value: string | null): string {
  return value ? dateOnlyFormatter.format(new Date(`${value}T00:00:00.000Z`)) : "ukjent";
}

function scoreTone(score: number): string {
  if (score >= 85) {
    return "excellent";
  }

  if (score >= 70) {
    return "strong";
  }

  if (score >= 50) {
    return "medium";
  }

  return "weak";
}

function reviewLabel(review: ReviewFilter): string {
  const labels: Record<ReviewFilter, string> = {
    all: "Alle",
    unreviewed: "Uten review",
    useful: "Useful",
    maybe: "Maybe",
    noise: "Noise",
  };

  return labels[review];
}

function signalTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    all: "Alle signaltyper",
    new_organization_match: "Nytt funn",
    organization_status_changed: "Statusendring",
    organization_address_changed: "Adresse/geografi",
    industry_code_changed: "Næringskode",
  };

  return labels[value] ?? value;
}

function nacePrefixLabel(prefix: string): string {
  const label = naceCatalog.find((item) => item.prefix === prefix)?.label;
  return label ? `${prefix} ${label}` : `${prefix} Ukjent næringsvalg`;
}

function signalNaceLabel(signal: Signal): string {
  return `${signal.naceCode} ${signal.naceDescription}`;
}

function organizationStatusLabel(signal: Signal): string {
  if (signal.isBankrupt) {
    return "konkurs";
  }

  if (signal.isUnderLiquidation) {
    return "under avvikling";
  }

  return signal.isActive ? "aktiv" : "inaktiv";
}

function signalEvidenceByKind(
  signal: Signal,
  kind: EvidenceItem["kind"],
): EvidenceItem[] {
  return signal.evidence.filter((item) => item.kind === kind);
}

function evidenceLabels(signal: Signal, kind: EvidenceItem["kind"]): string[] {
  return signalEvidenceByKind(signal, kind).map((item) => item.label);
}

function signalEvidenceSearchText(signal: Signal): string {
  return signal.evidence
    .map((item) => `${item.label} ${item.detail} ${item.reasons?.join(" ") ?? ""}`)
    .join(" ")
    .toLowerCase();
}

function activeSignals(): Signal[] {
  const query = state.filters.query.trim().toLowerCase();

  return signals.filter((signal) => {
    const review = state.reviews[signal.id];
    const evidenceText = signalEvidenceSearchText(signal);
    const matchesQuery =
      query.length === 0 ||
      signal.organizationName.toLowerCase().includes(query) ||
      signal.orgnr.includes(query) ||
      signal.naceCode.includes(query) ||
      signal.naceDescription.toLowerCase().includes(query) ||
      signal.reason.toLowerCase().includes(query) ||
      evidenceText.includes(query);
    const matchesScore = signal.score >= state.filters.minScore;
    const matchesType =
      state.filters.signalType === "all" ||
      signal.signalType === state.filters.signalType;
    const matchesReview =
      state.filters.review === "all" ||
      (state.filters.review === "unreviewed" && !review) ||
      review === state.filters.review;

    return matchesQuery && matchesScore && matchesType && matchesReview;
  });
}

function reviewCounts(): Record<"unreviewed" | ReviewState, number> {
  return signals.reduce(
    (counts, signal) => {
      const review = state.reviews[signal.id];
      if (!review) {
        counts.unreviewed += 1;
      } else {
        counts[review] += 1;
      }

      return counts;
    },
    { unreviewed: 0, useful: 0, maybe: 0, noise: 0 },
  );
}

function barRows(rows: CountRow[], max = Math.max(...rows.map((row) => row.count), 1)): string {
  return rows
    .map((row) => {
      const width = row.count === 0 ? 0 : Math.max(7, Math.round((row.count / max) * 100));
      return `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(row.label)}</div>
          <div class="bar-track" aria-hidden="true">
            <span style="width: ${width}%"></span>
          </div>
          <div class="bar-value">${row.count}</div>
        </div>
      `;
    })
    .join("");
}

function metricCard(label: string, value: string | number, meta: string): string {
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
      <div class="metric-meta">${escapeHtml(meta)}</div>
    </article>
  `;
}

function renderApp(): string {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">cs</div>
          <div>
            <div class="brand-name">crm_signal</div>
            <div class="brand-subtitle">Console</div>
          </div>
        </div>
        <nav class="nav-tabs" aria-label="Hovednavigasjon">
          ${navItems
            .map(
              (item) => `
                <button
                  class="nav-tab ${state.activeView === item.id ? "active" : ""}"
                  data-action="view"
                  data-view="${item.id}"
                  type="button"
                >
                  <span>${escapeHtml(item.label)}</span>
                  <small>${escapeHtml(item.kicker)}</small>
                </button>
              `,
            )
            .join("")}
        </nav>
        <div class="sidebar-panel">
          <div class="panel-kicker">Lokal fase</div>
          <strong>Brreg Oslo</strong>
          <span>${evaluationTotals.organizations} organisasjoner, ${evaluationTotals.generatedSignals} signaler</span>
          <span>ICP: ${escapeHtml(state.apiMessage)}</span>
        </div>
      </aside>
      <main class="main-content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Signal-API kontrollpanel</p>
            <h1>${escapeHtml(navItems.find((item) => item.id === state.activeView)?.label ?? "Console")}</h1>
          </div>
          <div class="topbar-actions">
            <button class="secondary-button" type="button" data-action="export-csv">CSV</button>
            <button class="primary-button" type="button" data-action="view" data-view="api">API docs</button>
          </div>
        </header>
        ${renderActiveView()}
      </main>
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
    </div>
  `;
}

function renderActiveView(): string {
  if (state.activeView === "signals") {
    return renderSignalsView();
  }

  if (state.activeView === "icp") {
    return renderIcpView();
  }

  if (state.activeView === "watchlists") {
    return renderWatchlistsView();
  }

  if (state.activeView === "evaluation") {
    return renderEvaluationView();
  }

  if (state.activeView === "api") {
    return renderApiView();
  }

  return renderDashboardView();
}

function renderDashboardView(): string {
  const latest = [...signals].sort((left, right) => right.observedAt.localeCompare(left.observedAt)).slice(0, 5);
  const counts = reviewCounts();

  return `
    <section class="metrics-grid" aria-label="Nøkkeltall">
      ${metricCard("Organisasjoner", evaluationTotals.organizations, "Oslo-import")}
      ${metricCard("Genererte signaler", evaluationTotals.generatedSignals, "fra organization_created")}
      ${metricCard("Treffrate", `${evaluationTotals.conversionRate}%`, `${evaluationTotals.newOrganizationMatches} av ${evaluationTotals.createdEvents}`)}
      ${metricCard("Aktive ICP-profiler", state.icpProfiles.filter((profile) => profile.active).length, "lokal scoring")}
    </section>

    <section class="dashboard-grid">
      <article class="panel panel-large">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Siste signaler</p>
            <h2>Høyeste prioritet nå</h2>
          </div>
          <button class="text-button" type="button" data-action="view" data-view="signals">Åpne feed</button>
        </div>
        <div class="signal-stack compact">
          ${latest.length > 0 ? latest.map(renderSignalCard).join("") : renderEmptyState("Ingen genererte signaler i databasen.")}
        </div>
      </article>

      <aside class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Review</p>
            <h2>Kalibrering</h2>
          </div>
        </div>
        <div class="review-grid">
          ${metricCard("Useful", counts.useful, "klare treff")}
          ${metricCard("Maybe", counts.maybe, "må vurderes")}
          ${metricCard("Noise", counts.noise, "svake signaler")}
          ${metricCard("Uten review", counts.unreviewed, "gjenstår")}
        </div>
        <div class="chart-block">
          <h3>Scorefordeling</h3>
          ${barRows(scoreDistribution)}
        </div>
      </aside>
    </section>

    <section class="dashboard-grid lower">
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">ICP</p>
            <h2>Match per profil</h2>
          </div>
          <button class="text-button" type="button" data-action="view" data-view="icp">Juster</button>
        </div>
        ${barRows(state.icpProfiles.map((profile) => ({ label: profile.name.replace("Lokal ICP: ", ""), count: profile.hitCount })))}
      </article>

      <article class="panel crm-cta">
        <p class="eyebrow">Neste produkt</p>
        <h2>Full CRM når signalene sitter</h2>
        <p>
          Console holder seg til signaler, evaluering, ICP og API. Pipeline, kontakter,
          oppgaver, notater og vedlegg hører hjemme i den senere CRM-appen.
        </p>
        <div class="cta-actions">
          <button class="primary-button" type="button" data-action="view" data-view="api">Se API-kontrakt</button>
          <button class="secondary-button" type="button" data-action="view" data-view="evaluation">Evaluer signalene</button>
        </div>
      </article>
    </section>
  `;
}

function renderSignalsView(): string {
  const filtered = activeSignals();
  const counts = reviewCounts();
  const uniqueTypes = ["all", ...new Set(signals.map((signal) => signal.signalType))];

  return `
    <section class="panel">
      <div class="filter-bar">
        <label class="search-field">
          <span>Søk</span>
          <input
            type="search"
            data-filter="query"
            value="${escapeHtml(state.filters.query)}"
            placeholder="orgnr, navn, NACE eller reason"
          />
        </label>
        <label class="range-field">
          <span>Min score: ${state.filters.minScore}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            data-filter="minScore"
            value="${state.filters.minScore}"
          />
        </label>
        <label class="select-field">
          <span>Type</span>
          <select data-filter="signalType">
            ${uniqueTypes
              .map(
                (type) =>
                  `<option value="${escapeHtml(type)}" ${state.filters.signalType === type ? "selected" : ""}>${escapeHtml(signalTypeLabel(type))}</option>`,
              )
              .join("")}
          </select>
        </label>
      </div>
      <div class="segmented-control" role="tablist" aria-label="Review filter">
        ${(["all", "unreviewed", "useful", "maybe", "noise"] as ReviewFilter[])
          .map(
            (review) => `
              <button
                type="button"
                class="${state.filters.review === review ? "active" : ""}"
                data-action="review-filter"
                data-review-filter="${review}"
              >
                ${escapeHtml(reviewLabel(review))}
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="feed-summary">
        <span>${filtered.length} viste signaler</span>
        <span>${counts.useful} useful</span>
        <span>${counts.maybe} maybe</span>
        <span>${counts.noise} noise</span>
      </div>
    </section>

    <section class="signal-stack">
      ${filtered.length > 0 ? filtered.map(renderSignalCard).join("") : renderEmptyState("Ingen signaler matcher filteret.")}
    </section>
  `;
}

function renderSignalCard(signal: Signal): string {
  const review = state.reviews[signal.id];
  const matchSummary = renderMatchSummary(signal);
  const reviewContext = renderReviewContext(signal);
  const evidence = signal.evidence
    .map(
      (item) => `
        <span class="evidence-pill ${item.kind}">
          <strong>${escapeHtml(item.label)}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </span>
      `,
    )
    .join("");

  return `
    <article class="signal-card">
      <div class="signal-score ${scoreTone(signal.score)}">
        <strong>${signal.score}</strong>
        <span>${escapeHtml(signal.confidence)}</span>
      </div>
      <div class="signal-body">
        <div class="signal-meta">
          <span>${escapeHtml(signalTypeLabel(signal.signalType))}</span>
          <span>${escapeHtml(formatDate(signal.observedAt))}</span>
          <span>${escapeHtml(signal.orgnr)}</span>
          <span>${escapeHtml(signalNaceLabel(signal))}</span>
        </div>
        <h3>${escapeHtml(signal.title)}</h3>
        ${matchSummary}
        ${reviewContext}
        <p>${escapeHtml(signal.reason)}</p>
        <div class="suggested-action">${escapeHtml(signal.suggestedAction)}</div>
        <div class="evidence-row">${evidence}</div>
      </div>
      <div class="review-actions" aria-label="Signal review">
        ${(["useful", "maybe", "noise"] as ReviewState[])
          .map(
            (option) => `
              <button
                type="button"
                class="${review === option ? "active" : ""}"
                data-action="set-review"
                data-signal-id="${signal.id}"
                data-review="${option}"
              >
                ${escapeHtml(reviewLabel(option))}
              </button>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderReviewContext(signal: Signal): string {
  const icpReasons = signalEvidenceByKind(signal, "icp_match").flatMap(
    (item) => item.reasons ?? [item.detail],
  );
  const warnings = relevanceWarnings(signal);
  const facts = [
    {
      label: "Bransje",
      value: signalNaceLabel(signal),
    },
    {
      label: "Selskap",
      value: [
        signal.organizationFormCode || "ukjent orgform",
        organizationStatusLabel(signal),
        signal.municipalityName || "ukjent kommune",
      ].join(" / "),
    },
    {
      label: "Registrert",
      value: formatDateOnly(signal.registeredAt),
    },
  ];

  return `
    <div class="review-context">
      <div class="context-column">
        <span class="field-label">Virksomhet</span>
        <div class="context-facts">
          ${facts
            .map(
              (fact) => `
                <span>
                  <strong>${escapeHtml(fact.label)}</strong>
                  ${escapeHtml(fact.value)}
                </span>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="context-column">
        <span class="field-label">ICP-treff</span>
        <div class="context-tags">
          ${icpReasons.length > 0
            ? icpReasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")
            : "<span>Ingen ICP-detaljer</span>"}
        </div>
      </div>
      <div class="context-column ${warnings.length > 0 ? "needs-attention" : ""}">
        <span class="field-label">${warnings.length > 0 ? "Usikkerhet" : "Tolkning"}</span>
        <div class="context-tags">
          ${warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("") || "<span>Ser konsistent ut med aktiv IT/SaaS-match</span>"}
        </div>
      </div>
    </div>
  `;
}

function relevanceWarnings(signal: Signal): string[] {
  const name = signal.organizationName.toUpperCase();
  const warnings: string[] = [];

  if (/\b(HOLDING|INVEST|INVESTMENT|INVESTMENTS)\b/.test(name)) {
    warnings.push("Navnet kan indikere holding/invest, ikke operativ SaaS.");
  }

  if (/\b(EIENDOM|PROPERTY|UTLEIE)\b/.test(name)) {
    warnings.push("Navnet kan indikere eiendom/utleie selv om NACE traff.");
  }

  if (signal.naceCode.startsWith("62.200")) {
    warnings.push("IT-konsulent/drift kan være relevant, men ikke nødvendigvis SaaS.");
  }

  if (signal.isBankrupt || signal.isUnderLiquidation || !signal.isActive) {
    warnings.push(`Status er ${organizationStatusLabel(signal)}.`);
  }

  return warnings;
}

function renderMatchSummary(signal: Signal): string {
  const icpMatches = signalEvidenceByKind(signal, "icp_match");
  const watchlistMatches = signalEvidenceByKind(signal, "watchlist_match");

  if (icpMatches.length === 0 && watchlistMatches.length === 0) {
    return "";
  }

  const rows = [
    ...icpMatches.map(
      (item) => `
        <span>
          <strong>ICP</strong>
          ${escapeHtml(item.label)}
        </span>
      `,
    ),
    ...watchlistMatches.map(
      (item) => `
        <span>
          <strong>Watchlist</strong>
          ${escapeHtml(item.label)}
        </span>
      `,
    ),
  ];

  return `<div class="match-summary">${rows.join("")}</div>`;
}

function renderIcpView(): string {
  return `
    <section class="panel intro-panel">
      <div>
        <p class="eyebrow">Scoring context</p>
        <h2>${state.apiStatus === "connected" ? "Profiler fra Postgres" : "Profiler fra lokal fallback"}</h2>
      </div>
      <div class="inline-stats">
        <span>${state.icpProfiles.filter((profile) => profile.active).length} aktive</span>
        <span>${state.icpProfiles.reduce((sum, profile) => sum + profile.hitCount, 0)} ICP-treff</span>
        <span>${escapeHtml(state.apiStatus === "checking" ? "kobler til API" : state.apiMessage)}</span>
      </div>
    </section>

    ${renderCreateIcpProfilePanel()}

    <section class="profile-grid">
      ${state.icpProfiles.map(renderIcpProfile).join("")}
    </section>
  `;
}

function renderCreateIcpProfilePanel(): string {
  return `
    <section class="panel icp-create-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Admin</p>
          <h2>Ny ICP-profil</h2>
        </div>
        <button type="button" class="primary-button" data-action="create-icp">Opprett</button>
      </div>
      <div class="icp-create-grid">
        <label class="search-field">
          <span>Navn</span>
          <input type="text" data-new-icp="name" placeholder="Lokal ICP: Oslo helse/omsorg" />
        </label>
        <label class="search-field wide">
          <span>Beskrivelse</span>
          <input type="text" data-new-icp="description" placeholder="Hvilke virksomheter denne profilen skal fange" />
        </label>
        <label class="search-field">
          <span>Kommune</span>
          <input type="text" data-new-icp="municipalityNumbers" value="0301" placeholder="0301" />
        </label>
        <label class="search-field">
          <span>Orgform</span>
          <input type="text" data-new-icp="organizationFormCodes" value="AS" placeholder="AS" />
        </label>
        <label class="search-field wide">
          <span>NACE-prefikser</span>
          <input type="text" data-new-icp="nacePrefixes" placeholder="62., 63.1, 70.22" />
        </label>
        <label class="checkbox-row">
          <input type="checkbox" data-new-icp="requireActive" checked />
          <span>Krev aktiv virksomhet</span>
        </label>
        <label class="checkbox-row">
          <input type="checkbox" data-new-icp="active" checked />
          <span>Aktiver profilen</span>
        </label>
        <label class="range-field wide">
          <span>Score boost: 10</span>
          <input type="range" min="0" max="35" step="1" data-new-icp="scoreBoost" value="10" />
        </label>
      </div>
    </section>
  `;
}

function renderIcpProfile(profile: IcpProfile): string {
  return `
    <article class="profile-card">
      <div class="profile-header">
        <div>
          <p class="eyebrow">${profile.active ? "Aktiv" : "Inaktiv"}</p>
          <h2>${escapeHtml(profile.name)}</h2>
          <p>${escapeHtml(profile.description)}</p>
        </div>
        <label class="toggle">
          <input type="checkbox" data-icp-active="${profile.id}" ${profile.active ? "checked" : ""} />
          <span></span>
        </label>
      </div>
      <div class="criteria-grid">
        <div>
          <span class="field-label">Kommune</span>
          <div class="tag-row">${profile.criteria.municipalityNumbers.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
        </div>
        <div>
          <span class="field-label">Orgform</span>
          <div class="tag-row">${profile.criteria.organizationFormCodes.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
        </div>
        <div class="wide">
          <span class="field-label">Næring</span>
          <div class="tag-row editable">
            ${profile.criteria.nacePrefixes
              .map(
                (prefix) => `
                  <button type="button" data-action="remove-prefix" data-icp-id="${profile.id}" data-prefix="${escapeHtml(prefix)}">
                    ${escapeHtml(nacePrefixLabel(prefix))}
                  </button>
                `,
              )
              .join("")}
          </div>
          <div class="inline-form">
            <select data-prefix-select="${profile.id}" aria-label="Velg næring">
              <option value="">Velg næring</option>
              ${naceCatalog
                .map((option) => {
                  const isSelected = profile.criteria.nacePrefixes.includes(option.prefix);
                  return `
                    <option value="${escapeHtml(option.prefix)}" ${isSelected ? "disabled" : ""}>
                      ${isSelected ? "Valgt: " : ""}${escapeHtml(nacePrefixLabel(option.prefix))}
                    </option>
                  `;
                })
                .join("")}
            </select>
            <button type="button" class="secondary-button" data-action="add-prefix" data-icp-id="${profile.id}">Legg til</button>
          </div>
        </div>
        <label class="checkbox-row wide">
          <input type="checkbox" data-require-active="${profile.id}" ${profile.criteria.requireActive ? "checked" : ""} />
          <span>Krev aktiv virksomhet</span>
        </label>
        <label class="range-field wide">
          <span>Score boost: ${profile.criteria.scoreBoost}</span>
          <input type="range" min="0" max="35" step="1" data-icp-boost="${profile.id}" value="${profile.criteria.scoreBoost}" />
        </label>
      </div>
      <div class="profile-footer">
        <span>${profile.hitCount} signaler</span>
        <span>${profile.conversionRate.toFixed(1)}% av import</span>
        <button type="button" class="text-button danger" data-action="remove-icp" data-icp-id="${profile.id}">Fjern profil</button>
      </div>
    </article>
  `;
}

function renderWatchlistsView(): string {
  return `
    <section class="panel intro-panel">
      <div>
        <p class="eyebrow">Prioritering</p>
        <h2>Watchlists</h2>
      </div>
      <div class="inline-stats">
        <span>${state.watchlists.reduce((sum, watchlist) => sum + watchlist.items.length, 0)} orgnr</span>
        <span>${state.watchlists.filter((watchlist) => watchlist.active).length} aktive lister</span>
        <span>${escapeHtml(state.apiStatus === "checking" ? "kobler til API" : state.apiMessage)}</span>
      </div>
    </section>

    <section class="watchlist-stack">
      ${state.watchlists.map(renderWatchlist).join("")}
    </section>
  `;
}

function renderWatchlist(watchlist: Watchlist): string {
  return `
    <article class="panel watchlist-card">
      <div class="profile-header">
        <div>
          <p class="eyebrow">${watchlist.active ? "Aktiv" : "Inaktiv"}</p>
          <h2>${escapeHtml(watchlist.name)}</h2>
          <p>${escapeHtml(watchlist.description)}</p>
        </div>
        <label class="toggle">
          <input type="checkbox" data-watchlist-active="${watchlist.id}" ${watchlist.active ? "checked" : ""} />
          <span></span>
        </label>
      </div>
      <label class="range-field watchlist-boost">
        <span>Score boost: ${watchlist.scoreBoost}</span>
        <input type="range" min="0" max="35" step="1" data-watchlist-boost="${watchlist.id}" value="${watchlist.scoreBoost}" />
      </label>
      <div class="profile-footer">
        <span>${watchlist.hitCount} signaler</span>
        <span>${watchlist.items.length} orgnr</span>
      </div>
      <div class="watchlist-table">
        <div class="table-row table-head">
          <span>Orgnr</span>
          <span>Navn</span>
          <span>Notat</span>
          <span></span>
        </div>
        ${watchlist.items
          .map(
            (item) => `
              <div class="table-row">
                <span>${escapeHtml(item.orgnr)}</span>
                <span>${escapeHtml(item.name)}</span>
                <span>${escapeHtml(item.note)}</span>
                <button type="button" class="text-button danger" data-action="remove-watchlist-item" data-watchlist-id="${watchlist.id}" data-orgnr="${escapeHtml(item.orgnr)}">Fjern</button>
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="add-watchlist-form">
        <input type="text" data-watchlist-orgnr="${watchlist.id}" inputmode="numeric" maxlength="9" placeholder="Orgnr" />
        <input type="text" data-watchlist-name="${watchlist.id}" placeholder="Virksomhetsnavn" />
        <input type="text" data-watchlist-note="${watchlist.id}" placeholder="Notat" />
        <button type="button" class="primary-button" data-action="add-watchlist-item" data-watchlist-id="${watchlist.id}">Legg til</button>
      </div>
    </article>
  `;
}

function renderEvaluationView(): string {
  const strongest = [...signals].sort((left, right) => right.score - left.score).slice(0, 3);
  const weakest = [...signals].sort((left, right) => left.score - right.score).slice(0, 3);

  return `
    <section class="metrics-grid" aria-label="Evalueringsnøkkeltall">
      ${metricCard("Change events", evaluationTotals.changeEvents, "organization_created")}
      ${metricCard("Signal-match", evaluationTotals.newOrganizationMatches, "new_organization_match")}
      ${metricCard("Konvertering", `${evaluationTotals.conversionRate}%`, "created -> match")}
      ${metricCard("Uten signal", evaluationTotals.createdEvents - evaluationTotals.newOrganizationMatches, "filtrert bort")}
    </section>

    <section class="dashboard-grid">
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Fordeling</p>
            <h2>Score og type</h2>
          </div>
        </div>
        <h3>Score</h3>
        ${barRows(scoreDistribution)}
        <h3 class="subheading">Signaltype</h3>
        ${barRows(signalTypeRows)}
      </article>

      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">NACE</p>
            <h2>Breakdown per ICP</h2>
          </div>
        </div>
        <div class="nace-list">
          ${naceBreakdowns
            .map(
              (breakdown) => `
                <div class="nace-group">
                  <div class="nace-heading">
                    <strong>${escapeHtml(breakdown.profileName)}</strong>
                    <span>${breakdown.total}</span>
                  </div>
                  ${barRows(breakdown.rows, breakdown.rows[0]?.count ?? 1)}
                </div>
              `,
            )
            .join("")}
        </div>
      </article>
    </section>

    <section class="dashboard-grid lower">
      <article class="panel">
        <p class="eyebrow">Sterke signaler</p>
        <div class="mini-list">${strongest.map(renderMiniSignal).join("")}</div>
      </article>
      <article class="panel">
        <p class="eyebrow">Svake signaler</p>
        <div class="mini-list">${weakest.map(renderMiniSignal).join("")}</div>
      </article>
    </section>
  `;
}

function renderMiniSignal(signal: Signal): string {
  return `
    <div class="mini-signal">
      <span class="mini-score ${scoreTone(signal.score)}">${signal.score}</span>
      <div>
        <strong>${escapeHtml(signal.organizationName)}</strong>
        <p>${escapeHtml(signal.reason)}</p>
      </div>
    </div>
  `;
}

function renderApiView(): string {
  return `
    <section class="api-layout">
      <article class="panel">
        <p class="eyebrow">REST</p>
        <h2>Signalfeed</h2>
        <p class="body-copy">
          Console-flaten er første klient for samme kontrakt som senere kan brukes av CRM,
          webhooks og eksterne integrasjoner.
        </p>
        ${renderCodeExample("latestSignals", "Hent siste signaler")}
        ${renderCodeExample("signalPayload", "Eksempelrespons")}
      </article>

      <aside class="panel">
        <p class="eyebrow">Senere</p>
        <h2>API keys og webhooks</h2>
        <div class="roadmap-list">
          <span>API keys</span>
          <span>Webhook-konfig</span>
          <span>OpenAPI schema</span>
          <span>Rate limits</span>
          <span>Audit events</span>
        </div>
        ${renderCodeExample("webhookPayload", "Webhook payload")}
      </aside>
    </section>

    <section class="panel crm-strip">
      <div>
        <p class="eyebrow">Full CRM</p>
        <h2>Signalene blir råstoffet, ikke hele CRM-et</h2>
        <p>
          Når API-et har god presisjon kan CRM-appen konsumere signalfeed som account-innsikt,
          mens Console fortsatt styrer scoring, evaluering og integrasjoner.
        </p>
      </div>
      <button type="button" class="primary-button" data-action="view" data-view="evaluation">Se evalueringsrapport</button>
    </section>
  `;
}

function renderCodeExample(id: keyof typeof apiExamples, title: string): string {
  return `
    <div class="code-example">
      <div class="code-heading">
        <strong>${escapeHtml(title)}</strong>
        <button type="button" class="secondary-button" data-action="copy-example" data-example-id="${id}">Kopier</button>
      </div>
      <pre><code>${escapeHtml(apiExamples[id])}</code></pre>
    </div>
  `;
}

function renderEmptyState(message: string): string {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(message)}</strong>
    </div>
  `;
}

function setToast(message: string): void {
  state.toast = message;
  render();
  window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2200);
}

function render(): void {
  appElement.innerHTML = renderApp();
}

function exportCsv(): void {
  const rows = activeSignals();
  const header = [
    "observed_at",
    "orgnr",
    "organization_name",
    "signal_type",
    "score",
    "confidence",
    "review",
    "nace_code",
    "matched_icp",
    "matched_watchlist",
    "reason",
    "suggested_action",
  ];
  const csvRows = [
    header,
    ...rows.map((signal) => [
      signal.observedAt,
      signal.orgnr,
      signal.organizationName,
      signal.signalType,
      String(signal.score),
      signal.confidence,
      state.reviews[signal.id] ?? "",
      signal.naceCode,
      evidenceLabels(signal, "icp_match").join(" | "),
      evidenceLabels(signal, "watchlist_match").join(" | "),
      signal.reason,
      signal.suggestedAction,
    ]),
  ];
  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "crm-signal-signals.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setToast(`${rows.length} signaler eksportert`);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function findIcp(id: string): IcpProfile | undefined {
  return state.icpProfiles.find((profile) => profile.id === id);
}

function findWatchlist(id: string): Watchlist | undefined {
  return state.watchlists.find((watchlist) => watchlist.id === id);
}

function newIcpInput(name: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`[data-new-icp="${name}"]`);
}

function parseTokenList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map((item) => item.trim().toUpperCase())
        .filter((item) => item.length > 0),
    ),
  ];
}

function parseNacePrefixes(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter((item) => /^[0-9]{2}(?:\.[0-9]*)?$/.test(item)),
    ),
  ];
}

function readNewIcpProfile(): IcpProfile | null {
  const name = newIcpInput("name")?.value.trim() ?? "";
  const description = newIcpInput("description")?.value.trim() ?? "";
  const municipalityNumbers = parseTokenList(
    newIcpInput("municipalityNumbers")?.value ?? "",
  );
  const organizationFormCodes = parseTokenList(
    newIcpInput("organizationFormCodes")?.value ?? "",
  );
  const nacePrefixes = parseNacePrefixes(newIcpInput("nacePrefixes")?.value ?? "");
  const scoreBoost = Number(newIcpInput("scoreBoost")?.value ?? 10);
  const requireActive = newIcpInput("requireActive")?.checked ?? true;
  const active = newIcpInput("active")?.checked ?? true;

  if (name.length < 3) {
    setToast("ICP-profilen trenger et tydelig navn");
    return null;
  }

  if (nacePrefixes.length === 0) {
    setToast("Legg inn minst ett gyldig NACE-prefiks, for eksempel 62. eller 70.22");
    return null;
  }

  return {
    id: `icp-custom-${Date.now().toString(36)}`,
    name,
    description: description || "Manuelt opprettet ICP-profil i Console.",
    active,
    hitCount: 0,
    conversionRate: 0,
    criteria: {
      municipalityNumbers,
      organizationFormCodes,
      nacePrefixes,
      requireActive,
      scoreBoost: Math.max(0, Math.min(35, Number.isFinite(scoreBoost) ? scoreBoost : 10)),
    },
  };
}

document.addEventListener("click", async (event) => {
  const target = (event.target as Element).closest<HTMLElement>("[data-action]");

  if (!target) {
    return;
  }

  const action = target.dataset.action;

  if (action === "view") {
    state.activeView = (target.dataset.view as ViewId) ?? "dashboard";
    render();
    return;
  }

  if (action === "set-review") {
    const signalId = target.dataset.signalId;
    const review = target.dataset.review as ReviewState | undefined;

    if (signalId && review) {
      if (state.reviews[signalId] === review) {
        delete state.reviews[signalId];
      } else {
        state.reviews[signalId] = review;
      }

      saveReviews();
      render();
    }

    return;
  }

  if (action === "review-filter") {
    state.filters.review = (target.dataset.reviewFilter as ReviewFilter) ?? "all";
    render();
    return;
  }

  if (action === "export-csv") {
    exportCsv();
    return;
  }

  if (action === "create-icp") {
    const profile = readNewIcpProfile();

    if (profile) {
      await createIcpProfile(profile);
    }

    return;
  }

  if (action === "remove-icp") {
    const profile = target.dataset.icpId ? findIcp(target.dataset.icpId) : undefined;

    if (profile) {
      await deleteIcpProfile(profile);
    }

    return;
  }

  if (action === "add-prefix") {
    const profile = target.dataset.icpId ? findIcp(target.dataset.icpId) : undefined;
    const select = profile
      ? document.querySelector<HTMLSelectElement>(`[data-prefix-select="${profile.id}"]`)
      : null;
    const prefix = select?.value.trim();

    if (profile && prefix && !profile.criteria.nacePrefixes.includes(prefix)) {
      profile.criteria.nacePrefixes.push(prefix);
      await persistIcpProfile(profile, `La til ${nacePrefixLabel(prefix)}`);
      return;
    }
  }

  if (action === "remove-prefix") {
    const profile = target.dataset.icpId ? findIcp(target.dataset.icpId) : undefined;
    const prefix = target.dataset.prefix;

    if (profile && prefix) {
      profile.criteria.nacePrefixes = profile.criteria.nacePrefixes.filter((item) => item !== prefix);
      await persistIcpProfile(profile);
    }

    return;
  }

  if (action === "add-watchlist-item") {
    const watchlist = target.dataset.watchlistId ? findWatchlist(target.dataset.watchlistId) : undefined;

    if (watchlist) {
      const orgnr = document.querySelector<HTMLInputElement>(`[data-watchlist-orgnr="${watchlist.id}"]`)?.value.trim() ?? "";
      const name = document.querySelector<HTMLInputElement>(`[data-watchlist-name="${watchlist.id}"]`)?.value.trim() ?? "";
      const note = document.querySelector<HTMLInputElement>(`[data-watchlist-note="${watchlist.id}"]`)?.value.trim() ?? "";

      if (/^[0-9]{9}$/.test(orgnr) && name.length > 0) {
        await addWatchlistItem(watchlist, {
          orgnr,
          name,
          note: note || "Manuelt lagt til i Console.",
        });
      } else {
        setToast("Orgnr må ha 9 siffer og navn må fylles ut");
      }
    }

    return;
  }

  if (action === "remove-watchlist-item") {
    const watchlist = target.dataset.watchlistId ? findWatchlist(target.dataset.watchlistId) : undefined;
    const orgnr = target.dataset.orgnr;

    if (watchlist && orgnr) {
      await removeWatchlistItem(watchlist, orgnr);
    }

    return;
  }

  if (action === "copy-example") {
    const id = target.dataset.exampleId as keyof typeof apiExamples | undefined;
    const payload = id ? apiExamples[id] : undefined;

    if (payload) {
      await navigator.clipboard.writeText(payload);
      setToast("Eksempel kopiert");
    }
  }
});

document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;

  if (target.dataset.filter === "query") {
    state.filters.query = target.value;
    render();
    return;
  }

  if (target.dataset.filter === "minScore") {
    state.filters.minScore = Number(target.value);
    render();
    return;
  }

  if (target.dataset.filter === "signalType") {
    state.filters.signalType = target.value;
    render();
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.icpBoost) {
    const profile = findIcp(target.dataset.icpBoost);

    if (profile) {
      profile.criteria.scoreBoost = Number(target.value);
      saveIcpProfiles();
      render();
    }

    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.newIcp === "scoreBoost") {
    const label = target.previousElementSibling;
    if (label) {
      label.textContent = `Score boost: ${target.value}`;
    }
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.watchlistBoost) {
    const watchlist = findWatchlist(target.dataset.watchlistBoost);

    if (watchlist) {
      watchlist.scoreBoost = Number(target.value);
      render();
    }
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target as HTMLInputElement;

  if (target.dataset.icpActive) {
    const profile = findIcp(target.dataset.icpActive);

    if (profile) {
      profile.active = target.checked;
      await persistIcpProfile(
        profile,
        `${profile.name} ${profile.active ? "aktivert" : "deaktivert"}`,
      );
    }

    return;
  }

  if (target.dataset.icpBoost) {
    const profile = findIcp(target.dataset.icpBoost);

    if (profile) {
      profile.criteria.scoreBoost = Number(target.value);
      await persistIcpProfile(profile, `${profile.name} score boost oppdatert`);
    }

    return;
  }

  if (target.dataset.requireActive) {
    const profile = findIcp(target.dataset.requireActive);

    if (profile) {
      profile.criteria.requireActive = target.checked;
      await persistIcpProfile(profile);
    }

    return;
  }

  if (target.dataset.watchlistActive) {
    const watchlist = findWatchlist(target.dataset.watchlistActive);

    if (watchlist) {
      watchlist.active = target.checked;
      await persistWatchlist(
        watchlist,
        `${watchlist.name} ${watchlist.active ? "aktivert" : "deaktivert"}`,
      );
    }

    return;
  }

  if (target.dataset.watchlistBoost) {
    const watchlist = findWatchlist(target.dataset.watchlistBoost);

    if (watchlist) {
      watchlist.scoreBoost = Number(target.value);
      await persistWatchlist(watchlist, `${watchlist.name} score boost oppdatert`);
    }
  }
});

render();
void hydrateSignalConfigFromApi();
