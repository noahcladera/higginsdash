/**
 * Generate human-readable invoice numbers for coach AR-style invoices.
 *
 * Format: `COACH-YYYY-NNNN` where `NNNN` is a 4-digit zero-padded
 * sequence restarting each calendar year. The year comes from the
 * server's local year — billing is done from the Amsterdam office so
 * this matches what admins expect to see on invoices.
 *
 * Concurrency: we select the highest existing number for the current
 * year and increment. That's race-prone under high concurrency but the
 * admin invoicing volume is a few clicks per month by at most one or
 * two people. If that ever changes, wrap the call in a Postgres
 * advisory lock (`pg_advisory_xact_lock`).
 */

import type { Prisma } from "@prisma/client";

export async function nextCoachInvoiceNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `COACH-${year}-`;

  const latest = await tx.payment.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  const seq = latest?.invoiceNumber
    ? Number(latest.invoiceNumber.slice(prefix.length)) + 1
    : 1;

  return `${prefix}${String(seq).padStart(4, "0")}`;
}
