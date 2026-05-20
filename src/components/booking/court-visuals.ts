/**
 * Per-court visual styling derived from `surface` + `qualityTier`.
 *
 *   - widthClass:       column width on the calendar (slim walk-on, premium
 *                       grass / clay get the most real estate)
 *   - surfaceTintClass: very subtle surface tint applied to free cells and
 *                       the column header so you can read court type at a
 *                       glance (greenish for grass, terracotta for clay)
 *   - headerHintClass:  optional hint colour for the column header text
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
      // Very faint emerald wash for grass courts (Triaz 3/4).
      return "bg-emerald-50/60";
    case "clay":
      // Subtle terracotta wash for red-clay courts (Randwijck).
      return "bg-orange-50/70";
    case "indoor_hard":
    case "hard":
      return "bg-sky-50/40";
    case "multi_use":
    case "other":
    default:
      return "";
  }
}
