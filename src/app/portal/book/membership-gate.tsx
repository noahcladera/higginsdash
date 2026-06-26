import Link from "next/link";

import {
  ClubTilesGrid,
  JointCrossSell,
  MembershipPitchHeader,
} from "@/app/portal/_components/membership-pitch";
import { jointSavings } from "@/lib/pricing";

/**
 * Renders the "you don't have a membership yet" state of /portal/book.
 *
 * Uses the shared {@link ClubTilesGrid} + {@link JointCrossSell}
 * components so this surface stays in lockstep with the same pitch
 * shown on `/portal` and `/portal/membership`.
 */
export function MembershipGate({
  clubs,
  marketingImages = {},
}: {
  clubs: { id: string; name: string; slug: string }[];
  marketingImages?: Record<string, string>;
}) {
  const adultJointSaving = jointSavings("adult", { isReturning: true });
  const known = clubs.filter(
    (c) => c.slug === "triaz" || c.slug === "randwijck",
  );

  return (
    <div className="space-y-8">
      <MembershipPitchHeader />

      <ClubTilesGrid clubs={clubs} marketingImages={marketingImages} />

      {known.length === 2 && <JointCrossSell saving={adultJointSaving} />}

      <p className="text-center text-xs text-[var(--muted-foreground)]">
        Got a code from the office or already a member?{" "}
        <Link
          href="/portal/membership"
          className="text-[var(--foreground)] underline-offset-4 hover:underline"
        >
          See all membership options
        </Link>
        .
      </p>
    </div>
  );
}
