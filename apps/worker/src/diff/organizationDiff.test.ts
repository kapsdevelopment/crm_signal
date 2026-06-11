import assert from "node:assert/strict";
import { test } from "node:test";
import { diffOrganizationSnapshots } from "./organizationDiff.js";

const basePayload = {
  name: "TESTBEDRIFT AS",
  organizationForm: { code: "AS", description: "Aksjeselskap" },
  status: {
    active: true,
    bankrupt: false,
    underLiquidation: false,
    deleted: false,
  },
  nace: { code: "62.010", description: "Programmeringstjenester" },
  geography: { municipalityNumber: "0301", municipalityName: "OSLO" },
  addresses: {
    business: {
      adresse: ["Testveien 1"],
      kommunenummer: "0301",
      kommune: "OSLO",
    },
    postal: {},
  },
};

test("returns no change events for identical payloads", () => {
  const changes = diffOrganizationSnapshots(basePayload, structuredClone(basePayload));
  assert.equal(changes.length, 0);
});

test("detects business address, industry and status changes", () => {
  const nextPayload = structuredClone(basePayload);
  nextPayload.addresses.business.adresse = ["Nyveien 2"];
  nextPayload.nace = { code: "70.220", description: "Bedriftsrådgivning" };
  nextPayload.status.bankrupt = true;

  const changes = diffOrganizationSnapshots(basePayload, nextPayload);
  assert.deepEqual(
    changes.map((change) => change.eventType).sort(),
    [
      "business_address_changed",
      "industry_code_changed",
      "status_changed",
    ],
  );
});
