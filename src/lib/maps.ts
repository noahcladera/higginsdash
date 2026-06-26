/**
 * Build a one-click map link for a venue. Prefer an explicit `mapUrl`
 * stored on the row; otherwise fall back to a Google Maps search query
 * built from the venue name and address parts we have.
 */
export function venueMapUrl(v: {
  mapUrl?: string | null;
  name: string;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string | null {
  if (v.mapUrl?.trim()) return v.mapUrl.trim();

  const parts = [v.name, v.addressLine1, v.postalCode, v.city].filter(
    (p): p is string => Boolean(p?.trim()),
  );
  if (parts.length === 0) return null;

  return `https://maps.google.com/?q=${encodeURIComponent(parts.join(", "))}`;
}

/** Single-line postal address for display (no name). */
export function formatVenueAddress(v: {
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string | null {
  const line = [v.addressLine1, [v.postalCode, v.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

/** Full location string for ICS LOCATION fields. */
export function formatVenueLocation(v: {
  name: string;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  return [v.name, v.addressLine1, [v.postalCode, v.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}
