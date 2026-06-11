import { canonicalJson } from "./canonical.js";

export type ChangeEventDraft = {
  eventType: string;
  fieldPath: string | null;
  oldValue: unknown;
  newValue: unknown;
  evidence: Record<string, unknown>;
};

type TrackedField = {
  fieldPath: string;
  eventType: string;
};

const trackedFields: TrackedField[] = [
  { fieldPath: "name", eventType: "name_changed" },
  {
    fieldPath: "organizationForm",
    eventType: "organization_form_changed",
  },
  { fieldPath: "status.active", eventType: "status_changed" },
  { fieldPath: "status.bankrupt", eventType: "status_changed" },
  { fieldPath: "status.underLiquidation", eventType: "status_changed" },
  { fieldPath: "status.deleted", eventType: "status_changed" },
  { fieldPath: "nace", eventType: "industry_code_changed" },
  { fieldPath: "geography", eventType: "geography_changed" },
  {
    fieldPath: "addresses.business",
    eventType: "business_address_changed",
  },
  { fieldPath: "addresses.postal", eventType: "postal_address_changed" },
  { fieldPath: "registeredAt", eventType: "registration_date_changed" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPath(value: unknown, fieldPath: string): unknown {
  return fieldPath.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[key];
  }, value);
}

function isEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function diffOrganizationSnapshots(
  oldPayload: Record<string, unknown>,
  newPayload: Record<string, unknown>,
): ChangeEventDraft[] {
  const drafts: ChangeEventDraft[] = [];

  for (const trackedField of trackedFields) {
    const oldValue = getPath(oldPayload, trackedField.fieldPath);
    const newValue = getPath(newPayload, trackedField.fieldPath);

    if (isEqual(oldValue, newValue)) {
      continue;
    }

    drafts.push({
      eventType: trackedField.eventType,
      fieldPath: trackedField.fieldPath,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      evidence: {
        strategy: "tracked_field_diff",
        fieldPath: trackedField.fieldPath,
      },
    });
  }

  return drafts;
}
