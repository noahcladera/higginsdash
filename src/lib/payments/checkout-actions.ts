"use server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { DemoCheckoutAction } from "@/lib/payments/demo-checkout";
import type { MollieAccount } from "@/lib/payments/mollie-accounts";
import { isDemoCheckoutAllowed, isMollieConfigured } from "@/lib/payments/config";
import { createPaymentCheckoutIntent } from "@/lib/payments/hosted-checkout";
import { syncAndFulfillCheckoutIntent } from "@/lib/payments/hosted-checkout";
import { isSafeInternalPath } from "@/lib/safe-redirect";

/**
 * Discriminated-union validation for the fulfillment action. Replaces the
 * previous `z.custom` (which accepted ANY JSON) so a malformed or unknown
 * action can never reach fulfillment. Domain actions re-validate their own
 * payloads, so booking/enrollment payloads are accepted structurally here
 * and authoritatively checked (and priced) server-side at fulfillment.
 */
const CheckoutActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("membership_create"),
    payload: z.object({
      tier: z.enum(["adult", "child", "family"]),
      clubs: z.array(z.enum(["triaz", "randwijck"])).min(1).max(2),
      assignedPersonId: z.string().uuid().optional(),
      step: z.enum(["triaz", "randwijck"]).optional(),
      randwijckBundle: z.enum(["summer", "late_season"]).optional(),
    }),
  }),
  z.object({
    kind: z.literal("membership_upgrade"),
    payload: z.object({ offerId: z.string().min(1) }),
  }),
  z.object({
    kind: z.literal("enrollment_create"),
    payload: z.object({
      classSeriesId: z.string().min(1),
      studentPersonId: z.string().min(1),
      groupId: z.string().optional(),
      campOptionId: z.string().optional(),
      campDropInDate: z.string().optional(),
      ageOverrideAck: z.boolean().optional(),
      creditCentsApplied: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({
    kind: z.literal("enrollment_create_lesson_only"),
    payload: z.object({
      classSeriesId: z.string().min(1),
      studentPersonId: z.string().min(1),
      groupId: z.string().optional(),
      campOptionId: z.string().optional(),
      campDropInDate: z.string().optional(),
      ageOverrideAck: z.boolean().optional(),
      creditCentsApplied: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({
    kind: z.literal("court_booking_create"),
    // createBooking() re-parses this with its own strict schema.
    payload: z.object({}).passthrough(),
  }),
]);

const InitiateSchema = z.object({
  amountEur: z.number().positive().max(100_000),
  description: z.string().min(1).max(500),
  // Only same-origin relative paths — blocks open-redirect via returnUrl.
  returnUrl: z
    .string()
    .min(1)
    .max(500)
    .refine(isSafeInternalPath, "returnUrl must be a same-origin path."),
  mollieAccount: z.enum(["triaz", "higgins"]),
  action: CheckoutActionSchema,
});

export type InitiateCheckoutResult =
  | { ok: true; mode: "demo" }
  | { ok: true; mode: "mollie"; checkoutUrl: string }
  | { ok: false; error: string };

export async function initiateHostedCheckout(
  raw: z.input<typeof InitiateSchema>,
): Promise<InitiateCheckoutResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to continue to payment." };

  const parsed = InitiateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid checkout request." };
  }

  if (!isMollieConfigured()) {
    if (!isDemoCheckoutAllowed()) {
      return {
        ok: false,
        error: "Payments are not configured on this environment.",
      };
    }
    return { ok: true, mode: "demo" };
  }

  try {
    const { checkoutUrl } = await createPaymentCheckoutIntent({
      paidByPersonId: user.id,
      amountEur: parsed.data.amountEur,
      description: parsed.data.description,
      mollieAccount: parsed.data.mollieAccount as MollieAccount,
      returnUrl: parsed.data.returnUrl,
      action: parsed.data.action as DemoCheckoutAction,
    });
    return { ok: true, mode: "mollie", checkoutUrl };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not start payment.",
    };
  }
}

export async function pollCheckoutIntent(intentId: string): Promise<
  | { ok: true; status: "paid"; returnUrl: string }
  | { ok: true; status: "pending" }
  | { ok: false; error: string; status: string }
> {
  // Require a session and verify the caller owns this intent — without
  // this, anyone with an intent UUID could trigger fulfillment, read the
  // returnUrl, or mark another user's intent failed.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to continue.", status: "unauthenticated" };

  if (!z.string().uuid().safeParse(intentId).success) {
    return { ok: false, error: "Checkout not found.", status: "missing" };
  }

  const intent = await prisma.paymentCheckoutIntent.findUnique({
    where: { id: intentId },
    select: { id: true, returnUrl: true, status: true, paidByPersonId: true },
  });
  if (!intent) return { ok: false, error: "Checkout not found.", status: "missing" };
  if (intent.paidByPersonId !== user.id) {
    return { ok: false, error: "Checkout not found.", status: "forbidden" };
  }

  const sync = await syncAndFulfillCheckoutIntent(intentId);
  if (sync.ok) {
    return { ok: true, status: "paid", returnUrl: intent.returnUrl };
  }
  if (sync.status === "open" || sync.status === "pending") {
    return { ok: true, status: "pending" };
  }
  return { ok: false, error: sync.error, status: sync.status };
}
