import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { DemoCheckoutAction } from "@/lib/payments/demo-checkout";
import type { MollieAccount } from "@/lib/payments/mollie-accounts";
import { getSiteUrl } from "@/lib/payments/config";
import {
  createMollieHostedPayment,
  fetchMolliePayment,
} from "@/lib/payments/mollie-client";
import { fulfillCheckoutAction } from "@/lib/payments/fulfillment";

export async function createPaymentCheckoutIntent(args: {
  paidByPersonId: string;
  amountEur: number;
  description: string;
  mollieAccount: MollieAccount;
  returnUrl: string;
  action: DemoCheckoutAction;
}) {
  const intent = await prisma.paymentCheckoutIntent.create({
    data: {
      paidByPersonId: args.paidByPersonId,
      amount: new Prisma.Decimal(args.amountEur.toFixed(2)),
      description: args.description,
      mollieAccount: args.mollieAccount,
      returnUrl: args.returnUrl,
      action: args.action as Prisma.InputJsonValue,
    },
  });

  const siteUrl = getSiteUrl();
  const redirectUrl = `${siteUrl}/checkout/return?intent=${intent.id}`;
  const webhookUrl = `${siteUrl}/api/mollie/webhook`;

  const payment = await createMollieHostedPayment({
    account: args.mollieAccount,
    amountEur: args.amountEur,
    description: args.description,
    redirectUrl,
    webhookUrl,
    metadata: {
      intentId: intent.id,
      paidByPersonId: args.paidByPersonId,
    },
  });

  const checkoutUrl = payment.getCheckoutUrl();
  if (!checkoutUrl) {
    throw new Error("Mollie did not return a checkout URL.");
  }

  await prisma.paymentCheckoutIntent.update({
    where: { id: intent.id },
    data: { molliePaymentId: payment.id },
  });

  return { intentId: intent.id, checkoutUrl, molliePaymentId: payment.id };
}

export async function syncAndFulfillCheckoutIntent(
  intentId: string,
): Promise<
  | { ok: true; alreadyFulfilled?: boolean }
  | { ok: false; error: string; status: string }
> {
  const intent = await prisma.paymentCheckoutIntent.findUnique({
    where: { id: intentId },
  });
  if (!intent) {
    return { ok: false, error: "Checkout not found.", status: "missing" };
  }

  if (intent.status === "paid" && intent.fulfilledAt) {
    return { ok: true, alreadyFulfilled: true };
  }

  if (!intent.molliePaymentId) {
    return { ok: false, error: "Payment not started yet.", status: intent.status };
  }

  const molliePayment = await fetchMolliePayment(
    intent.mollieAccount as MollieAccount,
    intent.molliePaymentId,
  );

  const mollieStatus = molliePayment.status;
  if (mollieStatus === "paid") {
    if (intent.status !== "paid") {
      const action = intent.action as DemoCheckoutAction;
      const result = await fulfillCheckoutAction(action, {
        amountEur: Number(intent.amount),
        paidAt: molliePayment.paidAt ? new Date(molliePayment.paidAt) : new Date(),
      });
      if (!result.ok) {
        await prisma.paymentCheckoutIntent.update({
          where: { id: intent.id },
          data: {
            status: "failed",
            failureReason: result.error,
          },
        });
        return { ok: false, error: result.error, status: "failed" };
      }

      await prisma.paymentCheckoutIntent.update({
        where: { id: intent.id },
        data: {
          status: "paid",
          fulfilledAt: new Date(),
        },
      });
    }
    return { ok: true };
  }

  if (
    mollieStatus === "failed" ||
    mollieStatus === "canceled" ||
    mollieStatus === "expired"
  ) {
    const mapped =
      mollieStatus === "canceled" ? "canceled" : mollieStatus === "expired" ? "expired" : "failed";
    await prisma.paymentCheckoutIntent.update({
      where: { id: intent.id },
      data: { status: mapped },
    });
    return {
      ok: false,
      error: `Payment ${mollieStatus}.`,
      status: mapped,
    };
  }

  return { ok: false, error: "Payment still pending.", status: "open" };
}

export async function syncAndFulfillByMolliePaymentId(
  molliePaymentId: string,
): Promise<void> {
  const intent = await prisma.paymentCheckoutIntent.findUnique({
    where: { molliePaymentId },
  });
  if (!intent) return;
  await syncAndFulfillCheckoutIntent(intent.id);
}
