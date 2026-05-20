/**
 * Curated list of Amsterdam-area schools that show up in our roster.
 * Stored as free text in `students.school` so we can add new entries here
 * without a migration. The form picks "Other" to fall back to free text.
 *
 * Keep in alphabetical-ish order grouped by international vs Dutch.
 */

export type SchoolOption = {
  /** Stable identifier — what gets stored in the DB. */
  value: string;
  /** Human-friendly name used in dropdown + display. */
  label: string;
  /** Short description shown as a hint in the dropdown. */
  hint?: string;
};

export const KNOWN_SCHOOLS: ReadonlyArray<SchoolOption> = [
  // International schools (Amsterdam metro) ---------------------------------
  {
    value: "AICS",
    label: "AICS",
    hint: "Amsterdam International Community School",
  },
  {
    value: "Amity",
    label: "Amity",
    hint: "Amity International School Amsterdam",
  },
  {
    value: "BSA",
    label: "BSA",
    hint: "British School of Amsterdam",
  },
  {
    value: "IFS",
    label: "IFS",
    hint: "International French School (Lycée Vincent van Gogh)",
  },
  {
    value: "Kindercampus",
    label: "Kindercampus",
    hint: "Kindercampus Zuidas",
  },
  {
    value: "St. Joseph's",
    label: "St. Joseph's",
    hint: "Sint-Josephschool",
  },
];

const KNOWN_VALUES = new Set(KNOWN_SCHOOLS.map((s) => s.value));

/** True when `value` matches one of the curated schools. */
export function isKnownSchool(value: string | null | undefined): boolean {
  if (!value) return false;
  return KNOWN_VALUES.has(value);
}
