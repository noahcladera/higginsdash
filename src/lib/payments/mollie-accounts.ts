/**
 * Mollie account routing.
 *
 * Triaz operates as a separate legal/financial entity from Higgins;
 * money for a Triaz membership lands in Triaz's bank account, while
 * everything else (Randwijck memberships, lessons, court bookings,
 * coach AR invoices) lands in the Higgins/Randwijck account.
 *
 * Today nothing actually talks to Mollie — every checkout is stubbed
 * through `/demo/mollie/[id]`. This module is the routing helper so
 * once real Mollie credentials show up, all that changes is:
 *
 *   1. Two env vars:
 *        MOLLIE_API_KEY_TRIAZ     // for triaz memberships
 *        MOLLIE_API_KEY_HIGGINS   // for everything else
 *   2. The function bodies in `src/lib/payments/index.ts` swap from
 *      stub URLs to a real `mollie.payments.create` call, picking the
 *      client by the `account` parameter.
 *
 * Adding a third account later (e.g. a separate KV Triaz korfball
 * club account) means extending `MollieAccount`, `MOLLIE_ACCOUNT_LABELS`,
 * and the `getMollieAccountFor*` helpers — call sites already pass the
 * routing input.
 */

export type MollieAccount = "triaz" | "higgins";

export const MOLLIE_ACCOUNT_LABELS: Record<MollieAccount, string> = {
  triaz: "Triaz",
  higgins: "Higgins",
};

/**
 * Pick the right Mollie account for a membership purchase.
 *
 * Single-club memberships route by their club:
 *   - Triaz membership      → Triaz account
 *   - Randwijck membership  → Higgins account (we own/run Randwijck)
 *
 * Joint (double-club) memberships are *split* into two payments by
 * the caller (see `splitJointPrice` in `src/lib/portal/membership-pricing.ts`),
 * each routed individually through this helper.
 */
export function getMollieAccountForMembership(input: {
  clubSlug: "triaz" | "randwijck";
}): MollieAccount {
  return input.clubSlug === "triaz" ? "triaz" : "higgins";
}

/**
 * Pick the Mollie account for any non-membership flow (lessons,
 * court bookings, coach AR invoices). Always Higgins today —
 * Triaz doesn't sell lessons or court time directly through us.
 *
 * Kept as a function so future per-venue overrides land in one place
 * instead of scattered conditionals.
 */
export function getMollieAccountForOperations(): MollieAccount {
  return "higgins";
}
