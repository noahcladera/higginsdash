/**
 * Payment-provider stub. Mollie integration lives in a future slice; this
 * file holds a function-shaped placeholder so the booking action can already
 * call it without thinking about the real wiring.
 *
 * Returning a synthetic checkout URL keeps the booking flow's optimistic
 * expectations (booking is created in `pending` payment state, user is
 * pointed at a URL to finish) without touching network APIs.
 *
 * For the in-person demo, member-facing checkouts are handled up the
 * stack by `/demo/mollie/[id]` and the wiring in `startDemoCheckout`
 * — this stub stays around so non-demo callers (and any future
 * server-side hooks) still have a function to call. Console logging
 * is suppressed unless `NEXT_PUBLIC_DEMO_MOLLIE` is explicitly set to
 * `"false"`.
 *
 * The optional `account` parameter on every entry point is the routing
 * input for the future "real Mollie" wiring — see
 * `src/lib/payments/mollie-accounts.ts`. Today it only shows up in the
 * stub log so we can verify routing is correct in dev.
 */

import {
  type MollieAccount,
  getMollieAccountForOperations,
} from "@/lib/payments/mollie-accounts";

export interface CheckoutInput {
  bookingId: string;
  amountEur: number;
  payerEmail: string | null;
  payerPersonId: string;
  /** Mollie account this payment routes to. Defaults to operations (Higgins). */
  account?: MollieAccount;
}

export interface CheckoutResult {
  /** Where the user should be sent to complete payment. */
  checkoutUrl: string;
  /** Provider-side id (Mollie payment id when wired). */
  providerPaymentId: string;
  /** Mollie account this payment landed in (for audit/log). */
  account: MollieAccount;
}

export async function startCourtBookingCheckout(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const account = input.account ?? getMollieAccountForOperations();
  if (process.env.NEXT_PUBLIC_DEMO_MOLLIE === "false") {
    console.info(
      `[payments-stub] would start Mollie checkout (account=${account}): booking=${input.bookingId} amount=€${input.amountEur} payer=${input.payerEmail ?? input.payerPersonId}`,
    );
  }
  return {
    checkoutUrl: `/portal/bookings/${input.bookingId}?stub_checkout=1`,
    providerPaymentId: `stub_${input.bookingId}`,
    account,
  };
}

export interface CoachInvoiceCheckoutInput {
  paymentId: string;
  invoiceNumber: string;
  amountEur: number;
  payerEmail: string | null;
  payerPersonId: string;
  /** Mollie account this invoice routes to. Defaults to operations (Higgins). */
  account?: MollieAccount;
}

/**
 * Stub for the coach AR-invoice Mollie flow. Returns a synthetic URL that
 * loops back to the admin invoice page until real Mollie wiring lands.
 *
 * Once Mollie is configured this should create a payment via Mollie's
 * payments API with `metadata: { paymentId, invoiceNumber }` and return
 * the real `_links.checkout.href` + Mollie payment id, using the API
 * key for `account`.
 */
export async function startCoachInvoiceCheckout(
  input: CoachInvoiceCheckoutInput,
): Promise<CheckoutResult> {
  const account = input.account ?? getMollieAccountForOperations();
  console.info(
    `[payments-stub] would start Mollie checkout (account=${account}): coach-invoice=${input.invoiceNumber} amount=€${input.amountEur} payer=${input.payerEmail ?? input.payerPersonId}`,
  );
  return {
    checkoutUrl: `/portal/payments/${input.paymentId}?stub_checkout=1&invoice=${encodeURIComponent(input.invoiceNumber)}`,
    providerPaymentId: `stub_coach_${input.paymentId}`,
    account,
  };
}
