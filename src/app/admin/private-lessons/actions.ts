"use server";

/**
 * Admin server action: generate an AR-style invoice for a coach's
 * unbilled private-lesson court time.
 *
 * Coach invoices are billed to the coach **personally** — the resulting
 * `Payment` has `paidByPersonId = coach.id` and `paidByHouseholdId = null`.
 * Households are not involved (court rental is a coach business expense,
 * not a family bill), so a coach without a household row can still be
 * invoiced.
 *
 * Flow:
 *  1. Parse the selected line-item refs (one-offs and/or recurring
 *     occurrences) plus the period range.
 *  2. Re-resolve each ref server-side against the database (defence in
 *     depth: the client tells us *what* to invoice, the server still
 *     owns *how much* to charge).
 *  3. Inside a transaction, create one `Payment` with
 *     `molliePaymentId = null`, `invoiceNumber = COACH-YYYY-NNNN`,
 *     `status = 'pending'`, and one `PaymentLine` per resolved ref.
 *  4. Revalidate `/admin/private-lessons` so the list refreshes.
 *
 * For recurring occurrences the line description embeds the occurrence
 * timestamp; `getUnbilledCoachLineItems` uses that to avoid billing
 * the same occurrence twice.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { nextCoachInvoiceNumber } from "@/lib/invoicing/invoice-number";
import {
  getUnbilledCoachLineItems,
  type CoachLineItem,
} from "@/lib/admin/private-lessons-queries";
import { formatLocalDate } from "@/lib/booking/time";
import { startCoachInvoiceCheckout } from "@/lib/payments";
import { sendEmail } from "@/lib/email";
import { buildCoachInvoiceEmail } from "@/lib/invoicing/coach-invoice-email";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

const CreateInvoiceSchema = z.object({
  coachPersonId: z.string().uuid(),
  /** refIds from `CoachLineItem.refId`. */
  refIds: z.array(z.string()).min(1),
  /** ISO 8601 (UTC) period window, inclusive start / exclusive end. */
  periodStartUtc: z.string().datetime(),
  periodEndUtc: z.string().datetime(),
});

export type CreateCoachInvoiceInput = z.input<typeof CreateInvoiceSchema>;
export type CreateCoachInvoiceResult =
  | { ok: true; paymentId: string; invoiceNumber: string }
  | { ok: false; error: string };

export async function createCoachInvoice(
  rawInput: CreateCoachInvoiceInput,
): Promise<CreateCoachInvoiceResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = CreateInvoiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { coachPersonId, refIds, periodStartUtc, periodEndUtc } = parsed.data;

  const periodStart = new Date(periodStartUtc);
  const periodEnd = new Date(periodEndUtc);

  const coach = await prisma.person.findUnique({
    where: { id: coachPersonId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      emails: {
        where: { isPrimary: true, archivedAt: null },
        select: { address: true },
        take: 1,
      },
    },
  });
  const terms = await getTerms();
  if (!coach) return { ok: false, error: `${terms.coach.singular} not found.` };
  const coachEmail = coach.emails[0]?.address ?? null;

  // Re-resolve refs server-side. We call the same query the page uses so
  // already-invoiced occurrences can't sneak through a second time.
  const unbilled = await getUnbilledCoachLineItems(
    coachPersonId,
    periodStart,
    periodEnd,
  );
  const byRef = new Map(unbilled.map((i) => [i.refId, i]));

  const resolved: CoachLineItem[] = [];
  for (const refId of refIds) {
    const item = byRef.get(refId);
    if (!item) {
      return {
        ok: false,
        error:
          "One of the selected line items is no longer available. Refresh the page and try again.",
      };
    }
    resolved.push(item);
  }

  const totalEur = resolved.reduce((sum, i) => sum + i.amount, 0);
  const amount = new Prisma.Decimal(totalEur.toFixed(2));

  const periodLabel = `${formatLocalDate(periodStart)} → ${formatLocalDate(
    new Date(periodEnd.getTime() - 1),
  )}`;

  let paymentId: string;
  let invoiceNumber: string;
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invNum = await nextCoachInvoiceNumber(tx);
      const payment = await tx.payment.create({
        data: {
          molliePaymentId: null,
          invoiceNumber: invNum,
          amount,
          currency: "EUR",
          status: "pending",
          description: `Private-lesson court rental (${periodLabel})`,
          paidByPersonId: coach.id,
          paidByHouseholdId: null,
          issuedAt: new Date(),
        },
        select: { id: true, invoiceNumber: true },
      });

      await Promise.all(
        resolved.map((item) =>
          tx.paymentLine.create({
            data: {
              paymentId: payment.id,
              amount: new Prisma.Decimal(item.amount.toFixed(2)),
              description: lineDescription(item),
              courtBookingId:
                item.kind === "one_off" ? item.courtBookingId : null,
              recurringBlockId:
                item.kind === "recurring_occurrence"
                  ? item.recurringBlockId
                  : null,
            },
          }),
        ),
      );

      return { paymentId: payment.id, invoiceNumber: payment.invoiceNumber! };
    });
    paymentId = result.paymentId;
    invoiceNumber = result.invoiceNumber;
  } catch (e) {
    return {
      ok: false,
      error: `Failed to generate invoice: ${(e as Error).message}`,
    };
  }

  // Provision the Mollie checkout URL so the admin can copy / send it
  // immediately. Failures here shouldn't roll back the invoice — we'll
  // try again lazily inside `sendCoachInvoiceEmail` if needed.
  try {
    const checkout = await startCoachInvoiceCheckout({
      paymentId,
      invoiceNumber,
      amountEur: totalEur,
      payerEmail: coachEmail,
      payerPersonId: coach.id,
    });
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        mollieCheckoutUrl: checkout.checkoutUrl,
        molliePaymentId: checkout.providerPaymentId,
      },
    });
  } catch (e) {
    console.warn(
      `[createCoachInvoice] failed to provision checkout for ${invoiceNumber}: ${(e as Error).message}`,
    );
  }

  revalidatePath("/admin/private-lessons");
  revalidatePath(`/admin/private-lessons/${coachPersonId}`);
  revalidatePath("/coach/hours");

  return { ok: true, paymentId, invoiceNumber };
}

function lineDescription(item: CoachLineItem): string {
  if (item.kind === "one_off") {
    const date = formatLocalDate(item.startsAt);
    const hhmm = hhmmAmsterdam(item.startsAt);
    return `Private lesson ${date} ${hhmm} (${item.minutes} min)`;
  }
  const date = formatLocalDate(item.occurrenceStartsAt);
  const hhmm = hhmmAmsterdam(item.occurrenceStartsAt);
  return `Recurring lesson ${date} ${hhmm} (${item.minutes} min) — ${item.description}`;
}

function hhmmAmsterdam(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

const SetCourtRateSchema = z.object({
  coachPersonId: z.string().uuid(),
  /** Null clears override and restores the global default. */
  ratePerHour: z.number().min(0).max(999).nullable(),
});

export type SetCoachCourtRentalRateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setCoachCourtRentalRate(
  raw: z.input<typeof SetCourtRateSchema>,
): Promise<SetCoachCourtRentalRateResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = SetCourtRateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { coachPersonId, ratePerHour } = parsed.data;

  const coach = await prisma.coach.findUnique({
    where: { personId: coachPersonId },
    select: { personId: true },
  });
  const terms = await getTerms();
  if (!coach) return { ok: false, error: `${terms.coach.singular} not found.` };

  try {
    await prisma.coach.update({
      where: { personId: coachPersonId },
      data: {
        courtRentalRate:
          ratePerHour == null
            ? null
            : new Prisma.Decimal(ratePerHour.toFixed(2)),
      },
    });
  } catch (e) {
    return {
      ok: false,
      error: `Could not save: ${(e as Error).message}`,
    };
  }

  revalidatePath("/admin/private-lessons");
  revalidatePath(`/admin/private-lessons/${coachPersonId}`);
  revalidatePath("/coach/hours");

  return { ok: true };
}

const SetZzpCourtRateSchema = z.object({
  zzpPersonId: z.string().uuid(),
  /** Null clears override and restores the global default. */
  ratePerHour: z.number().min(0).max(999).nullable(),
});

export type SetZzpCoachCourtRentalRateResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * ZZP equivalent of `setCoachCourtRentalRate` — writes the per-coach
 * override on `ZzpCoach.defaultCourtRentalRate` so future invoices
 * (and the coach's "My hours" estimate) bill at the new rate.
 */
export async function setZzpCoachCourtRentalRate(
  raw: z.input<typeof SetZzpCourtRateSchema>,
): Promise<SetZzpCoachCourtRentalRateResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = SetZzpCourtRateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { zzpPersonId, ratePerHour } = parsed.data;

  const terms = await getTerms();
  const zzp = await prisma.zzpCoach.findUnique({
    where: { personId: zzpPersonId },
    select: { personId: true },
  });
  if (!zzp)
    return {
      ok: false,
      error: `Contracting ${terms.coach.singular.toLowerCase()} not found.`,
    };

  try {
    await prisma.zzpCoach.update({
      where: { personId: zzpPersonId },
      data: {
        defaultCourtRentalRate:
          ratePerHour == null
            ? null
            : new Prisma.Decimal(ratePerHour.toFixed(2)),
      },
    });
  } catch (e) {
    return {
      ok: false,
      error: `Could not save: ${(e as Error).message}`,
    };
  }

  revalidatePath("/admin/private-lessons");
  revalidatePath(`/admin/private-lessons/${zzpPersonId}`);
  revalidatePath("/coach/hours");

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Send coach a Mollie payment link + breakdown email
// ---------------------------------------------------------------------------

const SendInvoiceEmailSchema = z.object({
  paymentId: z.string().uuid(),
  /** Optional override; defaults to the coach's primary email. */
  toEmail: z.string().email().optional(),
});

export type SendCoachInvoiceEmailInput = z.input<typeof SendInvoiceEmailSchema>;
export type SendCoachInvoiceEmailResult =
  | { ok: true; sentToEmail: string; checkoutUrl: string }
  | { ok: false; error: string };

export async function sendCoachInvoiceEmail(
  raw: SendCoachInvoiceEmailInput,
): Promise<SendCoachInvoiceEmailResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = SendInvoiceEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { paymentId, toEmail } = parsed.data;
  const terms = await getTerms();

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      paidByPerson: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          emails: {
            where: { isPrimary: true, archivedAt: null },
            select: { address: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!payment) return { ok: false, error: "Invoice not found." };
  if (!payment.invoiceNumber?.startsWith("COACH-")) {
    return {
      ok: false,
      error: `Not a ${terms.coach.singular.toLowerCase()} invoice.`,
    };
  }

  const recipient =
    toEmail ?? payment.paidByPerson.emails[0]?.address ?? null;
  if (!recipient) {
    return {
      ok: false,
      error: `No email address on file for this ${terms.coach.singular.toLowerCase()}. Provide one or set a primary email on their profile.`,
    };
  }

  // Lazily provision a Mollie checkout URL for older invoices that pre-date
  // the auto-provisioning step in `createCoachInvoice`.
  let checkoutUrl = payment.mollieCheckoutUrl;
  if (!checkoutUrl) {
    try {
      const checkout = await startCoachInvoiceCheckout({
        paymentId: payment.id,
        invoiceNumber: payment.invoiceNumber,
        amountEur: Number(payment.amount),
        payerEmail: recipient,
        payerPersonId: payment.paidByPerson.id,
      });
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          mollieCheckoutUrl: checkout.checkoutUrl,
          molliePaymentId: checkout.providerPaymentId,
        },
      });
      checkoutUrl = checkout.checkoutUrl;
    } catch (e) {
      return {
        ok: false,
        error: `Could not provision payment link: ${(e as Error).message}`,
      };
    }
  }

  const periodLabel = payment.description.replace(
    /^Private-lesson court rental \(([^)]+)\)$/,
    "$1",
  );

  const brand = await getCurrentBrand();
  const { subject, body } = buildCoachInvoiceEmail({
    firstName: payment.paidByPerson.firstName ?? "",
    invoiceNumber: payment.invoiceNumber,
    periodLabel,
    totalEur: Number(payment.amount),
    checkoutUrl,
    lines: payment.lines.map((l) => ({
      description: l.description,
      amount: Number(l.amount),
    })),
    brandName: brand.shortName,
    privateLessonLabel: terms.privateLesson.singular,
  });

  try {
    await sendEmail({ to: recipient, subject, body });
  } catch (e) {
    return {
      ok: false,
      error: `Could not send email: ${(e as Error).message}`,
    };
  }

  // Treat "send" as "issued" — stamp issuedAt if the invoice never went out.
  if (!payment.issuedAt) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { issuedAt: new Date() },
    });
  }

  revalidatePath(`/admin/private-lessons/${payment.paidByPerson.id}`);

  return { ok: true, sentToEmail: recipient, checkoutUrl: checkoutUrl! };
}
