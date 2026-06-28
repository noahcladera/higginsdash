import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { findRecurringSlotConflicts } from "@/lib/booking/recurring";
import { getTerms } from "@/lib/tenant";
import { RecurringRequestCard } from "./request-decision-card";

/**
 * Admin queue of pending recurring booking requests (typically coach private
 * lessons). Each card shows what the series covers, who's blocked on which
 * dates *right now*, and gives the admin Approve / Deny controls.
 *
 * The live re-check ensures the admin sees the latest state — a class
 * scheduled after the request was filed will appear here.
 */
export default async function RecurringRequestsQueuePage() {
  await requireAdmin();
  const terms = await getTerms();

  const requests = await prisma.recurringBlock.findMany({
    where: { status: "pending" },
    orderBy: { requestedAt: "asc" },
    include: {
      court: { select: { name: true } },
      club: { select: { name: true } },
      requesterPerson: {
        select: {
          firstName: true,
          lastName: true,
          zzpCoach: { select: { isActive: true } },
        },
      },
    },
  });

  const cards = await Promise.all(
    requests.map(async (r) => {
      const startTimeLocal = `${pad(r.startTime.getUTCHours())}:${pad(r.startTime.getUTCMinutes())}`;
      const endTimeLocal = `${pad(r.endTime.getUTCHours())}:${pad(r.endTime.getUTCMinutes())}`;
      const durationMinutes =
        r.endTime.getUTCHours() * 60 +
        r.endTime.getUTCMinutes() -
        (r.startTime.getUTCHours() * 60 + r.startTime.getUTCMinutes());

      let liveClashes: Awaited<ReturnType<typeof findRecurringSlotConflicts>> = [];
      if (r.dayOfWeek) {
        liveClashes = await findRecurringSlotConflicts({
          courtId: r.courtId,
          dayOfWeek: r.dayOfWeek,
          startTimeLocal,
          durationMinutes,
          startsOn: isoFromDate(r.startsOn),
          endsOn: isoFromDate(r.endsOn),
          excludedDates: r.excludedDates.map(isoFromDate),
          ignoreRecurringBlockId: r.id,
          terms,
        });
      }

      return {
        id: r.id,
        coachName:
          `${r.requesterPerson.firstName} ${r.requesterPerson.lastName}`.trim(),
        isZzp: !!r.requesterPerson.zzpCoach?.isActive,
        clubName: r.club.name,
        courtName: r.court.name,
        purposeDescription: r.purposeDescription,
        dayOfWeek: r.dayOfWeek,
        startTimeLocal,
        endTimeLocal,
        startsOn: isoFromDate(r.startsOn),
        endsOn: isoFromDate(r.endsOn),
        excludedDates: r.excludedDates.map(isoFromDate),
        requestedAt: r.requestedAt.toISOString(),
        priceQuoted: r.priceQuoted ? r.priceQuoted.toString() : null,
        liveClashes,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Blocks", href: "/admin/blocks" },
          { label: "Requests" },
        ]}
      />
      <PageHeader
        kicker="Admin · Blocks"
        title="Recurring booking requests"
        description={`${terms.coach.plural}-submitted recurring ${terms.privateLesson.plural.toLowerCase()} awaiting your decision. Approving locks the slot in for the whole series; deny if the ${terms.club.singular.toLowerCase()} may need that slot for a ${terms.class.singular.toLowerCase()}.`}
      />

      {cards.length === 0 ? (
        <EmptyState
          title="Nothing pending"
          description="Recurring booking requests will appear here for your decision."
          action={
            <Link href="/admin/blocks" className="underline underline-offset-4">
              Back to blocks
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <RecurringRequestCard key={c.id} request={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFromDate(d: Date): string {
  const yy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  return `${yy}-${mm}-${dd}`;
}
