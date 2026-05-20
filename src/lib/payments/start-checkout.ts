"use client";

/**
 * Unified checkout entry: uses real Mollie when API keys are configured,
 * otherwise falls back to the in-browser demo Mollie page.
 */

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import type { DemoCheckoutAction } from "@/lib/payments/demo-checkout";
import type { MollieAccount } from "@/lib/payments/mollie-accounts";
import { startDemoCheckout } from "@/lib/payments/demo-checkout";
import { initiateHostedCheckout } from "@/lib/payments/checkout-actions";

export async function startCheckout(
  intent: {
    amountEur: number;
    description: string;
    returnUrl: string;
    action: DemoCheckoutAction;
    merchantLabel?: string;
    mollieAccount?: MollieAccount;
  },
  router: AppRouterInstance,
): Promise<void> {
  const res = await initiateHostedCheckout({
    amountEur: intent.amountEur,
    description: intent.description,
    returnUrl: intent.returnUrl,
    mollieAccount: intent.mollieAccount ?? "higgins",
    action: intent.action,
  });

  if (!res.ok) {
    throw new Error(res.error);
  }

  if (res.mode === "mollie") {
    window.location.href = res.checkoutUrl;
    return;
  }

  startDemoCheckout(intent, router);
}
