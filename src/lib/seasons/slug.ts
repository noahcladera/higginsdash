/**
 * Slug helper for catalog seasons. Names are manual; slugs are derived
 * from the name unless the admin overrides them on edit.
 */
export function slugifySeasonName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const SEASON_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
