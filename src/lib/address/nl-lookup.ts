import "server-only";

import { normalizeNlPostcode } from "@/lib/address/nl-postcode";

const PDOK_BASE =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

export interface NlAddressLookupResult {
  street: string;
  city: string;
  postalCode: string;
}

interface PdokDoc {
  straatnaam?: string;
  woonplaatsnaam?: string;
  postcode?: string;
  huisnummer?: string;
  huisletter?: string;
  huisnummertoevoeging?: string;
}

interface PdokResponse {
  response?: {
    docs?: PdokDoc[];
  };
}

/**
 * Look up a Dutch address via PDOK Locatieserver (official BAG data).
 * Returns null when no matching address is found.
 */
export async function lookupNlAddress(
  postcode: string,
  houseNumber: string,
  suffix?: string,
): Promise<NlAddressLookupResult | null> {
  const normalizedPostcode = normalizeNlPostcode(postcode);
  const number = houseNumber.trim();
  if (!normalizedPostcode || !number) return null;

  const query = `${normalizedPostcode} ${number}`.trim();
  const url = new URL(PDOK_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("fq", "type:adres");
  url.searchParams.set("rows", "10");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as PdokResponse;
  const docs = data.response?.docs ?? [];
  if (docs.length === 0) return null;

  const suffixNorm = suffix?.trim().toLowerCase() ?? "";
  let match = docs[0]!;

  if (suffixNorm) {
    const withSuffix = docs.find((doc) => {
      const letter = doc.huisletter?.toLowerCase() ?? "";
      const addition = doc.huisnummertoevoeging?.toLowerCase() ?? "";
      return (
        letter === suffixNorm ||
        addition === suffixNorm ||
        `${letter}${addition}` === suffixNorm ||
        `${letter} ${addition}`.trim() === suffixNorm
      );
    });
    if (withSuffix) match = withSuffix;
  }

  const street = match.straatnaam?.trim();
  const city = match.woonplaatsnaam?.trim();
  if (!street || !city) return null;

  const formattedPostcode = match.postcode
    ? `${match.postcode.slice(0, 4)} ${match.postcode.slice(4)}`.trim()
    : `${normalizedPostcode.slice(0, 4)} ${normalizedPostcode.slice(4)}`;

  return {
    street,
    city,
    postalCode: formattedPostcode,
  };
}
