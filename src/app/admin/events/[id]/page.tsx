import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PersonPicker } from "@/components/admin/person-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { ClassIcon } from "@/components/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addEnrollment,
  activateEnrollment,
  cancelSession,
  publishSeries,
  removeEnrollment,
  unpublishSeries,
  updateCoaches,
  updateLocation,
  updateNaming,
  updatePricing,
  updateRosterLimits,
  updateSchedule,
} from "../../classes/actions";
import { SectionCard } from "../../classes/_components/section-card";
import {
  EventCoachesSectionEditor,
  EventNamingSectionEditor,
  EventPricingSectionEditor,
  RosterLimitsSectionEditor,
} from "../../classes/_components/class-edit-sections";
import { parsePricingTiers } from "@/lib/classes/pricing-tiers";
import { EventLocationSectionEditor, EventScheduleSectionEditor } from "../_components/event-edit-sections";
import { getTerms } from "@/lib/tenant";

export default async function AdminEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const terms = await getTerms();

  const [series, venues, courts, coachRows, sessions, enrollments] = await Promise.all([
    prisma.classSeries.findUnique({
      where: { id },
      include: {
        venue: { select: { id: true, name: true, kind: true, clubId: true } },
        defaultCourt: { select: { id: true, name: true } },
        coaches: {
          select: {
            id: true,
            coachPersonId: true,
            role: true,
            coach: {
              select: {
                person: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.venue.findMany({
      where: { isActive: true, kind: "club" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.court.findMany({
      where: { isActive: true, isBookable: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, clubId: true, isBookable: true },
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
    prisma.classSession.findMany({
      where: { classSeriesId: id },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
    }),
    prisma.enrollment.findMany({
      where: { classSeriesId: id, status: { not: "withdrawn" } },
      orderBy: [{ status: "asc" }, { enrolledOn: "asc" }],
      include: {
        student: {
          include: {
            person: {
              include: {
                emails: {
                  where: { isPrimary: true, archivedAt: null },
                  select: { address: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!series || series.classType !== "event") notFound();

  const coaches = coachRows
    .map((coach) => ({
      personId: coach.personId,
      name: [coach.person.firstName, coach.person.lastName].filter(Boolean).join(" "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const leadRow = series.coaches.find((c) => c.role === "lead");
  const assistants = series.coaches.filter((c) => c.role === "assistant");
  const leadName =
    leadRow?.coachPersonId === SYSTEM_NO_COACH_PERSON_ID
      ? `No ${terms.coach.singular.toLowerCase()} yet`
      : [leadRow?.coach.person.firstName, leadRow?.coach.person.lastName]
          .filter(Boolean)
          .join(" ") || "Unassigned";
  const assistantNames = assistants.map(
    (assistant) =>
      [assistant.coach.person.firstName, assistant.coach.person.lastName]
        .filter(Boolean)
        .join(" ") || "Unassigned",
  );
  const eventStaffIds = [
    ...(leadRow && leadRow.coachPersonId !== SYSTEM_NO_COACH_PERSON_ID
      ? [leadRow.coachPersonId]
      : []),
    ...assistants.map((assistant) => assistant.coachPersonId),
  ];
  const pricingTiers =
    parsePricingTiers(series.pricingTiers) ??
    (series.pricePerSeries != null
      ? [
          {
            id: "primary",
            label: "Standard",
            amountEur: Number(series.pricePerSeries),
            forMembers: false,
          },
        ]
      : []);

  const eventDateIso = toIso(series.startsOn);
  const eventEndDateIso = toIso(series.endsOn);
  const startTime = toHHMM(series.startTime);
  const endTime = toHHMM(series.endTime);
  const courtBlockStartTime = series.courtBlockStartTime
    ? toHHMM(series.courtBlockStartTime)
    : null;
  const courtBlockEndTime = series.courtBlockEndTime
    ? toHHMM(series.courtBlockEndTime)
    : null;
  const assignedCourtIds =
    series.assignedCourtIds.length > 0
      ? series.assignedCourtIds
      : series.defaultCourtId
        ? [series.defaultCourtId]
        : [];
  const assignedCourtNames = courts
    .filter((court) => assignedCourtIds.includes(court.id))
    .map((court) => court.name);
  const excludedDateIsos = series.excludedDates.map((d) => toIso(d));
  const repeatsWeekly = eventEndDateIso !== eventDateIso;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Events", href: "/admin/events" },
          { label: series.name },
        ]}
      />

      <PageHeader
        kicker="Admin · Events"
        title={series.name}
        description="Manage event details, schedule, staff, pricing, and participants from one place."
        actions={
          <div className="flex items-center gap-2">
            {series.status === "published" ? (
              <form action={unpublishSeries}>
                <input type="hidden" name="classSeriesId" value={series.id} />
                <Button type="submit" variant="outline" size="sm">
                  Unpublish
                </Button>
              </form>
            ) : (
              <form action={publishSeries}>
                <input type="hidden" name="classSeriesId" value={series.id} />
                <Button type="submit" tone="triaz" size="sm">
                  Publish
                </Button>
              </form>
            )}
          </div>
        }
      />

      <SectionCard
        title="Venue"
        description="Where participants should go for this event."
        action={updateLocation}
        read={<p className="text-sm">{series.venue.name}</p>}
        edit={
          <EventLocationSectionEditor
            classSeriesId={series.id}
            defaultVenueId={series.venueId}
            venues={venues}
          />
        }
      />

      <SectionCard
        title="Schedule"
        description="Single-date event timing."
        action={updateSchedule}
        read={
          <div className="space-y-1 text-sm text-[var(--muted-foreground)]">
            <p>
              {formatDateTimeRange(eventDateIso, startTime, endTime)}
              {repeatsWeekly
                ? ` · weekly until ${formatShortDate(eventEndDateIso)}`
                : ""}
            </p>
            {assignedCourtNames.length > 0 ? (
              <p>
                {terms.court.plural}: {assignedCourtNames.join(", ")}
                {courtBlockStartTime && courtBlockEndTime
                  ? ` · ${courtBlockStartTime}–${courtBlockEndTime}`
                  : ""}
              </p>
            ) : null}
          </div>
        }
        edit={
          <EventScheduleSectionEditor
            classSeriesId={series.id}
            defaultDate={eventDateIso}
            defaultEndDate={eventEndDateIso}
            defaultStartTime={startTime}
            defaultEndTime={endTime}
            defaultAssignedCourtIds={assignedCourtIds}
            defaultCourtBlockStartTime={courtBlockStartTime}
            defaultCourtBlockEndTime={courtBlockEndTime}
            defaultExcludedDates={excludedDateIsos}
            venueKind={series.venue.kind}
            venueClubId={series.venue.clubId}
            courts={courts}
          />
        }
      />

      <SectionCard
        title={terms.coach.plural}
        description="Who is responsible for running this event."
        action={updateCoaches}
        read={
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-[var(--muted-foreground)]">Lead:</span> {leadName}
            </p>
            <p>
              <span className="text-[var(--muted-foreground)]">Assistants:</span>{" "}
              {assistantNames.length > 0 ? assistantNames.join(", ") : "None"}
            </p>
          </div>
        }
        edit={
          <EventCoachesSectionEditor
            classSeriesId={series.id}
            coaches={coaches}
            defaultPersonIds={eventStaffIds}
          />
        }
      />

      <SectionCard
        title="Event details"
        description="How the event appears on the portal."
        action={updateNaming}
        read={
          <div className="space-y-2 text-sm">
            <p className="font-medium">{series.name}</p>
            {series.publicNotes ? (
              <p className="whitespace-pre-wrap text-[var(--muted-foreground)]">
                {series.publicNotes}
              </p>
            ) : null}
          </div>
        }
        edit={
          <EventNamingSectionEditor
            classSeriesId={series.id}
            defaultName={series.name}
            defaultPublicNotes={series.publicNotes}
          />
        }
      />

      <SectionCard
        title="Capacity and comms"
        description="Participant limits, internal notes, cover image, and WhatsApp link."
        action={updateRosterLimits}
        read={
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-[var(--muted-foreground)]">Capacity:</span>{" "}
              {enrollments.length}/{series.maxStudents}
            </p>
            <p>
              <span className="text-[var(--muted-foreground)]">Minimum:</span>{" "}
              {series.minStudents ?? "None"}
            </p>
            <p>
              <span className="text-[var(--muted-foreground)]">WhatsApp:</span>{" "}
              {series.whatsappUrl ? "Configured" : "Not set"}
            </p>
          </div>
        }
        edit={
          <RosterLimitsSectionEditor
            classSeriesId={series.id}
            defaultMax={series.maxStudents}
            defaultMin={series.minStudents}
            defaultNotes={series.internalNotes}
            defaultWhatsappUrl={series.whatsappUrl}
            defaultCoverImageUrl={series.coverImageUrl}
            defaultCoverImageFocusY={series.coverImageFocusY}
          />
        }
      />

      <SectionCard
        title="Pricing"
        description="Ticket prices shown at checkout."
        action={updatePricing}
        read={
          <div className="space-y-1 text-sm">
            {pricingTiers.map((tier) => (
              <p key={tier.id}>
                {tier.label}:                 EUR {tier.amountEur.toFixed(2)}
              </p>
            ))}
          </div>
        }
        edit={<EventPricingSectionEditor classSeriesId={series.id} defaultTiers={pricingTiers} />}
      />

      <Section
        title={`Participants (${enrollments.length}/${series.maxStudents})`}
        description="Manage who is enrolled in this event."
      >
        <div className="space-y-4">
          <form action={addEnrollment} className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] p-4">
            <input type="hidden" name="classSeriesId" value={series.id} />
            <div className="min-w-[260px] flex-1 space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Add participant
              </label>
              <PersonPicker name="studentPersonId" placeholder="Search for a person..." required />
            </div>
            <Button type="submit" tone="triaz" size="sm">
              Add
            </Button>
          </form>

          {enrollments.length === 0 ? (
            <EmptyState
              icon={<ClassIcon size={20} />}
              title="No participants yet"
              description="Use the search box above to enroll the first participant."
            />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enrolled on</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        <div className="font-medium">
                          {[enrollment.student.person.firstName, enrollment.student.person.lastName]
                            .filter(Boolean)
                            .join(" ")}
                        </div>
                        {enrollment.student.person.emails[0]?.address ? (
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {enrollment.student.person.emails[0].address}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            enrollment.status === "active"
                              ? "success"
                              : enrollment.status === "waitlist"
                                ? "warning"
                                : "neutral"
                          }
                          variant="soft"
                          className="capitalize"
                        >
                          {enrollment.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-[var(--muted-foreground)]">
                        {enrollment.enrolledOn.toLocaleDateString("en-NL", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {enrollment.status === "waitlist" ? (
                            <form action={activateEnrollment}>
                              <input type="hidden" name="enrollmentId" value={enrollment.id} />
                              <Button type="submit" size="sm" variant="outline">
                                Activate
                              </Button>
                            </form>
                          ) : null}
                          <form action={removeEnrollment}>
                            <input type="hidden" name="enrollmentId" value={enrollment.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Remove
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Section>

      <Section
        title={`Sessions (${sessions.length})`}
        description="Single event session generated from the event date and time."
      >
        {sessions.length === 0 ? (
          <EmptyState
            icon={<ClassIcon size={20} />}
            title="No sessions generated"
            description="Save the schedule above to generate the event session."
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      {session.startsAt.toLocaleDateString("en-NL", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </TableCell>
                    <TableCell className="text-[var(--muted-foreground)]">
                      {formatTime(session.startsAt)} - {formatTime(session.endsAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={session.status === "scheduled" ? "success" : "neutral"}
                        variant="soft"
                        className="capitalize"
                      >
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{enrollments.length}</TableCell>
                    <TableCell className="text-right">
                      {session.status === "scheduled" ? (
                        <form action={cancelSession}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Cancel session
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}

function toHHMM(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTimeRange(dateIso: string, startTime: string, endTime: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dateLabel = utc.toLocaleDateString("en-NL", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${dateLabel} · ${startTime} - ${endTime}`;
}

function formatShortDate(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.toLocaleDateString("en-NL", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Amsterdam",
  });
}
