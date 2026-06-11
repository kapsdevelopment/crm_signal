import type { BrregEntity } from "./client.js";

export type NormalizedOrganization = {
  orgnr: string;
  name: string;
  organizationFormCode: string | null;
  organizationFormDescription: string | null;
  isActive: boolean;
  isBankrupt: boolean;
  isUnderLiquidation: boolean;
  isDeleted: boolean;
  naceCode: string | null;
  naceDescription: string | null;
  municipalityNumber: string | null;
  municipalityName: string | null;
  countyNumber: string | null;
  countyName: string | null;
  businessAddress: Record<string, unknown>;
  postalAddress: Record<string, unknown>;
  registeredAt: string | null;
  sourceUpdatedAt: string | null;
  canonicalPayload: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function getNestedString(
  record: Record<string, unknown>,
  objectKey: string,
  valueKey: string,
): string | null {
  const nested = asRecord(record[objectKey]);
  return nested ? asString(nested[valueKey]) : null;
}

function getAddress(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return asRecord(record[key]) ?? {};
}

export function normalizeBrregEntity(
  entity: BrregEntity,
): NormalizedOrganization {
  const orgnr = asString(entity.organisasjonsnummer);
  const name = asString(entity.navn);

  if (!orgnr || !/^[0-9]{9}$/.test(orgnr)) {
    throw new Error(`Brreg entity has invalid organisasjonsnummer: ${orgnr}`);
  }

  if (!name) {
    throw new Error(`Brreg entity ${orgnr} is missing navn`);
  }

  const businessAddress = getAddress(entity, "forretningsadresse");
  const postalAddress = getAddress(entity, "postadresse");
  const slettedato = asString(entity.slettedato);
  const isBankrupt = asBoolean(entity.konkurs);
  const isUnderLiquidation =
    asBoolean(entity.underAvvikling) ||
    asBoolean(entity.underTvangsavviklingEllerTvangsopplosning);
  const isDeleted = slettedato !== null;
  const municipalityNumber =
    asString(businessAddress.kommunenummer) ??
    asString(postalAddress.kommunenummer);
  const municipalityName =
    asString(businessAddress.kommune) ?? asString(postalAddress.kommune);

  const normalized: NormalizedOrganization = {
    orgnr,
    name,
    organizationFormCode: getNestedString(entity, "organisasjonsform", "kode"),
    organizationFormDescription: getNestedString(
      entity,
      "organisasjonsform",
      "beskrivelse",
    ),
    isActive: !isDeleted,
    isBankrupt,
    isUnderLiquidation,
    isDeleted,
    naceCode: getNestedString(entity, "naeringskode1", "kode"),
    naceDescription: getNestedString(entity, "naeringskode1", "beskrivelse"),
    municipalityNumber,
    municipalityName,
    countyNumber: null,
    countyName: null,
    businessAddress,
    postalAddress,
    registeredAt: asString(entity.registreringsdatoEnhetsregisteret),
    sourceUpdatedAt: null,
    canonicalPayload: {},
  };

  normalized.canonicalPayload = {
    orgnr: normalized.orgnr,
    name: normalized.name,
    organizationForm: {
      code: normalized.organizationFormCode,
      description: normalized.organizationFormDescription,
    },
    status: {
      active: normalized.isActive,
      bankrupt: normalized.isBankrupt,
      underLiquidation: normalized.isUnderLiquidation,
      deleted: normalized.isDeleted,
      slettedato,
    },
    nace: {
      code: normalized.naceCode,
      description: normalized.naceDescription,
    },
    geography: {
      municipalityNumber: normalized.municipalityNumber,
      municipalityName: normalized.municipalityName,
      countyNumber: normalized.countyNumber,
      countyName: normalized.countyName,
    },
    addresses: {
      business: normalized.businessAddress,
      postal: normalized.postalAddress,
    },
    registeredAt: normalized.registeredAt,
  };

  return normalized;
}
