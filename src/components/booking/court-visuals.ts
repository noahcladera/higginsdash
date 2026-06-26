/**
 * Per-court visual styling derived from `surface` + `qualityTier`.
 *
 *   - widthClass:       column width on the calendar (slim walk-on, premium
 *                       grass / clay get the most real estate)
 *   - surfaceTintClass: very subtle surface tint applied to free cells and
 *                       the column header so you can read court type at a
 *                       glance (greenish for grass, terracotta for clay)
 *
 * These are pure helpers (no React) so they work for both day and week
 * views and any future renderer.
 */

export type CourtVisual = {
  widthClass: string;
  surfaceTintClass: string;
};

interface CourtLike {
  surface?: string;
  qualityTier?: string;
  isBookable: boolean;
}

export function getCourtVisual(court: CourtLike): CourtVisual {
  const widthClass = widthFor(court);
  const surfaceTintClass = surfaceTintFor(court);
  return { widthClass, surfaceTintClass };
}

const DAY_NAMES =
  "Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";

/** One clock time or a range, e.g. `10:30`, `4-5:30PM`, `10:30-12:00PM`. */
const CLOCK =
  String.raw`\d{1,2}(?::\d{2})?(?:\s*[-–]\s*\d{1,2}(?::\d{2})?)?(?:\s*(?:AM|PM))?`;

/** Strip redundant bits for compact admin court-grid labels. */
export function shortenAdminClassLabel(label: string): string {
  const original = label.trim();
  let s = original
    .replace(/\s+S\.V\.\s*Triaz\s+\d{4}$/i, "")
    .replace(/\s+Tennispark\s+Randwijck\s+\d{4}$/i, "")
    .replace(/\s+Triaz\s+\d{4}$/i, "")
    .replace(/\s+Randwijck\s+\d{4}$/i, "")
    .replace(/\s+\d{4}$/, "")
    .trim();

  // Season prefix is visible from the date column (Spring 2, Spring 2026, …).
  s = s.replace(
    /^(?:Spring|Summer|Fall|Winter|Autumn)(?:\s+\d+)?(?:\s+\d{4})?(?:\s*·\s*)?/i,
    "",
  );

  // Day + session time — the row already shows this slot's time range.
  const dayTime = new RegExp(
    String.raw`\s*\.?\s*(?:${DAY_NAMES})\.?\s+${CLOCK}(?:\s*[-–]\s*${CLOCK})?`,
    "gi",
  );
  s = s.replace(dayTime, " ");

  // Venue / delivery hints — the grid is grouped by club.
  s = s
    .replace(/\s+(?:S\.V\.\s*)?(?:Triaz|Tennispark Randwijck|Randwijck)\b/gi, " ")
    .replace(/\b(?:on-site|pickup(?:\s*→\s*Triaz)?)\b/gi, " ");

  s = s.replace(/\s*·\s*/g, " ").replace(/\s+/g, " ").trim();

  const MAX = 28;
  if (s.length > MAX) {
    s = `${s.slice(0, MAX - 1).trimEnd()}…`;
  }

  return s || original;
}

/** Extra min-width when a column's longest label exceeds thresholds. */
export function contentMinWidthClass(labelLength: number): string {
  if (labelLength > 36) return "min-w-[12rem]";
  if (labelLength > 24) return "min-w-[10rem]";
  if (labelLength > 18) return "min-w-[8rem]";
  return "";
}

export function mergeCourtWidthClasses(
  baseWidth: string,
  contentMinWidth: string,
): string {
  return contentMinWidth ? `${baseWidth} ${contentMinWidth}` : baseWidth;
}

function widthFor(court: CourtLike): string {
  if (!court.isBookable) return "w-7"; // walk-on: ~28px — vertical label
  switch (court.qualityTier) {
    case "premium":
      return "w-32"; // ~128px — Triaz 3/4 grass + Randwijck clay
    case "standard":
      return "w-24"; // ~96px
    case "practice_only":
      return "w-20"; // ~80px — Triaz 2 ash
    case "walk_on_only":
      return "w-7";
    default:
      return "w-24";
  }
}

function surfaceTintFor(court: CourtLike): string {
  switch (court.surface) {
    case "grass":
      return "bg-[var(--triaz-soft)]/60";
    case "clay":
      return "bg-[var(--randwijck-soft)]/70";
    case "indoor_hard":
    case "hard":
      return "bg-[var(--delivery-onsite-soft)]/40";
    case "multi_use":
    case "other":
    default:
      return "";
  }
}
