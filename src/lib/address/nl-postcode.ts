/** Dutch postcode: 1234 AB (space optional). */
export const NL_POSTCODE_REGEX = /^\d{4}\s?[A-Za-z]{2}$/;

/** Strip spaces and uppercase letters for API queries. */
export function normalizeNlPostcode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Format as "1234 AB" while the user types. */
export function formatNlPostcodeInput(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toUpperCase().slice(0, 6);
  if (compact.length <= 4) return compact;
  return `${compact.slice(0, 4)} ${compact.slice(4)}`;
}

export function isValidNlPostcode(raw: string): boolean {
  return NL_POSTCODE_REGEX.test(raw.trim());
}
