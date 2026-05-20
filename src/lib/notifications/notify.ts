/**
 * Persistent in-app notifications.
 *
 * Every state-changing action that the user (member, coach, admin) cares
 * about should funnel through `notify()` so the receipt lives in the
 * `notifications` table. Inboxes (`/portal/inbox`, `/coach/inbox`,
 * `/admin/inbox`) read from this table; the legacy `sendEmail()` stub is
 * still called in parallel for `email` channels so the eventual SMTP/Resend
 * provider lands transparently.
 *
 * Why a row, not just an email? The CEO process map explicitly identifies
 * "members do not know their own status" as the bottleneck. Email alone
 * would just relocate the bottleneck to people's inboxes; a database row
 * we can render in the portal closes the loop.
 *
 * Usage:
 *
 * ```ts
 * await notify({
 *   recipientPersonId: coach.id,
 *   templateKey: "booking.cancellation.approved",
 *   subject: "Your deletion was approved",
 *   body: "Your coaching slot on Tue 14 May 09:00 has been removed.",
 *   relatedTable: "court_bookings",
 *   relatedRowId: bookingId,
 * });
 * ```
 *
 * Pass `tx` to bind the write to an outer `prisma.$transaction` so the
 * receipt commits atomically with the business write.
 */

import type { Prisma, NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export interface NotifyInput {
  /** Person who should receive the notification. */
  recipientPersonId: string;
  /**
   * Stable template identifier. Uses dotted namespacing so future analytics
   * can group by domain ("booking.*", "enrollment.*", "membership.*",
   * "coach.sub.*", "refund.*").
   */
  templateKey: string;
  /** Short headline. Optional for `in_app` notifications (body suffices). */
  subject?: string;
  /** Plain-text body. Always rendered in the inbox. */
  body: string;
  /** Channel(s) to fan out to. Defaults to `["in_app"]`. */
  channels?: NotificationChannel[];
  /**
   * Recipient's primary email. Required if `channels` includes `email` —
   * caller already has the row in scope and shouldn't make `notify()` re-look
   * it up.
   */
  recipientEmail?: string | null;
  /** Domain table the notification refers to (e.g. "court_bookings"). */
  relatedTable?: string;
  /** Specific row id within `relatedTable`. */
  relatedRowId?: string;
  /** Optional rich-text body (HTML). Rendered when present, falling back to body. */
  bodyHtml?: string;
  /**
   * Bind to an outer transaction. When passed, all rows commit/rollback
   * with the caller's business write.
   */
  tx?: Prisma.TransactionClient;
}

export async function notify(input: NotifyInput): Promise<void> {
  const channels = input.channels ?? ["in_app"];
  const client = input.tx ?? prisma;

  // One row per channel — analytics + per-channel retry stay simple and
  // mirror what a real provider gives us back.
  await client.notification.createMany({
    data: channels.map((channel) => ({
      recipientPersonId: input.recipientPersonId,
      recipientEmail: channel === "email" ? input.recipientEmail ?? null : null,
      channel,
      templateKey: input.templateKey,
      subject: input.subject ?? null,
      bodyText: input.body,
      bodyHtml: input.bodyHtml ?? null,
      relatedTable: input.relatedTable ?? null,
      relatedRowId: input.relatedRowId ?? null,
      // `in_app` rows are immediately "delivered" — they're visible in the
      // inbox the moment they're written. Other channels stay queued for the
      // (future) provider worker to drain.
      status: channel === "in_app" ? "sent" : "queued",
      sentAt: channel === "in_app" ? new Date() : null,
    })),
  });

  // Fire-and-forget the legacy email stub so existing dev logging and the
  // future provider both keep working without callers thinking about it.
  // We do NOT bind this to the transaction — sending email is a side effect,
  // not part of the business write's atomicity contract.
  if (channels.includes("email") && input.recipientEmail) {
    await sendEmail({
      to: input.recipientEmail,
      subject: input.subject ?? "(no subject)",
      body: input.body,
    });
  }
}

/**
 * Helper: pluck the primary email from a Person-with-emails include shape.
 * Most callers already load `{ emails: true }` to drive other UI; this saves
 * them a `.find` boilerplate.
 */
export function primaryEmailOf(
  person: { emails: Array<{ address: string; isPrimary: boolean }> } | null,
): string | null {
  if (!person) return null;
  return person.emails.find((e) => e.isPrimary)?.address ?? null;
}
