"use server";

/**
 * Demo Mollie dispatcher — delegates to shared fulfillment.
 */

import type { DemoCheckoutAction } from "@/lib/payments/demo-checkout";
import {
  fulfillCheckoutAction,
  type CheckoutFulfillmentResult,
} from "@/lib/payments/fulfillment";

export type DemoCheckoutDispatchResult = CheckoutFulfillmentResult;

export interface DemoCheckoutDispatchContext {
  amountEur: number;
  paidAt?: Date;
}

export async function runDemoCheckout(
  action: DemoCheckoutAction,
  context?: DemoCheckoutDispatchContext,
): Promise<DemoCheckoutDispatchResult> {
  return fulfillCheckoutAction(action, context);
}
