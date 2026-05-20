/**
 * Display helpers shared across the admin dashboard widgets.
 *
 * Kept here (not in `src/lib/format.ts`) to avoid leaking
 * dashboard-specific formatting choices into the rest of the codebase.
 * Times use Europe/Amsterdam to match the rest of the portal — see
 * `src/lib/booking/time.ts` for the rationale.
 */

const TZ = "Europe/Amsterdam";

const timeFmt = new Intl.DateTimeFormat("en-NL", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const longDateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

export function formatLongDate(d: Date): string {
  return longDateFmt.format(d);
}

export function fullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "—";
}

/**
 * Short relative timestamp ("just now", "12m ago", "3h ago", "2d ago",
 * then a calendar date). Same shape as the inbox feed's helper, copied
 * here so the dashboard widgets stay server-only (the inbox-feed
 * component is `"use client"`).
 */
export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(d);
}

export function deliveryModeLabel(mode: "at_club" | "onsite" | "pickup"): string {
  if (mode === "pickup") return "Pickup";
  if (mode === "onsite") return "Onsite";
  return "At club";
}

export function deliveryModeTone(
  mode: "at_club" | "onsite" | "pickup",
): "triaz" | "joint" | "warning" | "neutral" {
  if (mode === "pickup") return "joint";
  if (mode === "onsite") return "warning";
  return "triaz";
}
