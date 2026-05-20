import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Soft interstitial that appears at the top of `/portal` when the
 * member's contact details are incomplete. We deliberately don't
 * hard-block the rest of the page — losing access to court bookings,
 * payment history, or kids' schedules over a missing postal code
 * would be hostile. Instead the banner sits at eye level with a
 * one-click path to `/portal/profile` and a clear list of what's
 * still missing.
 */
export function ProfileIncompleteBanner({
  missing,
}: {
  missing: string[];
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge tone="warning" variant="solid">
            Action needed
          </Badge>
          <h2 className="font-display text-lg font-medium tracking-tight">
            Please complete your contact details
          </h2>
          <p className="max-w-prose text-sm text-[var(--foreground)]">
            We're tightening the records so coaches and the office can
            reach you fast in an emergency. The following are still
            blank on your profile:
          </p>
          <ul className="text-sm text-[var(--foreground)]">
            {missing.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </div>
        <Button asChild tone="triaz" size="sm">
          <Link href="/portal/profile">Complete my profile</Link>
        </Button>
      </div>
    </div>
  );
}
