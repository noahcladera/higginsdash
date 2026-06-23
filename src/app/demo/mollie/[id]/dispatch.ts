"use server";

/**
 * Demo Mollie dispatcher — delegates to shared fulfillment.
 *
 * SECURITY: this server action grants paid goods WITHOUT a real payment, so it
 * must never be reachable in production. We require (1) demo checkout to be
 * allowed in this environment and (2) an authenticated session before running
 * any fulfillment. Without these guards, any logged-in user could mint free
 * memberships/enrollments/bookings.
 */

import type { DemoCheckoutAction } from "@/lib/payments/demo-checkout";
import {
  fulfillCheckoutAction,
  type CheckoutFulfillmentResult,
} from "@/lib/payments/fulfillment";
import { isDemoCheckoutAllowed } from "@/lib/payments/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DemoCheckoutDispatchResult = CheckoutFulfillmentResult;

export interface DemoCheckoutDispatchContext {
  amountEur: number;
  paidAt?: Date;
}

export async function runDemoCheckout(
  action: DemoCheckoutAction,
  context?: DemoCheckoutDispatchContext,
): Promise<DemoCheckoutDispatchResult> {
  if (!isDemoCheckoutAllowed()) {
    return { ok: false, error: "Demo checkout is disabled in this environment." };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to continue." };
  }
  return fulfillCheckoutAction(action, context);
}
