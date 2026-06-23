import { Prisma } from "@prisma/client";
import type { Payment as MolliePayment } from "@mollie/api-client";

import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
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
    // Integrity checks before we grant anything: the amount Mollie actually
    // captured must equal what the intent recorded, in EUR, and the payment
    // must carry our intent id in its metadata. This blocks tampered or
    // mismatched payments from triggering fulfillment.
    const expected = Number(intent.amount).toFixed(2);
    const paidValue = molliePayment.amount?.value ?? "";
    const paidCurrency = molliePayment.amount?.currency ?? "";
    const metaIntentId =
      (molliePayment.metadata as { intentId?: string } | null)?.intentId ?? null;

    if (paidCurrency !== "EUR" || paidValue !== expected || metaIntentId !== intent.id) {
      await prisma.paymentCheckoutIntent.update({
        where: { id: intent.id },
        data: {
          status: "failed",
          failureReason: `Payment integrity check failed (paid ${paidValue} ${paidCurrency}, expected ${expected} EUR, metaIntent ${metaIntentId ?? "none"}).`,
        },
      });
      return {
        ok: false,
        error: "Payment could not be verified. Please contact the office.",
        status: "failed",
      };
    }

    if (intent.status !== "paid") {
      const action = intent.action as DemoCheckoutAction;
      // Marker so we can find exactly the Payment row(s) this fulfillment
      // creates and link them back to the Mollie payment for reconciliation.
      const stampFrom = new Date();
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

      await reconcilePaymentToMollie({
        intentPayerPersonId: intent.paidByPersonId,
        molliePaymentId: intent.molliePaymentId,
        molliePayment,
        createdSince: stampFrom,
        knownPaymentId: result.paymentId ?? null,
      });

      await prisma.paymentCheckoutIntent.update({
        where: { id: intent.id },
        data: {
          status: "paid",
          fulfilledAt: new Date(),
        },
      });

      await sendCheckoutReceipt({
        paidByPersonId: intent.paidByPersonId,
        amount: intent.amount,
        description: intent.description,
        id: intent.id,
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

/**
 * Send the buyer a receipt (in-app + email) once a checkout is paid and
 * fulfilled. Runs from the Mollie sync path so it fires regardless of whether
 * fulfillment was driven by the return page or the webhook (no session needed).
 * Best-effort: a receipt failure never blocks fulfillment.
 */
async function sendCheckoutReceipt(intent: {
  paidByPersonId: string;
  amount: Prisma.Decimal | number | string;
  description: string;
  id: string;
}): Promise<void> {
  try {
    const email = await prisma.emailAddress.findFirst({
      where: { personId: intent.paidByPersonId, isPrimary: true, archivedAt: null },
      select: { address: true },
    });
    const amount = Number(intent.amount).toFixed(2);
    await notify({
      recipientPersonId: intent.paidByPersonId,
      templateKey: "payment.receipt",
      subject: "Payment received — Higgins Tennis",
      body:
        `Thanks! We've received your payment of €${amount} for ${intent.description}. ` +
        `You can view it any time under Payments in your portal.`,
      channels: email?.address ? ["in_app", "email"] : ["in_app"],
      recipientEmail: email?.address ?? null,
      relatedTable: "payment_checkout_intents",
      relatedRowId: intent.id,
    });
  } catch (e) {
    console.error("[receipt] failed to send checkout receipt", e);
  }
}

/**
 * Link the internal `Payment` row(s) created by a fulfillment back to the
 * Mollie payment, so finance/support can match the Mollie dashboard to the DB
 * and chargebacks/refunds have a provider id to act on.
 *
 * Safety: when the fulfillment returns an explicit payment id (enrollment) we
 * stamp it directly. Otherwise we only link when EXACTLY ONE Payment was
 * created in the fulfillment window for this payer — we never guess across the
 * two legs of a joint membership (those are left for manual reconciliation,
 * by design, because the second leg is charged on a separate Mollie account).
 */
async function reconcilePaymentToMollie(args: {
  intentPayerPersonId: string;
  molliePaymentId: string | null;
  molliePayment: MolliePayment;
  createdSince: Date;
  knownPaymentId: string | null;
}): Promise<void> {
  if (!args.molliePaymentId) return;

  let payload: Prisma.InputJsonValue | undefined;
  try {
    payload = JSON.parse(JSON.stringify(args.molliePayment)) as Prisma.InputJsonValue;
  } catch {
    payload = undefined;
  }
  const data: Prisma.PaymentUpdateInput = { molliePaymentId: args.molliePaymentId };
  if (payload !== undefined) data.mollieWebhookPayload = payload;

  if (args.knownPaymentId) {
    await prisma.payment
      .update({ where: { id: args.knownPaymentId }, data })
      .catch(() => undefined);
    return;
  }

  const candidates = await prisma.payment.findMany({
    where: {
      paidByPersonId: args.intentPayerPersonId,
      molliePaymentId: null,
      createdAt: { gte: args.createdSince },
    },
    select: { id: true },
  });
  if (candidates.length === 1) {
    await prisma.payment
      .update({ where: { id: candidates[0].id }, data })
      .catch(() => undefined);
  } else if (candidates.length > 1) {
    console.info(
      `[reconcile] ${candidates.length} payments created in window for payer ` +
        `(likely a joint membership) — left for manual reconciliation. ` +
        `mollie=${args.molliePaymentId}`,
    );
  }
}
