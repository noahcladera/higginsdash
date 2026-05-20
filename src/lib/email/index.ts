/**
 * Outbound email. Uses Resend when `RESEND_API_KEY` is set; otherwise logs
 * in development and warns in production.
 */

import { Resend } from "resend";

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
  /** Optional reply-to address. Defaults to office@ in production. */
  replyTo?: string;
}

const DEFAULT_FROM =
  process.env.EMAIL_FROM?.trim() || "Higgins Tennis <noreply@higginstennis.nl>";

export async function sendEmail(email: OutboundEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[email] PRODUCTION call to sendEmail() but RESEND_API_KEY is not set.",
        { to: email.to, subject: email.subject },
      );
    } else {
      console.info(
        `[email-stub] -> ${email.to}\n  subject: ${email.subject}\n  body: ${email.body}`,
      );
    }
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: DEFAULT_FROM,
    to: email.to,
    subject: email.subject,
    text: email.body,
    replyTo: email.replyTo,
  });

  if (error) {
    console.error("[email] Resend error:", error);
    throw new Error(error.message);
  }
}
