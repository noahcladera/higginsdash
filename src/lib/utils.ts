import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function isPrefixMatch(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Pick the single "active" nav href for a given pathname.
 *
 * Matches an href when the pathname equals it or starts with `href + "/"`
 * (so `/coach/book` does NOT match `/coach/bookings`). When multiple hrefs
 * match (e.g. `/admin/bookings` and `/admin/bookings/deletions` on the
 * deletions page), the longest one wins so only the most specific item
 * appears selected.
 */
export function pickActiveHref(
  pathname: string,
  hrefs: readonly string[],
): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    if (!isPrefixMatch(pathname, h)) continue;
    if (best === null || h.length > best.length) best = h;
  }
  return best;
}
