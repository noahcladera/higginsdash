/**
 * Shared country options for signup, profile, and org settings.
 * Values are ISO-style codes stored on Person/Household rows.
 */
export const COUNTRY_OPTIONS = [
  { value: "NL", label: "Netherlands" },
  { value: "BE", label: "Belgium" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "UK", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "OTHER", label: "Other" },
] as const;

export type CountryCode = (typeof COUNTRY_OPTIONS)[number]["value"];

export const COUNTRY_CODES = COUNTRY_OPTIONS.map((o) => o.value) as [
  CountryCode,
  ...CountryCode[],
];

export function countryLabel(code: string): string {
  return COUNTRY_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

export function isKnownCountry(code: string): code is CountryCode {
  return COUNTRY_CODES.includes(code as CountryCode);
}
