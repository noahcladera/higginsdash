import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Map our stored country codes to libphonenumber ISO codes. */
const PHONE_COUNTRY_MAP: Record<string, CountryCode> = {
  NL: "NL",
  BE: "BE",
  DE: "DE",
  FR: "FR",
  UK: "GB",
  US: "US",
};

export function phoneDefaultCountry(storedCountry?: string | null): CountryCode {
  if (storedCountry && storedCountry in PHONE_COUNTRY_MAP) {
    return PHONE_COUNTRY_MAP[storedCountry]!;
  }
  return "NL";
}

/**
 * Validate and normalize to E.164 (+31612345678). Returns null when invalid.
 */
export function normalizePhoneE164(
  raw: string,
  defaultCountry: CountryCode = "NL",
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed?.isValid()) return null;
  return parsed.format("E.164");
}

export function isValidPhone(raw: string, defaultCountry: CountryCode = "NL"): boolean {
  return normalizePhoneE164(raw, defaultCountry) !== null;
}
