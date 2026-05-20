import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { MembershipGate } from "../book/membership-gate";
import type { LadderEligibility } from "@/lib/ladder/eligibility";

/**
 * Ineligible-viewer state for /portal/ladder/*. Mirrors the booking gate
 * — same MembershipGate component, plus a one-line explanation of *why*
 * the ladder is adult-only.
 */
export function LadderGate({
  reason,
  allClubs,
}: {
  reason: LadderEligibility["reason"];
  allClubs: { id: string; name: string; slug: string }[];
}) {
  const description = (() => {
    switch (reason) {
      case "child_viewer":
        return "The adult ladder is for grown-ups. There's a separate junior ranking we'll launch soon.";
      case "child_only":
        return "Your household has a youth membership but no adult seat yet. Add an adult Triaz membership to join the ladder.";
      case "no_membership":
      case "no_household":
      default:
        return "The ladder lives at Triaz — you'll need an active adult Triaz membership to enter. Randwijck members can still book courts and join lessons here.";
    }
  })();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Ladder"
        title="Adult ladder"
        description={description}
      />

      {reason === "child_viewer" ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-6 text-sm text-[var(--muted-foreground)]">
          Want to play matches between juniors? Hold tight — we&apos;re
          working on it. In the meantime, ask your coach about{" "}
          <Link
            href="/portal/programs"
            className="text-[var(--foreground)] underline-offset-4 hover:underline"
          >
            squad and group programs
          </Link>
          .
        </p>
      ) : (
        <MembershipGate clubs={allClubs} />
      )}
    </div>
  );
}
