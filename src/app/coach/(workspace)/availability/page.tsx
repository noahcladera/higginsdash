import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="space-y-8">
      <PageHeader
        kicker={terms.coach.role}
        title="My availability"
        description={`Tell the office which weekly windows work for you. We use this when picking substitutes and when scheduling new ${terms.class.plural.toLowerCase()}, so we do not ping you outside these hours.`}
      />

      <Section
        title="Weekly windows"
        description="Add a row per block. Times are local Amsterdam time. Leave empty if you'd rather we just ask anytime."
      >
        <CoachAvailabilityForm initial={initial} />
      </Section>
    </div>
  );
}
