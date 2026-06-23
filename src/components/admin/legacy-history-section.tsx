import { Section } from "@/components/ui/section";
import type { LegacyProfileView } from "@/lib/admin/legacy-profile";
import { LegacyHistoryPanel } from "@/components/admin/legacy-history-panel";

const euros = new Intl.NumberFormat("en-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Read-only "Customer 360" panel. Renders nothing when there's no matching
 * pre-migration profile, so callers can drop it in unconditionally (after the
 * feature-flag check). Formats server-side, then hands primitives to the
 * client panel that owns the pop-up.
 */
export function LegacyHistorySection({
  profile,
}: {
  profile: LegacyProfileView | null;
}) {
  if (!profile) return null;

  return (
    <Section
      title="Legacy history (pre-migration)"
      surface="card"
      description="Reference data assembled by the Higgins brain from GoTimmy, calendars, and office email — matched by email. Not part of the live record; verify before trusting."
    >
      <LegacyHistoryPanel
        displayName={profile.displayName}
        totalPaid={euros.format(profile.totalPaidCents / 100)}
        totalRefunded={euros.format(profile.totalRefundedCents / 100)}
        bookingCount={profile.bookingCount}
        emailCount={profile.emailCount}
        complaintCount={profile.complaintCount}
        firstSeen={isoDate(profile.firstSeen)}
        lastSeen={isoDate(profile.lastSeen)}
        payments={profile.data.payments}
        calendar={profile.data.calendar}
        emails={profile.data.emails}
      />
    </Section>
  );
}
