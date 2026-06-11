import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBrregEntity } from "./normalize.js";

test("normalizes a Brreg entity into the internal organization model", () => {
  const normalized = normalizeBrregEntity({
    organisasjonsnummer: "999999999",
    navn: "TESTBEDRIFT AS",
    organisasjonsform: {
      kode: "AS",
      beskrivelse: "Aksjeselskap",
    },
    naeringskode1: {
      kode: "62.010",
      beskrivelse: "Programmeringstjenester",
    },
    forretningsadresse: {
      adresse: ["Testveien 1"],
      postnummer: "0150",
      poststed: "OSLO",
      kommune: "OSLO",
      kommunenummer: "0301",
      land: "Norge",
      landkode: "NO",
    },
    registreringsdatoEnhetsregisteret: "2024-01-02",
    konkurs: false,
    underAvvikling: false,
    underTvangsavviklingEllerTvangsopplosning: false,
  });

  assert.equal(normalized.orgnr, "999999999");
  assert.equal(normalized.name, "TESTBEDRIFT AS");
  assert.equal(normalized.organizationFormCode, "AS");
  assert.equal(normalized.naceCode, "62.010");
  assert.equal(normalized.municipalityNumber, "0301");
  assert.equal(normalized.isActive, true);
  assert.deepEqual(normalized.canonicalPayload.geography, {
    municipalityNumber: "0301",
    municipalityName: "OSLO",
    countyNumber: null,
    countyName: null,
  });
});

test("marks deleted entities as inactive", () => {
  const normalized = normalizeBrregEntity({
    organisasjonsnummer: "999999998",
    navn: "SLETTET AS",
    slettedato: "2025-01-01",
  });

  assert.equal(normalized.isDeleted, true);
  assert.equal(normalized.isActive, false);
});
