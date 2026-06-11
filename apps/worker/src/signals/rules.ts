export type ChangeEventForSignal = {
  id: string;
  organization_id: string;
  orgnr: string;
  organization_name: string;
  municipality_number: string | null;
  municipality_name: string | null;
  nace_code: string | null;
  nace_description: string | null;
  organization_form_code: string | null;
  is_active: boolean;
  is_bankrupt: boolean;
  is_under_liquidation: boolean;
  is_deleted: boolean;
  event_type: string;
  field_path: string | null;
  old_value: unknown;
  new_value: unknown;
  evidence: Record<string, unknown>;
  source: string;
  detected_at: Date;
};

export type GeneratedSignalDraft = {
  signalType: string;
  score: number;
  confidence: "low" | "medium" | "high";
  title: string;
  reason: string;
  evidence: Array<Record<string, unknown>>;
  suggestedAction: string;
};

export type IcpProfileForScoring = {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
};

export type WatchlistForScoring = {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
};

export type WatchlistItemForScoring = {
  watchlist_id: string;
  organization_id: string | null;
  orgnr: string | null;
};

export type SignalScoringContext = {
  icpProfiles: IcpProfileForScoring[];
  watchlists: WatchlistForScoring[];
  watchlistItems: WatchlistItemForScoring[];
};

type CriteriaMatch = {
  matches: boolean;
  reasons: string[];
};

type WatchlistMatch = {
  watchlist: WatchlistForScoring;
  matchType: "direct_item" | "criteria";
  reasons: string[];
};

const emptyScoringContext: SignalScoringContext = {
  icpProfiles: [],
  watchlists: [],
  watchlistItems: [],
};

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hasMatchCriteria(criteria: Record<string, unknown>): boolean {
  return (
    stringArray(criteria.municipalityNumbers).length > 0 ||
    stringArray(criteria.municipalityNames).length > 0 ||
    stringArray(criteria.organizationFormCodes).length > 0 ||
    stringArray(criteria.naceCodes).length > 0 ||
    stringArray(criteria.nacePrefixes).length > 0 ||
    criteria.requireActive === true
  );
}

function matchesCriteria(
  event: ChangeEventForSignal,
  criteria: Record<string, unknown>,
): CriteriaMatch {
  const reasons: string[] = [];
  const municipalityNumbers = stringArray(criteria.municipalityNumbers);
  const municipalityNames = stringArray(criteria.municipalityNames).map((value) =>
    value.toUpperCase(),
  );
  const organizationFormCodes = stringArray(criteria.organizationFormCodes);
  const naceCodes = stringArray(criteria.naceCodes);
  const nacePrefixes = stringArray(criteria.nacePrefixes);
  const requireActive = criteria.requireActive === true;

  if (
    municipalityNumbers.length > 0 &&
    (!event.municipality_number ||
      !municipalityNumbers.includes(event.municipality_number))
  ) {
    return { matches: false, reasons };
  }

  if (municipalityNumbers.length > 0) {
    reasons.push(`kommune ${event.municipality_number}`);
  }

  if (
    municipalityNames.length > 0 &&
    (!event.municipality_name ||
      !municipalityNames.includes(event.municipality_name.toUpperCase()))
  ) {
    return { matches: false, reasons };
  }

  if (municipalityNames.length > 0) {
    reasons.push(`kommune ${event.municipality_name}`);
  }

  if (
    organizationFormCodes.length > 0 &&
    (!event.organization_form_code ||
      !organizationFormCodes.includes(event.organization_form_code))
  ) {
    return { matches: false, reasons };
  }

  if (organizationFormCodes.length > 0) {
    reasons.push(`orgform ${event.organization_form_code}`);
  }

  if (
    naceCodes.length > 0 &&
    (!event.nace_code || !naceCodes.includes(event.nace_code))
  ) {
    return { matches: false, reasons };
  }

  if (naceCodes.length > 0) {
    reasons.push(`NACE ${event.nace_code}`);
  }

  if (
    nacePrefixes.length > 0 &&
    (!event.nace_code ||
      !nacePrefixes.some((prefix) => event.nace_code?.startsWith(prefix)))
  ) {
    return { matches: false, reasons };
  }

  if (nacePrefixes.length > 0) {
    reasons.push(`NACE-prefix ${event.nace_code}`);
  }

  if (requireActive && !event.is_active) {
    return { matches: false, reasons };
  }

  if (requireActive) {
    reasons.push("aktiv virksomhet");
  }

  return { matches: true, reasons };
}

function getMatchingIcpProfiles(
  event: ChangeEventForSignal,
  context: SignalScoringContext,
): Array<{ profile: IcpProfileForScoring; match: CriteriaMatch }> {
  return context.icpProfiles.flatMap((profile) => {
    if (!hasMatchCriteria(profile.criteria)) {
      return [];
    }

    const match = matchesCriteria(event, profile.criteria);
    return match.matches ? [{ profile, match }] : [];
  });
}

function getMatchingWatchlists(
  event: ChangeEventForSignal,
  context: SignalScoringContext,
): WatchlistMatch[] {
  return context.watchlists.flatMap<WatchlistMatch>((watchlist) => {
    const directMatch = context.watchlistItems.some(
      (item) =>
        item.watchlist_id === watchlist.id &&
        (item.organization_id === event.organization_id ||
          item.orgnr === event.orgnr),
    );

    if (directMatch) {
      return [
        {
          watchlist,
          matchType: "direct_item" as const,
          reasons: ["direkte watchlist-treff"],
        },
      ];
    }

    if (!hasMatchCriteria(watchlist.criteria)) {
      return [];
    }

    const criteriaMatch = matchesCriteria(event, watchlist.criteria);

    return criteriaMatch.matches
      ? [
          {
            watchlist,
            matchType: "criteria" as const,
            reasons: criteriaMatch.reasons,
          },
        ]
      : [];
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "tom verdi";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

function hasRiskyStatusChange(event: ChangeEventForSignal): boolean {
  if (event.field_path === "status.active" && event.new_value === false) {
    return true;
  }

  if (event.field_path === "status.bankrupt" && event.new_value === true) {
    return true;
  }

  if (
    event.field_path === "status.underLiquidation" &&
    event.new_value === true
  ) {
    return true;
  }

  if (event.field_path === "status.deleted" && event.new_value === true) {
    return true;
  }

  return false;
}

function baseEvidence(event: ChangeEventForSignal): Array<Record<string, unknown>> {
  return [
    {
      kind: "change_event",
      changeEventId: event.id,
      source: event.source,
      eventType: event.event_type,
      fieldPath: event.field_path,
      oldValue: event.old_value,
      newValue: event.new_value,
      detectedAt: event.detected_at.toISOString(),
    },
    {
      kind: "organization",
      orgnr: event.orgnr,
      name: event.organization_name,
    },
  ];
}

export function buildSignalForChangeEvent(
  event: ChangeEventForSignal,
  context: SignalScoringContext = emptyScoringContext,
): GeneratedSignalDraft | null {
  let signal: GeneratedSignalDraft | null = null;

  if (
    event.event_type === "business_address_changed" ||
    event.event_type === "postal_address_changed" ||
    event.event_type === "geography_changed"
  ) {
    signal = {
      signalType: "organization_address_changed",
      score: event.event_type === "geography_changed" ? 72 : 58,
      confidence: "medium",
      title: `${event.organization_name} har endret adresse/geografi`,
      reason:
        `${event.organization_name} har en registrert endring i ${event.field_path ?? "adresse/geografi"}. ` +
        "Dette kan være relevant for salgsoppfølging, leverandøroppfølging eller geografisk segmentering.",
      evidence: baseEvidence(event),
      suggestedAction: "Vurder om account, territorium, leverandørstatus eller oppfølgingsansvar bør oppdateres.",
    };
  } else if (event.event_type === "industry_code_changed") {
    signal = {
      signalType: "industry_code_changed",
      score: 76,
      confidence: "high",
      title: `${event.organization_name} har endret næringskode`,
      reason:
        `${event.organization_name} har endret næringsklassifisering fra ${formatValue(
          event.old_value,
        )} til ${formatValue(event.new_value)}. ` +
        "Dette kan påvirke ICP-match, segmentering og relevans i markedet.",
      evidence: baseEvidence(event),
      suggestedAction: "Sjekk om organisasjonen nå matcher eller faller ut av relevante ICP-profiler.",
    };
  } else if (event.event_type === "status_changed") {
    const risky = hasRiskyStatusChange(event);

    signal = {
      signalType: "organization_status_changed",
      score: risky ? 92 : 68,
      confidence: "high",
      title: `${event.organization_name} har endret foretaksstatus`,
      reason:
        `${event.organization_name} har en statusendring i ${event.field_path ?? "foretaksstatus"} fra ${formatValue(
          event.old_value,
        )} til ${formatValue(event.new_value)}. ` +
        (risky
          ? "Endringen kan indikere forhøyet risiko."
          : "Endringen kan være relevant for videre oppfølging."),
      evidence: baseEvidence(event),
      suggestedAction: risky
        ? "Prioriter manuell vurdering før videre salg, leveranse eller leverandørforpliktelser."
        : "Vurder om CRM-status, segment eller oppfølging bør oppdateres.",
    };
  } else if (event.event_type === "organization_form_changed") {
    signal = {
      signalType: "organization_form_changed",
      score: 62,
      confidence: "medium",
      title: `${event.organization_name} har endret organisasjonsform`,
      reason:
        `${event.organization_name} har endret organisasjonsform fra ${formatValue(
          event.old_value,
        )} til ${formatValue(event.new_value)}. ` +
        "Dette kan påvirke kvalifisering, risiko eller kundetype.",
      evidence: baseEvidence(event),
      suggestedAction: "Sjekk om account-rolle, segmentering eller leverandørvurdering bør endres.",
    };
  } else if (event.event_type === "name_changed") {
    signal = {
      signalType: "organization_name_changed",
      score: 42,
      confidence: "medium",
      title: `${event.orgnr} har endret navn`,
      reason:
        `Organisasjonen har endret navn fra ${formatValue(
          event.old_value,
        )} til ${formatValue(event.new_value)}. ` +
        "Dette kan være relevant for datakvalitet og CRM-oppdatering.",
      evidence: baseEvidence(event),
      suggestedAction: "Oppdater visningsnavn, søkeord og eventuelle manuelle CRM-notater ved behov.",
    };
  } else if (event.event_type === "organization_created") {
    signal = {
      signalType: "new_organization_match",
      score: 60,
      confidence: "medium",
      title: `${event.organization_name} er en ny relevant virksomhet`,
      reason:
        `${event.organization_name} ble først observert i Brreg-importen. ` +
        "Virksomheten er bare løftet frem fordi den matcher en aktiv ICP-profil eller watchlist.",
      evidence: baseEvidence(event),
      suggestedAction: "Vurder om virksomheten bør legges til som prospect, leverandør, partner eller account i CRM.",
    };
  }

  if (!signal) {
    return null;
  }

  const matchingProfiles = getMatchingIcpProfiles(event, context);
  const matchingWatchlists = getMatchingWatchlists(event, context);

  if (
    signal.signalType === "new_organization_match" &&
    matchingProfiles.length === 0 &&
    matchingWatchlists.length === 0
  ) {
    return null;
  }

  const icpBoost = matchingProfiles.reduce(
    (sum, item) => sum + numberValue(item.profile.criteria.scoreBoost, 12),
    0,
  );
  const watchlistBoost = matchingWatchlists.reduce(
    (sum, item) => sum + numberValue(item.watchlist.criteria.scoreBoost, 18),
    0,
  );
  const scoreBoost = Math.min(icpBoost + watchlistBoost, 35);

  if (matchingProfiles.length > 0) {
    signal.reason += ` Matcher ICP-profil ${matchingProfiles
      .map((item) => `"${item.profile.name}"`)
      .join(", ")}.`;
    signal.evidence.push(
      ...matchingProfiles.map((item) => ({
        kind: "icp_match",
        profileId: item.profile.id,
        profileName: item.profile.name,
        reasons: item.match.reasons,
      })),
    );
  }

  if (matchingWatchlists.length > 0) {
    signal.reason += ` Finnes på watchlist ${matchingWatchlists
      .map((item) => `"${item.watchlist.name}"`)
      .join(", ")}.`;
    signal.evidence.push(
      ...matchingWatchlists.map((item) => ({
        kind: "watchlist_match",
        watchlistId: item.watchlist.id,
        watchlistName: item.watchlist.name,
        matchType: item.matchType,
        reasons: item.reasons,
      })),
    );
  }

  if (scoreBoost > 0) {
    signal.score = Math.min(signal.score + scoreBoost, 100);
  }

  if (signal.score >= 75) {
    signal.confidence = "high";
  }

  if (matchingProfiles.length > 0 || matchingWatchlists.length > 0) {
    signal.suggestedAction +=
      " Prioriter denne fordi virksomheten matcher aktiv profil/watchlist.";
  }

  return signal;
}
