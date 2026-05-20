import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import { EventCreateForm } from "../_components/event-create-form";
import { createEventSeries } from "../actions";

export default async function NewEventPage() {
  await requireAdmin();

  const [venues, coachRows] = await Promise.all([
    prisma.venue.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true },
    }),
    prisma.coach.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        personId: { not: SYSTEM_NO_COACH_PERSON_ID },
      },
      include: {
        person: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const coaches = coachRows
    .map((c) => ({
      personId: c.personId,
      name: [c.person.firstName, c.person.lastName].filter(Boolean).join(" "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: "Events", href: "/admin/events" },
          { label: "New" },
        ]}
      />
      <PageHeader
        kicker="Admin · Events"
        title="New event"
        description="Create a single event your members can join and pay for directly. Use this for tournaments, socials, and Friday evening meetups."
      />
      <EventCreateForm
        action={createEventSeries}
        submitLabel="Create event"
        venues={venues}
        coaches={coaches}
      />
    </div>
  );
}
