/**
 * Phone-number utilities used by the WhatsApp/Email contact buttons.
 *
 * We only ever need two operations:
 *
 *   1. Decide whether a string looks like a phone number we can dial
 *      ({@link isLikelyPhone}).
 *   2. Reduce a free-form number to the digits-only form WhatsApp's
 *      `wa.me` deep link expects ({@link normalizePhoneToWaDigits}).
 *
 * The codebase stores phones as-typed (`Person.phone`), so we apply a
 * pragmatic normalisation rather than a strict E.164 parse: strip
 * everything that isn't a digit, then assume Dutch prefixes for `0…`
 * input. That covers the realistic 95% of stored numbers without
 * pulling in `libphonenumber-js`.
 */

/** Default country code for numbers that come in starting with `0`. */
const DEFAULT_CC = "31"; // Netherlands

/**
 * Quick truthy check — is there enough here to even try to dial?
 * We require at least 6 digits after stripping noise.
 */
export function isLikelyPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D+/g, "");
  return digits.length >= 6;
}

/**
 * Convert any reasonable user-typed number into the digits-only string
 * that WhatsApp accepts in `https://wa.me/<digits>`.
 *
 *   "+31 6 12 34 56 78"   → "31612345678"
 *   "0612345678"          → "31612345678"
 *   "06-12345678"         → "31612345678"
 *   "+1 (415) 555-2671"   → "14155552671"
 *
 * Returns `null` if the input doesn't look like a phone number at all.
 */
export function normalizePhoneToWaDigits(
  raw: string | null | undefined,
): string | null {
  if (!isLikelyPhone(raw)) return null;
  let digits = raw!.replace(/\D+/g, "");
  // Inputs starting with `00` are the international-call escape — strip
  // it so we get plain country-code digits.
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Locally-formatted Dutch numbers (`0612…`) get the country code
  // prepended; once they look international (length 10+ and not
  // starting with 0) we leave them alone.
  if (digits.startsWith("0")) digits = `${DEFAULT_CC}${digits.slice(1)}`;
  // Sanity guard — anything below ~8 digits is too short to dial.
  if (digits.length < 8) return null;
  return digits;
}

/**
 * Build a `https://wa.me/...?text=...` URL with an optional pre-filled
 * message. Returns `null` if the phone number can't be normalised.
 *
 * The pre-filled text is purely contextual — we do NOT include the
 * sender's name. Keeping the message anonymous lets the same prefill
 * work whether the office, a coach, or an admin is reaching out, and
 * matches how parents already see the office contact (Higgins).
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  prefillMessage?: string,
): string | null {
  const digits = normalizePhoneToWaDigits(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  if (!prefillMessage) return base;
  return `${base}?text=${encodeURIComponent(prefillMessage)}`;
}

/**
 * Build a `mailto:` URL with optional subject + body. Returns `null`
 * when the address is missing/blank — callers can disable their button
 * accordingly.
 */
export function buildMailtoLink(
  email: string | null | undefined,
  opts?: { subject?: string; body?: string },
): string | null {
  if (!email || email.trim() === "") return null;
  const params: string[] = [];
  if (opts?.subject) params.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (opts?.body) params.push(`body=${encodeURIComponent(opts.body)}`);
  return `mailto:${email}${params.length > 0 ? `?${params.join("&")}` : ""}`;
}
