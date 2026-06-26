/**
 * Build subscribe URLs for calendar feed tokens.
 *
 * Google Calendar accepts an HTTPS feed URL via `cid=`.
 * Apple Calendar prefers `webcal://` so the OS opens Calendar directly.
 */

export function calendarFeedHttpsUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/calendar/${token}`;
}

export function calendarFeedWebcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https?:/, "webcal:");
}

export function googleCalendarSubscribeUrl(httpsUrl: string): string {
  return `https://www.google.com/calendar/render?cid=${encodeURIComponent(httpsUrl)}`;
}
