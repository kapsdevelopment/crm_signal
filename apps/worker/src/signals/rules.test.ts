import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSignalForChangeEvent } from "./rules.js";
import type { ChangeEventForSignal, SignalScoringContext } from "./rules.js";

const baseEvent: ChangeEventForSignal = {
  id: "change_1",
  organization_id: "org_1",
  orgnr: "999999999",
  organization_name: "TESTBEDRIFT AS",
  municipality_number: "0301",
  municipality_name: "OSLO",
  nace_code: "62.010",
  nace_description: "Programmeringstjenester",
  organization_form_code: "AS",
  is_active: true,
  is_bankrupt: false,
  is_under_liquidation: false,
  is_deleted: false,
  event_type: "business_address_changed",
  field_path: "addresses.business",
  old_value: { adresse: ["Testveien 1"] },
  new_value: { adresse: ["Nyveien 2"] },
  evidence: {},
  source: "brreg",
  detected_at: new Date("2026-01-01T00:00:00Z"),
};

test("builds a basic address changed signal", () => {
  const signal = buildSignalForChangeEvent(baseEvent);

  assert.ok(signal);
  assert.equal(signal.signalType, "organization_address_changed");
  assert.equal(signal.score, 58);
  assert.equal(signal.confidence, "medium");
  assert.equal(signal.evidence.some((item) => item.kind === "change_event"), true);
});

test("boosts score and explanation for matching ICP and watchlist", () => {
  const context: SignalScoringContext = {
    icpProfiles: [
      {
        id: "icp_1",
        name: "Oslo IT",
        criteria: {
          municipalityNumbers: ["0301"],
          nacePrefixes: ["62."],
          organizationFormCodes: ["AS"],
          requireActive: true,
          scoreBoost: 12,
        },
      },
    ],
    watchlists: [
      {
        id: "watchlist_1",
        name: "Prioriterte Oslo-selskaper",
        criteria: { scoreBoost: 18 },
      },
    ],
    watchlistItems: [
      {
        watchlist_id: "watchlist_1",
        organization_id: "org_1",
        orgnr: "999999999",
      },
    ],
  };

  const signal = buildSignalForChangeEvent(baseEvent, context);

  assert.ok(signal);
  assert.equal(signal.score, 88);
  assert.equal(signal.confidence, "high");
  assert.match(signal.reason, /Matcher ICP-profil "Oslo IT"/);
  assert.match(signal.reason, /Finnes på watchlist "Prioriterte Oslo-selskaper"/);
  assert.equal(signal.evidence.some((item) => item.kind === "icp_match"), true);
  assert.equal(
    signal.evidence.some((item) => item.kind === "watchlist_match"),
    true,
  );
});

test("creates high confidence risk signal for bankruptcy status change", () => {
  const signal = buildSignalForChangeEvent({
    ...baseEvent,
    event_type: "status_changed",
    field_path: "status.bankrupt",
    old_value: false,
    new_value: true,
  });

  assert.ok(signal);
  assert.equal(signal.signalType, "organization_status_changed");
  assert.equal(signal.score, 92);
  assert.equal(signal.confidence, "high");
  assert.match(signal.reason, /forhøyet risiko/);
});

test("does not treat scoreBoost-only watchlist criteria as a match", () => {
  const context: SignalScoringContext = {
    icpProfiles: [],
    watchlists: [
      {
        id: "watchlist_1",
        name: "Prioriterte Oslo-selskaper",
        criteria: { scoreBoost: 18 },
      },
    ],
    watchlistItems: [],
  };

  const signal = buildSignalForChangeEvent(baseEvent, context);

  assert.ok(signal);
  assert.equal(signal.score, 58);
  assert.equal(
    signal.evidence.some((item) => item.kind === "watchlist_match"),
    false,
  );
});

test("does not treat scoreBoost-only ICP criteria as a match", () => {
  const context: SignalScoringContext = {
    icpProfiles: [
      {
        id: "icp_1",
        name: "Score-only ICP",
        criteria: { scoreBoost: 12 },
      },
    ],
    watchlists: [],
    watchlistItems: [],
  };

  const signal = buildSignalForChangeEvent(
    {
      ...baseEvent,
      event_type: "organization_created",
      field_path: null,
      old_value: null,
      new_value: {
        orgnr: baseEvent.orgnr,
        name: baseEvent.organization_name,
      },
    },
    context,
  );

  assert.equal(signal, null);
});

test("skips new organization events without ICP or watchlist match", () => {
  const signal = buildSignalForChangeEvent({
    ...baseEvent,
    event_type: "organization_created",
    field_path: null,
    old_value: null,
    new_value: {
      orgnr: baseEvent.orgnr,
      name: baseEvent.organization_name,
    },
  });

  assert.equal(signal, null);
});

test("builds new organization match signal for matching ICP profile", () => {
  const context: SignalScoringContext = {
    icpProfiles: [
      {
        id: "icp_1",
        name: "Oslo IT",
        criteria: {
          municipalityNumbers: ["0301"],
          nacePrefixes: ["62."],
          organizationFormCodes: ["AS"],
          requireActive: true,
          scoreBoost: 12,
        },
      },
    ],
    watchlists: [],
    watchlistItems: [],
  };
  const signal = buildSignalForChangeEvent(
    {
      ...baseEvent,
      event_type: "organization_created",
      field_path: null,
      old_value: null,
      new_value: {
        orgnr: baseEvent.orgnr,
        name: baseEvent.organization_name,
      },
    },
    context,
  );

  assert.ok(signal);
  assert.equal(signal.signalType, "new_organization_match");
  assert.equal(signal.score, 72);
  assert.match(signal.reason, /Matcher ICP-profil "Oslo IT"/);
  assert.equal(signal.evidence.some((item) => item.kind === "icp_match"), true);
});
