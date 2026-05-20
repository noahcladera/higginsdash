"use server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { DemoCheckoutAction } from "@/lib/payments/demo-checkout";
import type { MollieAccount } from "@/lib/payments/mollie-accounts";
import { isDemoCheckoutAllowed, isMollieConfigured } from "@/lib/payments/config";
import { createPaymentCheckoutIntent } from "@/lib/payments/hosted-checkout";
import { syncAndFulfillCheckoutIntent } from "@/lib/payments/hosted-checkout";

const InitiateSchema = z.object({
  amountEur: z.number().positive().max(100_000),
  description: z.string().min(1).max(500),
  returnUrl: z.string().min(1).max(500),
  mollieAccount: z.enum(["triaz", "higgins"]),
  action: z.custom<DemoCheckoutAction>(),
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
      action: parsed.data.action,
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
  const intent = await prisma.paymentCheckoutIntent.findUnique({
    where: { id: intentId },
    select: { id: true, returnUrl: true, status: true },
  });
  if (!intent) return { ok: false, error: "Checkout not found.", status: "missing" };

  const sync = await syncAndFulfillCheckoutIntent(intentId);
  if (sync.ok) {
    return { ok: true, status: "paid", returnUrl: intent.returnUrl };
  }
  if (sync.status === "open" || sync.status === "pending") {
    return { ok: true, status: "pending" };
  }
  return { ok: false, error: sync.error, status: sync.status };
}
