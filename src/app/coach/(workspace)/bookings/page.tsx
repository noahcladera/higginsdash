import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { courtBookingClubFilter } from "@/lib/coach/club-scope";
import { prisma } from "@/lib/prisma";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import { Section } from "@/components/ui/section";
import { GroupedSection, GroupedRow } from "@/components/ui/grouped-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CalendarIcon, PlusIcon } from "@/components/icons";
import { BookingList, BookingRow } from "@/components/booking/booking-row";
import { getTerms } from "@/lib/tenant";
import { CoachPendingBanner } from "../_components/coach-pending-banner";
import { RecurringRequestRow } from "./_components/recurring-request-row";

/**
 * Coach's own booking history. Splits into upcoming + past, with deletion-
 * status badges so coaches can see at a glance which deletions admin has
 * approved/denied.
 */
export default async function CoachBookingsPage() {
  const { person, allowedClubIds } = await requireCoach();
  const terms = await getTerms();
  const bookingClub = courtBookingClubFilter(allowedClubIds);

  const now = new Date();
  const [upcoming, past, recurringRequests] = await Promise.all([
    prisma.courtBooking.findMany({
      where: {
        bookedByPersonId: person.id,
        startsAt: { gte: now },
        ...bookingClub,
      },
      orderBy: { startsAt: "asc" },
      include: { court: true, club: true },
    }),
    prisma.courtBooking.findMany({
      where: {
        bookedByPersonId: person.id,
        startsAt: { lt: now },
        ...bookingClub,
      },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: { court: true, club: true },
    }),
    prisma.recurringBlock.findMany({
      where: {
        requesterPersonId: person.id,
        status: { in: ["pending", "denied"] },
      },
      orderBy: { requestedAt: "desc" },
      take: 20,
      include: { court: true, club: true },
    }),
  ]);

  const pendingCount = upcoming.filter(
    (b) => b.status === "cancellation_requested",
  ).length;

  const purposeFor = (purpose: string) => ({
    label: purpose,
    tone: (purpose === "coaching" ? "joint" : "triaz") as "joint" | "triaz",
  });

  return (
    <div className="space-y-10">
      <ShellPageHeader
        kicker={terms.coach.role}
        title="Your bookings"
        description={`${terms.privateLesson.singular} bookings need an admin to approve cancellations.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/coach/book">
              <PlusIcon /> New booking
            </Link>
          </Button>
        }
      />

      <CoachPendingBanner count={pendingCount} />

      {recurringRequests.length > 0 && (
        <>
          <div className="lg:hidden">
            <GroupedSection header="Recurring lesson requests">
              {recurringRequests.map((r) => (
                <RecurringRequestRow key={r.id} request={r} />
              ))}
            </GroupedSection>
          </div>
          <Section
            title="Recurring lesson requests"
            description="Pending or denied. Approved series show up as recurring blocks on the calendar."
            className="hidden lg:block"
          >
            <div className="grouped-section md:elev-card divide-y divide-[var(--content-separator)]">
              {recurringRequests.map((r) => (
                <RecurringRequestRow key={r.id} request={r} />
              ))}
            </div>
          </Section>
        </>
      )}

      {/* Mobile grouped lists */}
      <div className="space-y-6 lg:hidden">
        <GroupedSection
          header="Upcoming"
          footer={
            upcoming.length === 0
              ? undefined
              : `${upcoming.length} booking${upcoming.length === 1 ? "" : "s"}`
          }
        >
          {upcoming.length === 0 ? (
            <GroupedRow className="p-0">
              <EmptyState
                icon={<CalendarIcon size={20} />}
                title="No upcoming bookings"
                description="Add one when you're ready."
                action={
                  <Button asChild tone="triaz" size="sm">
                    <Link href="/coach/book">
                      {`${terms.bookVerb} a ${terms.court.singular.toLowerCase()}`}
                    </Link>
                  </Button>
                }
              />
            </GroupedRow>
          ) : (
            upcoming.map((b) => (
              <GroupedRow key={b.id} className="p-0">
                <BookingRow
                  variant="grouped"
                  startsAt={b.startsAt}
                  endsAt={b.endsAt}
                  club={b.club.name}
                  court={b.court.name}
                  status={b.status}
                  bookedBy={{ name: "you", isYou: true }}
                  purpose={purposeFor(b.purpose)}
                  cancellationNote={
                    b.status === "cancellation_requested"
                      ? { reason: b.cancellationReason }
                      : undefined
                  }
                />
              </GroupedRow>
            ))
          )}
        </GroupedSection>

        <GroupedSection
          header="Past"
          footer={
            past.length === 0
              ? undefined
              : `${past.length} most recent`
          }
        >
          {past.length === 0 ? (
            <GroupedRow className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
              No past bookings yet.
            </GroupedRow>
          ) : (
            past.map((b) => (
              <GroupedRow key={b.id} className="p-0">
                <BookingRow
                  variant="grouped"
                  startsAt={b.startsAt}
                  endsAt={b.endsAt}
                  club={b.club.name}
                  court={b.court.name}
                  status={b.status}
                  bookedBy={{ name: "you", isYou: true }}
                  purpose={purposeFor(b.purpose)}
                />
              </GroupedRow>
            ))
          )}
        </GroupedSection>
      </div>

      {/* Desktop sections */}
      <Section
        title="Upcoming"
        description={
          upcoming.length === 0
            ? "Nothing on the books."
            : `${upcoming.length} booking${upcoming.length === 1 ? "" : "s"}`
        }
        className="hidden lg:block"
      >
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="No upcoming bookings"
            description="Add one when you're ready."
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/coach/book">
                  {`${terms.bookVerb} a ${terms.court.singular.toLowerCase()}`}
                </Link>
              </Button>
            }
          />
        ) : (
          <BookingList>
            {upcoming.map((b) => (
              <div key={b.id}>
                <BookingRow
                  startsAt={b.startsAt}
                  endsAt={b.endsAt}
                  club={b.club.name}
                  court={b.court.name}
                  status={b.status}
                  bookedBy={{ name: "you", isYou: true }}
                  purpose={purposeFor(b.purpose)}
                />
                {(b.cancellationReason || b.cancellationDenialReason) && (
                  <div className="space-y-0.5 px-4 pb-3 text-[11px] text-[var(--muted-foreground)]">
                    {b.status === "cancellation_requested" &&
                      b.cancellationReason && (
                        <div>Reason: {b.cancellationReason}</div>
                      )}
                    {b.cancellationDenialReason && (
                      <div className="text-[var(--destructive)]">
                        Denied: {b.cancellationDenialReason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </BookingList>
        )}
      </Section>

      <Section
        title="Past"
        description={
          past.length === 0 ? "Nothing yet." : `${past.length} most recent`
        }
        className="hidden lg:block"
      >
        {past.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="No past bookings"
            description="Anything you book will show up here once it happens."
          />
        ) : (
          <BookingList>
            {past.map((b) => (
              <BookingRow
                key={b.id}
                startsAt={b.startsAt}
                endsAt={b.endsAt}
                club={b.club.name}
                court={b.court.name}
                status={b.status}
                bookedBy={{ name: "you", isYou: true }}
                purpose={purposeFor(b.purpose)}
              />
            ))}
          </BookingList>
        )}
      </Section>
    </div>
  );
}
