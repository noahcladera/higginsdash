/** Build book page URLs with optional court + slot params (iOS Link-first navigation). */
export function buildBookPageHref(
  basePath: string,
  params: {
    club: string;
    date: string;
    court?: string;
    slot?: string;
  },
): string {
  const search = new URLSearchParams({ club: params.club, date: params.date });
  if (params.court) search.set("court", params.court);
  if (params.slot) search.set("slot", params.slot);
  return `${basePath}?${search.toString()}`;
}
