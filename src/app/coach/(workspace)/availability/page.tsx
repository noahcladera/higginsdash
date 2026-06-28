import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import { GroupedSection } from "@/components/ui/grouped-list";
import { CoachAvailabilityForm } from "./availability-form";
import { getTerms } from "@/lib/tenant";

/**
 * "My availability" — coach declares the recurring weekly windows the
 * office should target when picking subs or scheduling new lessons.
 * Empty list = "no preference, ask anytime".
 */
export default async function CoachAvailabilityPage() {
  const { person } = await requireCoach();
  const terms = await getTerms();

  const rows = await prisma.coachAvailability.findMany({
    where: { personId: person.id },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });

  const initial = rows.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
  }));

  return (
    <div className="space-y-10">
      <ShellPageHeader
        kicker={terms.coach.role}
        title="My availability"
        description={`Tell the office which weekly windows work for you. We use this when picking substitutes and when scheduling new ${terms.class.plural.toLowerCase()}, so we do not ping you outside these hours.`}
      />

      <GroupedSection
        header="Weekly windows"
        footer="Times are local Amsterdam time. Leave empty if you'd rather we just ask anytime."
        className="grouped-section md:elev-panel md:p-4"
      >
        <li className="list-none p-0">
          <CoachAvailabilityForm initial={initial} />
        </li>
      </GroupedSection>
    </div>
  );
}
