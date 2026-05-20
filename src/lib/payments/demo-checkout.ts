/**
 * Demo Mollie checkout — client-side helpers.
 *
 * Wraps any "this would normally hand off to Mollie" call site with a
 * `sessionStorage`-backed intent and a redirect to `/demo/mollie/[id]`,
 * the fake Mollie hosted-checkout page used by the in-person demo. The
 * real underlying server action runs *after* the user clicks "Confirm
 * payment" on the demo page (see [src/app/demo/mollie/[id]/dispatch.ts]).
 *
 * Intentionally not a server action — sessionStorage is browser-only.
 */
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import type { CreateBookingInput } from "@/lib/booking/actions";
import type { MollieAccount } from "@/lib/payments/mollie-accounts";

/**
 * Discriminated union of every payment trigger we currently route
 * through the demo Mollie page. Adding a new flow means adding a
 * variant here and a `case` in [dispatch.ts]; the page itself is
 * generic over `kind`.
 */
export type DemoCheckoutAction =
  | {
      kind: "membership_create";
      payload: {
        tier: "adult" | "child" | "family";
        clubs: ("triaz" | "randwijck")[];
        assignedPersonId?: string;
        /**
         * Joint memberships are paid in two consecutive Mollie checkouts
         * — Triaz portion first, Randwijck portion second. Single-club
         * purchases leave this `undefined` and write a single payment.
         */
        step?: "triaz" | "randwijck";
        /**
         * When set, the buyer chose a Randwijck flat-rate seasonal pass
         * instead of the prorated single. Adult / Randwijck-only.
         */
        randwijckBundle?: "summer" | "late_season";
      };
    }
  | { kind: "membership_upgrade"; payload: { offerId: string } }
  | {
      kind: "enrollment_create";
      payload: {
        classSeriesId: string;
        studentPersonId: string;
        groupId?: string;
        campOptionId?: string;
        campDropInDate?: string;
        /**
         * Set when the parent acknowledged the age cross-check warning.
         * The server-side action stamps `requiresReview = true` so the
         * office can confirm the fit before the lesson starts.
         */
        ageOverrideAck?: boolean;
        /**
         * EUR cents of household credit the parent opted to apply to
         * the lesson seat at checkout. The server clamps this to the
         * available balance and the lesson charge.
         */
        creditCentsApplied?: number;
      };
    }
  | {
      /**
       * Lesson-only enrollment payment — used by the two-step checkout
       * where the parent has just paid the required membership in step 1
       * and is now paying the lesson fee in step 2. The server-side path
       * skips `grantEnrollmentMembership` and requires an existing
       * covering membership.
       */
      kind: "enrollment_create_lesson_only";
      payload: {
        classSeriesId: string;
        studentPersonId: string;
        groupId?: string;
        campOptionId?: string;
        campDropInDate?: string;
        ageOverrideAck?: boolean;
        creditCentsApplied?: number;
      };
    }
  | { kind: "court_booking_create"; payload: CreateBookingInput }
  | { kind: "ladder_join"; payload: Record<string, never> };

export interface DemoCheckoutIntent {
  /** UUID, also the route param for `/demo/mollie/[id]`. */
  id: string;
  /** Display amount in euros (e.g. 540 → "€ 540,00"). */
  amountEur: number;
  /** Short, human-readable description of what's being paid for. */
  description: string;
  /** Top-of-card merchant label. Defaults to the club. */
  merchantLabel: string;
  /**
   * Which Mollie account this checkout would route to in production.
   * Surfaced on the demo page so we can verify Triaz vs Higgins routing
   * during the in-person demo. Defaults to `"higgins"`.
   */
  mollieAccount: MollieAccount;
  /** Where the success page sends the user back to. */
  returnUrl: string;
  /** The real action to run when "payment" succeeds. */
  action: DemoCheckoutAction;
  /** Wall-clock ms; used to garbage-collect stale intents. */
  createdAt: number;
}

const STORAGE_PREFIX = "demo_mollie_intent:";

/** ms — older intents are pruned on the next `startDemoCheckout` call. */
const INTENT_TTL_MS = 30 * 60 * 1000;

/**
 * Stash the intent in `sessionStorage` and navigate to the demo
 * checkout page. Returns the generated intent id (mostly useful for
 * tests).
 */
export function startDemoCheckout(
  intent: Omit<
    DemoCheckoutIntent,
    "id" | "createdAt" | "merchantLabel" | "mollieAccount"
  > & {
    merchantLabel?: string;
    mollieAccount?: MollieAccount;
  },
  router: AppRouterInstance,
): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const full: DemoCheckoutIntent = {
    id,
    createdAt: Date.now(),
    merchantLabel: intent.merchantLabel ?? "Hertogenbosch tennisclub",
    mollieAccount: intent.mollieAccount ?? "higgins",
    amountEur: intent.amountEur,
    description: intent.description,
    returnUrl: intent.returnUrl,
    action: intent.action,
  };

  if (typeof window !== "undefined") {
    pruneStaleIntents();
    try {
      sessionStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(full));
    } catch {
      // sessionStorage full / disabled — fall through; the demo page
      // will show its own "intent missing" error instead of crashing.
    }
  }

  router.push(`/demo/mollie/${id}`);
  return id;
}

export function loadDemoIntent(id: string): DemoCheckoutIntent | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoCheckoutIntent;
  } catch {
    return null;
  }
}

export function clearDemoIntent(id: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_PREFIX + id);
}

function pruneStaleIntents(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const stale: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as DemoCheckoutIntent;
      if (now - parsed.createdAt > INTENT_TTL_MS) stale.push(key);
    } catch {
      stale.push(key);
    }
  }
  for (const key of stale) sessionStorage.removeItem(key);
}
