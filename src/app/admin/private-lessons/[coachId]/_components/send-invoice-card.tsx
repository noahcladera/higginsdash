"use client";

/**
 * SendInvoiceCard — small client island that lets an admin
 * (1) copy the Mollie checkout URL for a coach invoice and
 * (2) email the coach a fixed-width breakdown together with that URL.
 *
 * Shown both:
 *  - inline under the success banner immediately after invoice creation,
 *    via `<SendInvoiceCardLoader>` which fetches the now-persisted
 *    Mollie URL on first interaction; and
 *  - as an expandable row in the History table.
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendCoachInvoiceEmail } from "../../actions";

export interface SendInvoiceCardProps {
  paymentId: string;
  invoiceNumber: string;
  amountLabel: string;
  defaultEmail: string | null;
  /** May be null for invoices created before the auto-provisioning step. */
  checkoutUrl: string | null;
}

export function SendInvoiceCard({
  paymentId,
  invoiceNumber,
  amountLabel,
  defaultEmail,
  checkoutUrl: initialCheckoutUrl,
}: SendInvoiceCardProps) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(
    initialCheckoutUrl,
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(absolutize(checkoutUrl));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const handleSend = () => {
    setError(null);
    setSentTo(null);
    startTransition(async () => {
      const res = await sendCoachInvoiceEmail({
        paymentId,
        toEmail: email || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSentTo(res.sentToEmail);
      setCheckoutUrl(res.checkoutUrl);
    });
  };

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-medium">
            Send {invoiceNumber} to coach
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            Total {amountLabel} · breakdown + Mollie link
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`mollie-${paymentId}`} className="text-xs">
          Mollie checkout URL
        </Label>
        <div className="flex gap-2">
          <Input
            id={`mollie-${paymentId}`}
            value={checkoutUrl ? absolutize(checkoutUrl) : ""}
            placeholder="Will be generated on first send"
            readOnly
            className="font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!checkoutUrl}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`email-${paymentId}`} className="text-xs">
          Send to
        </Label>
        <div className="flex gap-2">
          <Input
            id={`email-${paymentId}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="coach@example.com"
            className="text-sm"
          />
          <Button
            type="button"
            onClick={handleSend}
            loading={isPending}
            disabled={isPending || !email}
            size="sm"
          >
            {isPending ? "Sending..." : "Send breakdown"}
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-[var(--danger-ink)]">{error}</div>}
      {sentTo && (
        <div className="text-sm text-emerald-700">
          Sent to <span className="font-medium">{sentTo}</span>.
        </div>
      )}
    </div>
  );
}

/** Make a relative checkout URL show the deployed origin in the email body. */
function absolutize(url: string): string {
  if (typeof window === "undefined") return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${window.location.origin}${url}`;
}
