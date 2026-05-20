/** Default hourly rate in EUR when no per-coach override is set. */
export const COACH_COURT_RATE_PER_HOUR = 28;

/**
 * Return the price in EUR (rounded to 2 decimals) for the given duration at
 * `ratePerHour`. When `ratePerHour` is omitted, uses the global default.
 */
export function priceForDurationMinutes(
  minutes: number,
  ratePerHour: number = COACH_COURT_RATE_PER_HOUR,
): number {
  if (minutes <= 0) return 0;
  const raw = (ratePerHour * minutes) / 60;
  return Math.round(raw * 100) / 100;
}

/** Format a EUR amount for display (no currency conversion). */
export function formatEur(amountEur: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amountEur);
}
