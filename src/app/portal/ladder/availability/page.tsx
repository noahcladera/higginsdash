import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/require-member";
import { getLadderEligibility } from "@/lib/ladder/eligibility";
import { getActiveSeason, getMyEntry } from "@/lib/ladder/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { TrophyIcon } from "@/components/icons";

import { AvailabilityForm } from "./availability-form";

export const dynamic = "force-dynamic";

export default async function PortalLadderAvailabilityPage() {
  const { person, householdId } = await requireMember();
  const eligibility = await getLadderEligibility({
    personId: person.id,
    householdId,
  });
  if (!eligibility.eligible) redirect("/portal/ladder");
  const season = await getActiveSeason();
  if (!season) redirect("/portal/ladder");
  const entry = await getMyEntry({ seasonId: season.id, personId: person.id });
  if (!entry || entry.status !== "active") {
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Ladder · availability"
          title="When can you play?"
          description="Join the ladder first, then set the windows you can usually play."
        />
        <EmptyState
          icon={<TrophyIcon size={20} />}
          title="Not on the ladder yet"
          description="Hop over to the ladder home and join — then come back here."
        />
      </div>
    );
  }

  const initial = entry.availability.map((a) => ({
    dayOfWeek: a.dayOfWeek,
    startMinute: a.startMinute,
    endMinute: a.endMinute,
    clubId: a.clubId ?? null,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Ladder · availability"
        title="When can you play?"
        description="Pick the windows you usually play. We'll only suggest opponents you actually overlap with — no awkward back-and-forth."
      />
      <Section
        title="Your weekly windows"
        description="Most ladder matches happen on weekend mornings or early afternoons. Add as many windows as you like."
        surface="card"
      >
        <AvailabilityForm
          eligibleClubs={eligibility.clubs}
          initial={initial}
        />
      </Section>
    </div>
  );
}
