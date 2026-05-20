/**
 * Pure helper that decides whether a Person row has the complete
 * contact details we now require for active members. The same rule is
 * used by the portal interstitial (`requireProfileComplete`) and the
 * one-time `audit-incomplete-profiles` script so we always agree on
 * what "complete" means.
 *
 * Children (household role = `child`) are excluded from the check
 * because their address inherits from the household and they don't
 * need their own emergency contact — the parent's contact stands in.
 */

export interface ProfileCompletenessFields {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
}

export interface ProfileCompletenessResult {
  complete: boolean;
  /** Stable list of missing field keys (matches schema names). */
  missing: string[];
}

const REQUIRED_KEYS: Array<{
  key: keyof ProfileCompletenessFields;
  label: string;
}> = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "addressLine1", label: "Address" },
  { key: "postalCode", label: "Postal code" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "emergencyContactName", label: "Emergency contact name" },
  { key: "emergencyContactPhone", label: "Emergency contact phone" },
  {
    key: "emergencyContactRelationship",
    label: "Emergency contact relationship",
  },
];

export function checkProfileCompleteness(
  fields: ProfileCompletenessFields,
): ProfileCompletenessResult {
  const missing: string[] = [];
  for (const f of REQUIRED_KEYS) {
    const v = fields[f.key];
    const present =
      v != null &&
      (typeof v === "string" ? v.trim().length > 0 : true);
    if (!present) missing.push(f.label);
  }
  return { complete: missing.length === 0, missing };
}
