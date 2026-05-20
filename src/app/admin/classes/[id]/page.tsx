import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClassIcon } from "@/components/icons";
import { PersonPicker } from "@/components/admin/person-picker";
import { getStudentContactsBulk } from "@/lib/contacts/queries";
import { ContactButton } from "@/components/contacts/contact-button";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import type { Terms } from "@/lib/tenant/terms";
import {
  computeClassTiming,
  formatTimingLine,
  deliveryModeLabel,
} from "@/lib/classes/timing";
import {
  updateLocation,
  updateSchedule,
  updateCoaches,
  updateNaming,
  updateRosterLimits,
  updatePricing,
  updateAgeAndLevel,
  updateGroups,
  cancelSession,
  addEnrollment,
  activateEnrollment,
  removeEnrollment,
  resolveEnrollmentReview,
  publishSeries,
  unpublishSeries,
  duplicateClassSeries,
} from "../actions";
import { ClassSummaryCard } from "../_components/class-summary-card";
import { ScheduleCalendar } from "../_components/schedule-calendar";
import { SectionCard } from "../_components/section-card";
import {
  LocationSectionEditor,
  ScheduleSectionEditor,
  CoachesSectionEditor,
  NamingSectionEditor,
  EventNamingSectionEditor,
  EventCoachesSectionEditor,
  EventPricingSectionEditor,
  CampPricingSectionEditor,
  RosterLimitsSectionEditor,
  PricingSectionEditor,
  AgeAndLevelSectionEditor,
  GroupsSectionEditor,
} from "../_components/class-edit-sections";
import {
  formatSkillLevel,
  type SkillLevelValue,
} from "@/lib/skill-levels";
import type { GroupRow } from "../_components/groups-field";
import { parsePricingTiers } from "@/lib/classes/pricing-tiers";
import { parseCampOptions } from "@/lib/classes/camp-options";

const DAY_LONG: Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  string
> = {
  mon: "Mondays",
  tue: "Tuesdays",
  wed: "Wednesdays",
  thu: "Thursdays",
  fri: "Fridays",
  sat: "Saturdays",
  sun: "Sundays",
};

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);

  const [series, programs, seasons, venues, schools, courts, coachRows] =
    await Promise.all([
      prisma.classSeries.findUnique({
        where: { id },
        include: {
          venue: true,
          defaultCourt: { select: { id: true, name: true } },
          school: {
            select: { id: true, name: true, coachArriveAtHubMinutes: true },
          },
          program: { select: { id: true, name: true, targetAudience: true } },
          season: { select: { id: true, name: true } },
          coaches: {
            select: {
              coachPersonId: true,
              role: true,
              participatesInPickup: true,
              groupScopes: { select: { groupId: true } },
              coach: {
                select: {
                  personId: true,
                  person: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
          groups: {
            orderBy: { displayOrder: "asc" },
            select: {
              id: true,
              name: true,
              displayOrder: true,
              endTime: true,
              maxStudents: true,
              minStudents: true,
              minAge: true,
              maxAge: true,
              eligibleSkillLevels: true,
              internalNotes: true,
              archivedAt: true,
              _count: { select: { enrollments: true } },
            },
          },
        },
      }),
      prisma.program.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, targetAudience: true },
      }),
      prisma.season.findMany({
        where: { isActive: true },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          audience: true,
          startsOn: true,
          endsOn: true,
          defaultExcludedDates: true,
        },
      }),
      prisma.venue.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, kind: true, clubId: true },
      }),
      prisma.school.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.court.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, clubId: true },
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
  if (!series) notFound();

  const coaches = coachRows
    .map((c) => ({
      personId: c.personId,
      name: [c.person.firstName, c.person.lastName].filter(Boolean).join(" "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Split the series roster into lead + assistants, and make sure the
  // synthetic NO COACH YET placeholder appears as "unassigned" rather
  // than as an option the admin can stumble upon.
  const leadRow = series.coaches.find((c) => c.role === "lead");
  const assistantRows = series.coaches.filter((c) => c.role === "assistant");

  const leadPersonId = leadRow?.coachPersonId ?? null;
  const leadIsPlaceholder =
    !leadPersonId || leadPersonId === SYSTEM_NO_COACH_PERSON_ID;
  const leadDefault = leadIsPlaceholder ? "" : leadPersonId;
  const assistantsDefault = assistantRows.map((r) => r.coachPersonId);
  const isEvent = series.classType === "event";
  const isCamp = series.classType === "camp";
  const eventStaffIds = [
    ...(leadDefault ? [leadDefault] : []),
    ...assistantsDefault,
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
  const campOptions = parseCampOptions(series.campOptions);

  const leadCoachName = leadIsPlaceholder
    ? "NO COACH YET"
    : [
        leadRow?.coach.person.firstName,
        leadRow?.coach.person.lastName,
      ]
        .filter(Boolean)
        .join(" ") || "—";
  const assistantCoachNames = assistantRows.map(
    (r) =>
      [r.coach.person.firstName, r.coach.person.lastName]
        .filter(Boolean)
        .join(" ") || "—",
  );

  const [sessions, enrollments, plannedAbsenceRows, pendingSubRequests] =
    await Promise.all([
      prisma.classSession.findMany({
        where: { classSeriesId: id },
        orderBy: { startsAt: "asc" },
        include: {
          court: { select: { name: true } },
          coaches: {
            include: {
              coach: {
                select: {
                  person: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      }),
    prisma.enrollment.findMany({
      where: { classSeriesId: id, status: { not: "withdrawn" } },
      // `findMany` already returns scalar fields; keep the shape
      // explicit so the roster table can render the review badge.
      include: {
        student: {
          include: {
            person: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
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
      orderBy: { enrolledOn: "asc" },
    }),
    prisma.attendance.groupBy({
      by: ["classSessionId"],
      where: {
        classSession: { classSeriesId: id },
        status: "excused",
      },
      _count: { _all: true },
    }),
    prisma.coachSubRequest.findMany({
      where: {
        status: "pending",
        classSession: { classSeriesId: id },
      },
      select: {
        classSessionId: true,
        requesterCoach: {
          select: { firstName: true, lastName: true },
        },
      },
    }),
  ]);
  const plannedAbsenceBySession = new Map(
    plannedAbsenceRows.map((r) => [r.classSessionId, r._count._all]),
  );
  const enrolledContactGroups = await getStudentContactsBulk(
    enrollments.map((e) => e.studentPersonId),
  );
  const contactByEnrolled = new Map(
    enrolledContactGroups.map((g) => [g.personId, g]),
  );
  const pendingSubBySession = new Map<string, string>();
  for (const r of pendingSubRequests) {
    const name =
      `${r.requesterCoach.firstName} ${r.requesterCoach.lastName}`.trim();
    pendingSubBySession.set(r.classSessionId, name);
  }

  const activeEnrollmentCount = enrollments.filter(
    (e) => e.status === "active",
  ).length;

  const startsOnISO = dateToISO(series.startsOn);
  const endsOnISO = dateToISO(series.endsOn);
  const startTimeHHMM = timeToHHMM(series.startTime);
  const endTimeHHMM = timeToHHMM(series.endTime);
  const pickupAtHHMM = series.pickupAt ? timeToHHMM(series.pickupAt) : null;
  const excludedDatesISO = series.excludedDates.map(dateToISO);
  // `dayOfWeek` is nullable in the schema (theoretical one-off classes)
  // but every class series created through this UI has one. Default to
  // Monday defensively so the summary + calendar never render empty.
  const dayOfWeek = series.dayOfWeek ?? "mon";

  // Resolve the lead/assistant roster up-front so we can both
  // populate the Sub-groups editor's coach dropdowns and map each
  // group's currently-assigned scope back to its owning coach name.
  const realRoster = series.coaches.filter(
    (c) =>
      c.coachPersonId !== SYSTEM_NO_COACH_PERSON_ID &&
      (c.role === "lead" || c.role === "assistant"),
  );
  const rosterCoachOptions = realRoster
    .map((c) => ({
      personId: c.coachPersonId,
      name:
        [c.coach.person.firstName, c.coach.person.lastName]
          .filter(Boolean)
          .join(" ") || "—",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const coachNameByPersonId = new Map(
    rosterCoachOptions.map((c) => [c.personId, c.name]),
  );

  // Build groupId → coachPersonId so the Sub-groups editor can pre-fill
  // each row's "owning coach" dropdown. By construction at most one
  // coach per group lives here after this change, but historic rows
  // may have multiple — pick the lead's scope first, then the first
  // assistant's, so the surviving choice is stable across reloads.
  const coachByGroupId = new Map<string, string>();
  for (const c of [...realRoster].sort((a, b) =>
    a.role === "lead" ? -1 : b.role === "lead" ? 1 : 0,
  )) {
    for (const scope of c.groupScopes) {
      if (!coachByGroupId.has(scope.groupId)) {
        coachByGroupId.set(scope.groupId, c.coachPersonId);
      }
    }
  }

  // Project DB rows into the shape the GroupsField repeater wants.
  // We feed the row's `localKey` from the group's database id so the
  // React key stays stable across renders, and pass `id` through
  // separately so the wire payload can carry it for the update path.
  const visibleGroups = series.groups.filter((g) => g.archivedAt == null);
  const groupRows: GroupRow[] = visibleGroups.map((g) => ({
    localKey: g.id,
    id: g.id,
    name: g.name,
    endTime: timeToHHMM(g.endTime),
    maxStudents: g.maxStudents,
    minStudents: g.minStudents != null ? String(g.minStudents) : "",
    minAge: g.minAge != null ? String(g.minAge) : "",
    maxAge: g.maxAge != null ? String(g.maxAge) : "",
    eligibleSkillLevels: g.eligibleSkillLevels as SkillLevelValue[],
    internalNotes: g.internalNotes ?? "",
    coachPersonId: coachByGroupId.get(g.id) ?? "",
  }));

  // Rich coach assignments payload for the CoachAssignmentField. Only
  // pickup-tickbox state is carried — per-group teaching lives on the
  // Groups card.
  const richAssignments = realRoster.map((c) => ({
    coachPersonId: c.coachPersonId,
    role: c.role as "lead" | "assistant",
    participatesInPickup: c.participatesInPickup,
  }));

  const audienceForUI: "kids" | "adults" | "mixed" =
    series.program.targetAudience;

  // Convert Prisma Date columns into ISO `YYYY-MM-DD` strings so the
  // client-only Season editor can autofill the schedule date pickers
  // without hauling Date objects across the boundary.
  const seasonOptions = seasons.map((s) => ({
    id: s.id,
    name: s.name,
    audience: s.audience,
    startsOn: s.startsOn ? dateToISO(s.startsOn) : "",
    endsOn: s.endsOn ? dateToISO(s.endsOn) : "",
    defaultExcludedDates: s.defaultExcludedDates.map((d) => dateToISO(d)),
  }));

  const currentSeasonName = series.season?.name ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin · Classes"
        title={series.name}
        description={`${series.program.name}${
          series.season ? ` · ${series.season.name}` : ""
        }`}
        actions={
          <div className="flex items-center gap-2">
            <PublishStatusControl
              classSeriesId={series.id}
              status={series.status}
              publishedAt={series.publishedAt}
            />
            <form action={duplicateClassSeries}>
              <input
                type="hidden"
                name="classSeriesId"
                value={series.id}
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                title={`Create a draft copy of this series — same schedule, ${terms.classGroup.plural.toLowerCase()} and ${terms.coach.plural.toLowerCase()}, fresh roster.`}
              >
                Duplicate
              </Button>
            </form>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/classes">← Back to classes</Link>
            </Button>
          </div>
        }
      />

      {/* Summary tile + read-only calendar ------------------------------ */}
      <div className="space-y-4">
        <ClassSummaryCard
          name={series.name}
          programName={series.program.name}
          seasonName={series.season?.name ?? null}
          deliveryMode={series.deliveryMode}
          venueName={series.venue.name}
          schoolName={series.school?.name ?? null}
          dayOfWeek={dayOfWeek}
          startTimeHHMM={startTimeHHMM}
          endTimeHHMM={endTimeHHMM}
          pickupAtHHMM={pickupAtHHMM}
          startsOnISO={startsOnISO}
          endsOnISO={endsOnISO}
          leadCoachName={leadCoachName}
          assistantCoachNames={assistantCoachNames}
          enrolled={activeEnrollmentCount}
          maxStudents={series.maxStudents}
          minStudents={series.minStudents}
          sessionsTotal={sessions.length}
          sessionsExcluded={excludedDatesISO.length}
          coachesSectionLabel={terms.coach.plural}
          subGroups={visibleGroups.map((g) => ({
            name: g.name,
            endTimeHHMM: timeToHHMM(g.endTime),
            minAge: g.minAge,
            maxAge: g.maxAge,
            enrolled: g._count.enrollments,
            maxStudents: g.maxStudents,
          }))}
        />
        <ScheduleCalendarPreview
          startsOn={startsOnISO}
          endsOn={endsOnISO}
          dayOfWeek={dayOfWeek}
          excludedDates={excludedDatesISO}
        />
      </div>

      {/* Section cards — locked by default ------------------------------ */}
      <SectionCard
        title="Location"
        description="Change where the class meets and, for pickup classes, which school we collect from."
        action={updateLocation}
        read={
          <LocationReadout
            deliveryMode={series.deliveryMode}
            venueName={series.venue.name}
            schoolName={series.school?.name ?? null}
            pickupAtHHMM={pickupAtHHMM}
          />
        }
        edit={
          <LocationSectionEditor
            classSeriesId={series.id}
            defaultDeliveryMode={series.deliveryMode}
            defaultVenueId={series.venueId}
            defaultSchoolId={series.schoolId}
            defaultPickupAt={pickupAtHHMM}
            venues={venues}
            schools={schools}
          />
        }
      />

      <SectionCard
        title="Schedule"
        description="Weekday, time window, date range and no-lesson dates. Changing anything here regenerates future sessions."
        action={updateSchedule}
        read={
          <ScheduleReadout
            dayOfWeek={dayOfWeek}
            startTimeHHMM={startTimeHHMM}
            endTimeHHMM={endTimeHHMM}
            courtName={series.defaultCourt?.name ?? null}
            courtBlockStartHHMM={
              series.courtBlockStartTime
                ? timeToHHMM(series.courtBlockStartTime)
                : null
            }
            courtBlockEndHHMM={
              series.courtBlockEndTime ? timeToHHMM(series.courtBlockEndTime) : null
            }
            startsOnISO={startsOnISO}
            endsOnISO={endsOnISO}
            excludedCount={excludedDatesISO.length}
            sessionsTotal={sessions.length}
            seasonName={currentSeasonName}
          />
        }
        edit={
          <ScheduleSectionEditor
            classSeriesId={series.id}
            defaultDayOfWeek={dayOfWeek}
            defaultStartTime={startTimeHHMM}
            defaultEndTime={endTimeHHMM}
            defaultStartsOn={startsOnISO}
            defaultEndsOn={endsOnISO}
            defaultExcludedDates={excludedDatesISO}
            defaultSeasonId={series.seasonId}
            defaultCourtId={series.defaultCourtId}
            defaultCourtBlockStartTime={
              series.courtBlockStartTime
                ? timeToHHMM(series.courtBlockStartTime)
                : null
            }
            defaultCourtBlockEndTime={
              series.courtBlockEndTime ? timeToHHMM(series.courtBlockEndTime) : null
            }
            venueKind={series.venue.kind}
            venueClubId={series.venue.clubId}
            courts={courts}
            audience={audienceForUI}
            seasons={seasonOptions}
            showSeason={series.classType !== "event"}
          />
        }
      />

      <SectionCard
        title={terms.coach.plural}
        description={`One lead ${terms.coach.singular.toLowerCase()} plus any assistants. Per-session substitutions live on each session row below.`}
        action={updateCoaches}
        read={
          <CoachesReadout
            assignments={series.coaches.map((c) => ({
              coachPersonId: c.coachPersonId,
              role: c.role as "lead" | "assistant",
              name:
                c.coachPersonId === SYSTEM_NO_COACH_PERSON_ID
                  ? `No ${terms.coach.singular.toLowerCase()} yet`
                  : [c.coach.person.firstName, c.coach.person.lastName]
                      .filter(Boolean)
                      .join(" ") || "—",
              participatesInPickup: c.participatesInPickup,
            }))}
            isPickup={series.deliveryMode === "pickup"}
          />
        }
        edit={
          isEvent ? (
            <EventCoachesSectionEditor
              classSeriesId={series.id}
              coaches={coaches}
              defaultPersonIds={eventStaffIds}
            />
          ) : (
            <CoachesSectionEditor
              classSeriesId={series.id}
              coaches={coaches}
              leadDefault={leadDefault}
              assistantsDefault={assistantsDefault}
              assignmentsDefault={richAssignments}
              isPickup={series.deliveryMode === "pickup"}
            />
          )
        }
      />

      <SectionCard
        title="Age &amp; level"
        description="Age band and eligible level brackets for the whole series. Per-sub-group bands further down can narrow these."
        action={updateAgeAndLevel}
        read={
          <AgeAndLevelReadout
            minAge={series.minAge}
            maxAge={series.maxAge}
            levels={series.eligibleSkillLevels as SkillLevelValue[]}
          />
        }
        edit={
          <AgeAndLevelSectionEditor
            classSeriesId={series.id}
            audience={audienceForUI}
            defaultMinAge={series.minAge}
            defaultMaxAge={series.maxAge}
            defaultLevels={series.eligibleSkillLevels as SkillLevelValue[]}
          />
        }
      />

      {!isEvent && (
      <SectionCard
        title="Sub-groups"
        description={`Split the ${terms.class.singular.toLowerCase()} into ${terms.classGroup.plural.toLowerCase()} when one ${terms.court.singular.toLowerCase()} block hosts two age bands or two end times. Removing a ${terms.classGroup.singular.toLowerCase()} requires moving its ${terms.student.plural.toLowerCase()} first.`}
        action={updateGroups}
        read={
          <GroupsReadout
            terms={terms}
            groups={visibleGroups.map((g) => ({
              name: g.name,
              endTimeHHMM: timeToHHMM(g.endTime),
              minAge: g.minAge,
              maxAge: g.maxAge,
              levels: g.eligibleSkillLevels as SkillLevelValue[],
              maxStudents: g.maxStudents,
              enrolledCount: g._count.enrollments,
              coachName:
                coachNameByPersonId.get(coachByGroupId.get(g.id) ?? "") ??
                null,
            }))}
            multipleGroups={visibleGroups.length >= 2}
          />
        }
        edit={
          <GroupsSectionEditor
            classSeriesId={series.id}
            audience={audienceForUI}
            seriesEndTime={endTimeHHMM}
            defaultGroups={groupRows}
            coachOptions={rosterCoachOptions}
          />
        }
      />
      )}

      <SectionCard
        title="Naming"
        description={
          isEvent
            ? "Event title and description shown on the portal."
            : `How this ${terms.class.singular.toLowerCase()} appears to ${terms.parent.plural.toLowerCase()} and ${terms.coach.plural.toLowerCase()}. Pick the ${terms.season.singular.toLowerCase()} in the Schedule card above.`
        }
        action={updateNaming}
        read={
          isEvent ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">{series.name}</p>
              {series.publicNotes && (
                <p className="text-[var(--muted-foreground)] whitespace-pre-wrap">
                  {series.publicNotes}
                </p>
              )}
            </div>
          ) : (
            <NamingReadout
              name={series.name}
              seasonName={currentSeasonName}
              programName={series.program.name}
              isPickup={series.deliveryMode === "pickup"}
            />
          )
        }
        edit={
          isEvent ? (
            <EventNamingSectionEditor
              classSeriesId={series.id}
              defaultName={series.name}
              defaultPublicNotes={series.publicNotes}
            />
          ) : (
            <NamingSectionEditor
              classSeriesId={series.id}
              defaultProgramId={series.programId}
              defaultName={series.name}
              defaultNameOverride={series.nameOverride}
              deliveryMode={series.deliveryMode}
              audience={series.program.targetAudience}
              programs={programs}
            />
          )
        }
      />

      <SectionCard
        title="Roster limits"
        description="Capacity, minimum headcount, internal notes, and the WhatsApp group invite."
        action={updateRosterLimits}
        read={
          <RosterLimitsReadout
            maxStudents={series.maxStudents}
            minStudents={series.minStudents}
            notes={series.internalNotes}
            whatsappUrl={series.whatsappUrl}
          />
        }
        edit={
          <RosterLimitsSectionEditor
            classSeriesId={series.id}
            defaultMax={series.maxStudents}
            defaultMin={series.minStudents}
            defaultNotes={series.internalNotes}
            defaultWhatsappUrl={series.whatsappUrl}
            defaultCoverImageUrl={series.coverImageUrl}
          />
        }
      />

      <SectionCard
        title="Pricing"
        description="What members see in the enrollment panel and pay through the demo Mollie checkout."
        action={updatePricing}
        read={
          <PricingReadout
            pricePerSession={
              series.pricePerSession != null
                ? Number(series.pricePerSession)
                : null
            }
            pricePerSeries={
              series.pricePerSeries != null
                ? Number(series.pricePerSeries)
                : null
            }
            sessionCount={
              sessions.filter((s) => s.status !== "cancelled").length
            }
          />
        }
        edit={
          isEvent ? (
            <EventPricingSectionEditor
              classSeriesId={series.id}
              defaultTiers={pricingTiers}
            />
          ) : isCamp ? (
            <CampPricingSectionEditor
              classSeriesId={series.id}
              defaultOptions={campOptions}
            />
          ) : (
            <PricingSectionEditor
              classSeriesId={series.id}
              defaultPricePerSession={
                series.pricePerSession != null
                  ? Number(series.pricePerSession)
                  : null
              }
            />
          )
        }
      />

      {/* Roster + sessions (existing CRUD) ------------------------------ */}
      <Section
        title={`Roster (${enrollments.length}/${series.maxStudents})`}
        description="Students currently enrolled. Removing withdraws them — their attendance history stays intact."
      >
        <div className="space-y-4">
          <form
            action={addEnrollment}
            className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] p-4"
          >
            <input type="hidden" name="classSeriesId" value={series.id} />
            <div className="min-w-[260px] flex-1 space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Add a student
              </label>
              <PersonPicker
                name="studentPersonId"
                placeholder="Search for a person…"
                required
              />
            </div>
            <Button type="submit" tone="triaz" size="sm">
              Enroll
            </Button>
          </form>

          {enrollments.length === 0 ? (
            <EmptyState
              icon={<ClassIcon size={20} />}
              title="Nobody enrolled yet"
              description="Use the search above to add the first student."
            />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enrolled on</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium">
                          {[e.student.person.firstName, e.student.person.lastName]
                            .filter(Boolean)
                            .join(" ")}
                        </div>
                        {e.student.person.emails[0]?.address && (
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {e.student.person.emails[0].address}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            tone={
                              e.status === "active"
                                ? "success"
                                : e.status === "waitlist"
                                  ? "warning"
                                  : "neutral"
                            }
                            variant="soft"
                            className="capitalize"
                          >
                            {e.status.replace("_", " ")}
                          </Badge>
                          {e.requiresReview && (
                            <Badge
                              tone="warning"
                              variant="soft"
                              className="text-[10px]"
                              title={e.reviewReason ?? undefined}
                            >
                              Review · {formatReviewReason(e.reviewReason)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-[var(--muted-foreground)]">
                        {e.enrolledOn.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const group = contactByEnrolled.get(e.studentPersonId);
                          if (!group || group.targets.length === 0) {
                            return (
                              <span className="text-xs text-[var(--muted-foreground)]">
                                —
                              </span>
                            );
                          }
                          const studentName = [
                            e.student.person.firstName,
                            e.student.person.lastName,
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <ContactButton
                              group={group}
                              subjectName={studentName}
                              brandName={brand.shortName}
                              size="xs"
                            />
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {e.requiresReview && (
                            <form action={resolveEnrollmentReview}>
                              <input
                                type="hidden"
                                name="enrollmentId"
                                value={e.id}
                              />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                title="Mark the age-band exception as confirmed with the family."
                              >
                                Resolve review
                              </Button>
                            </form>
                          )}
                          {e.status !== "active" && (
                            <form action={activateEnrollment}>
                              <input
                                type="hidden"
                                name="enrollmentId"
                                value={e.id}
                              />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                tone="triaz"
                              >
                                Mark as paid
                              </Button>
                            </form>
                          )}
                          <form action={removeEnrollment}>
                            <input
                              type="hidden"
                              name="enrollmentId"
                              value={e.id}
                            />
                            <Button type="submit" variant="ghost" size="sm">
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
        description="Auto-generated from the schedule. Cancel one if the class is skipping that week."
      >
        {sessions.length === 0 ? (
          <EmptyState
            icon={<ClassIcon size={20} />}
            title="No sessions"
            description="Adjust the schedule dates above to generate sessions."
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Timing</TableHead>
                  <TableHead>Court</TableHead>
                  <TableHead>{terms.coach.plural}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => {
                  const timing = computeClassTiming({
                    session: { startsAt: s.startsAt, endsAt: s.endsAt },
                    series: {
                      deliveryMode: series.deliveryMode,
                      pickupAt: series.pickupAt,
                    },
                    school: series.school
                      ? {
                          coachArriveAtHubMinutes:
                            series.school.coachArriveAtHubMinutes,
                        }
                      : null,
                  });
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="tabular font-medium">
                          {formatDay(s.startsAt)}
                        </div>
                      </TableCell>
                      <TableCell className="tabular text-xs text-[var(--muted-foreground)]">
                        {formatTimingLine(timing, series.deliveryMode)}
                      </TableCell>
                      <TableCell className="text-[var(--muted-foreground)]">
                        {s.court?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <SessionCoachesCell
                          sessionCoaches={s.coaches}
                          seriesLead={
                            leadRow
                              ? {
                                  personId: leadRow.coachPersonId,
                                  name: leadCoachName,
                                }
                              : null
                          }
                          seriesAssistants={assistantRows.map((r) => ({
                            personId: r.coachPersonId,
                            name:
                              [
                                r.coach.person.firstName,
                                r.coach.person.lastName,
                              ]
                                .filter(Boolean)
                                .join(" ") || "—",
                          }))}
                          pendingSubFor={pendingSubBySession.get(s.id) ?? null}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            tone={
                              s.status === "cancelled"
                                ? "danger"
                                : s.status === "completed"
                                  ? "neutral"
                                  : "triaz"
                            }
                            variant="soft"
                            className="capitalize"
                          >
                            {s.status}
                          </Badge>
                          {(plannedAbsenceBySession.get(s.id) ?? 0) > 0 && (
                            <Badge tone="warning" variant="soft">
                              {plannedAbsenceBySession.get(s.id)} skipping
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status === "scheduled" && (
                          <form action={cancelSession}>
                            <input
                              type="hidden"
                              name="sessionId"
                              value={s.id}
                            />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                            >
                              Cancel
                            </Button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only readouts rendered by each SectionCard in its locked state
// ---------------------------------------------------------------------------

function LocationReadout({
  deliveryMode,
  venueName,
  schoolName,
  pickupAtHHMM,
}: {
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueName: string;
  schoolName: string | null;
  pickupAtHHMM: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Badge
        tone={
          deliveryMode === "pickup"
            ? "joint"
            : deliveryMode === "onsite"
              ? "warning"
              : "triaz"
        }
        variant="soft"
      >
        {deliveryModeLabel(deliveryMode)}
      </Badge>
      <div>
        {deliveryMode === "pickup" && schoolName
          ? `${schoolName} → ${venueName}`
          : venueName}
      </div>
      {deliveryMode === "pickup" && pickupAtHHMM && (
        <div className="tabular text-xs text-[var(--muted-foreground)]">
          · pickup at {pickupAtHHMM}
        </div>
      )}
    </div>
  );
}

function ScheduleReadout({
  dayOfWeek,
  startTimeHHMM,
  endTimeHHMM,
  courtName,
  courtBlockStartHHMM,
  courtBlockEndHHMM,
  startsOnISO,
  endsOnISO,
  excludedCount,
  sessionsTotal,
  seasonName,
}: {
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  startTimeHHMM: string;
  endTimeHHMM: string;
  courtName: string | null;
  courtBlockStartHHMM: string | null;
  courtBlockEndHHMM: string | null;
  startsOnISO: string;
  endsOnISO: string;
  excludedCount: number;
  sessionsTotal: number;
  /** The season this class is pinned to (or `null` for free-form). */
  seasonName: string | null;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {DAY_LONG[dayOfWeek]} {startTimeHHMM}–{endTimeHHMM}
        </span>
        {seasonName ? (
          <Badge variant="soft" tone="neutral">
            {seasonName}
          </Badge>
        ) : (
          <Badge variant="soft" tone="warning">
            No season
          </Badge>
        )}
      </div>
      <div className="tabular text-xs text-[var(--muted-foreground)]">
        Runs {formatDateRange(startsOnISO, endsOnISO)} · {sessionsTotal} sessions
        {excludedCount > 0 && ` · ${excludedCount} excluded`}
      </div>
      {courtName ? (
        <div className="text-xs text-[var(--muted-foreground)]">
          Court: {courtName}
          {courtBlockStartHHMM && courtBlockEndHHMM
            ? ` · blocked ${courtBlockStartHHMM}-${courtBlockEndHHMM}`
            : ""}
        </div>
      ) : (
        <div className="text-xs text-[var(--muted-foreground)]">
          No court selected.
        </div>
      )}
    </div>
  );
}

function CoachesReadout({
  assignments,
  isPickup,
}: {
  assignments: Array<{
    coachPersonId: string;
    role: "lead" | "assistant";
    name: string;
    participatesInPickup: boolean;
  }>;
  isPickup: boolean;
}) {
  const lead = assignments.find((a) => a.role === "lead");
  const assistants = assignments.filter((a) => a.role === "assistant");
  function note(a: { participatesInPickup: boolean }) {
    const bits: string[] = [];
    if (isPickup && !a.participatesInPickup) bits.push("no pickup");
    return bits.length > 0 ? ` · ${bits.join(" · ")}` : "";
  }
  return (
    <div className="space-y-1 text-sm">
      <div>
        <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Lead ·{" "}
        </span>
        <span className="font-medium">{lead?.name ?? "NO COACH YET"}</span>
        {lead && (
          <span className="text-xs text-[var(--muted-foreground)]">
            {note(lead)}
          </span>
        )}
      </div>
      <div className="text-xs text-[var(--muted-foreground)]">
        {assistants.length === 0
          ? "No assistants."
          : assistants.map((a, i) => (
              <span key={a.coachPersonId}>
                {i > 0 && ", "}
                {a.name}
                {note(a)}
              </span>
            ))}
      </div>
    </div>
  );
}

function AgeAndLevelReadout({
  minAge,
  maxAge,
  levels,
}: {
  minAge: number | null;
  maxAge: number | null;
  levels: SkillLevelValue[];
}) {
  const ageStr =
    minAge == null && maxAge == null
      ? "Any age"
      : minAge != null && maxAge != null
        ? `${minAge}–${maxAge} yrs`
        : minAge != null
          ? `${minAge}+ yrs`
          : `up to ${maxAge} yrs`;
  return (
    <div className="space-y-1 text-sm">
      <div className="font-medium">{ageStr}</div>
      <div className="flex flex-wrap gap-1.5 text-xs text-[var(--muted-foreground)]">
        {levels.length === 0 ? (
          <span>All levels welcome.</span>
        ) : (
          levels.map((l) => (
            <Badge key={l} variant="soft" tone="neutral">
              {formatSkillLevel(l)}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

function GroupsReadout({
  groups,
  multipleGroups,
  terms,
}: {
  groups: Array<{
    name: string;
    endTimeHHMM: string;
    minAge: number | null;
    maxAge: number | null;
    levels: SkillLevelValue[];
    maxStudents: number;
    enrolledCount: number;
    coachName: string | null;
  }>;
  multipleGroups: boolean;
  terms: Terms;
}) {
  if (groups.length === 0) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">
        No sub-group on disk — fix the series first.
      </p>
    );
  }
  if (groups.length === 1) {
    const g = groups[0];
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Single roster — ends at {g.endTimeHHMM}, {g.enrolledCount}/{g.maxStudents} enrolled.
      </p>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      {groups.map((g) => {
        const ageStr =
          g.minAge == null && g.maxAge == null
            ? null
            : g.minAge != null && g.maxAge != null
              ? `${g.minAge}–${g.maxAge}y`
              : g.minAge != null
                ? `${g.minAge}+y`
                : `≤${g.maxAge}y`;
        return (
          <div
            key={g.name}
            className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          >
            <span className="font-medium">{g.name}</span>
            <span className="tabular text-xs text-[var(--muted-foreground)]">
              ends {g.endTimeHHMM}
            </span>
            {ageStr && (
              <Badge variant="soft" tone="neutral">
                {ageStr}
              </Badge>
            )}
            {g.levels.slice(0, 3).map((l) => (
              <Badge key={l} variant="soft" tone="neutral">
                {formatSkillLevel(l)}
              </Badge>
            ))}
            {g.levels.length > 3 && (
              <span className="text-xs text-[var(--muted-foreground)]">
                +{g.levels.length - 3} more
              </span>
            )}
            {multipleGroups &&
              (g.coachName ? (
                <Badge variant="soft" tone="neutral">
                  {terms.coach.singular} · {g.coachName}
                </Badge>
              ) : (
                <Badge
                  variant="soft"
                  tone="warning"
                  title={`Edit the Sub-groups card to assign a ${terms.coach.singular.toLowerCase()}.`}
                >
                  No {terms.coach.singular.toLowerCase()} assigned
                </Badge>
              ))}
            <span className="ml-auto text-xs text-[var(--muted-foreground)]">
              {g.enrolledCount}/{g.maxStudents}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NamingReadout({
  name,
  seasonName,
  programName,
  isPickup,
}: {
  name: string;
  seasonName: string | null;
  programName: string;
  isPickup: boolean;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="font-medium">{name}</div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="soft" tone="neutral">
          {programName}
          {isPickup && " (auto)"}
        </Badge>
        {seasonName ? (
          <Badge variant="soft" tone="neutral">
            {seasonName}
          </Badge>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">
            No season label.
          </span>
        )}
      </div>
    </div>
  );
}

function RosterLimitsReadout({
  maxStudents,
  minStudents,
  notes,
  whatsappUrl,
}: {
  maxStudents: number;
  minStudents: number | null;
  notes: string | null;
  whatsappUrl: string | null;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="tabular">
        Max {maxStudents}
        {minStudents != null ? ` · min ${minStudents}` : " · no minimum"}
      </div>
      <div className="text-xs text-[var(--muted-foreground)]">
        {notes ? notes : "No internal notes."}
      </div>
      <div className="text-xs text-[var(--muted-foreground)]">
        {whatsappUrl ? (
          <span>
            WhatsApp:{" "}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline"
            >
              {whatsappUrl}
            </a>
          </span>
        ) : (
          "No WhatsApp invite."
        )}
      </div>
    </div>
  );
}

function PricingReadout({
  pricePerSession,
  pricePerSeries,
  sessionCount,
}: {
  pricePerSession: number | null;
  pricePerSeries: number | null;
  sessionCount: number;
}) {
  if (pricePerSession == null) {
    return (
      <div className="space-y-1 text-sm">
        <div className="font-medium">Not priced</div>
        <div className="text-xs text-[var(--muted-foreground)]">
          Members see &ldquo;Contact the office for pricing&rdquo; and the
          demo Mollie checkout is skipped.
        </div>
      </div>
    );
  }
  const fmt = (n: number) =>
    n.toLocaleString("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  return (
    <div className="space-y-1 text-sm">
      <div className="tabular font-medium">{fmt(pricePerSession)} / session</div>
      <div className="text-xs text-[var(--muted-foreground)]">
        {pricePerSeries != null && sessionCount > 0
          ? `${fmt(pricePerSeries)} across ${sessionCount} session${sessionCount === 1 ? "" : "s"} (members are pro-rated by remaining sessions when they join mid-term).`
          : "No sessions yet — members will see a per-session price only once the schedule is generated."}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client wrapper so we can use the read-mode ScheduleCalendar from a
// server component (it's a client component that needs to run on the
// client but accepts serialized props).
// ---------------------------------------------------------------------------

function ScheduleCalendarPreview({
  startsOn,
  endsOn,
  dayOfWeek,
  excludedDates,
}: {
  startsOn: string;
  endsOn: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  excludedDates: string[];
}) {
  // Inline a tiny client-island around the calendar so the server
  // component can hand it ISO strings instead of a Set.
  return (
    <ScheduleCalendar
      mode="read"
      startsOn={startsOn}
      endsOn={endsOn}
      dayOfWeek={dayOfWeek}
      excluded={new Set(excludedDates)}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeToHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * `Enrollment.reviewReason` is stored as a structured-ish string so we
 * can extend without a migration (e.g. `age_override:7:9-12`,
 * `skill_gap:beginner:advanced`). Render the most useful piece for the
 * roster badge.
 */
function formatReviewReason(reason: string | null | undefined): string {
  if (!reason) return "needs review";
  const [kind, ...rest] = reason.split(":");
  if (kind === "age_override" && rest.length >= 2) {
    return `age ${rest[0]} vs ${rest[1]}`;
  }
  return kind.replace(/_/g, " ");
}

function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatDateRange(startIso: string, endIso: string): string {
  const format = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  return `${format.format(start)} – ${format.format(end)}`;
}

/**
 * Status pill + Publish/Unpublish button. Renders as a single inline
 * group in the page header so the admin always knows whether parents
 * can see this class. The form actions are server actions defined in
 * `../actions.ts` so unpublish refuses gracefully when there are live
 * enrollments.
 */
function PublishStatusControl({
  classSeriesId,
  status,
  publishedAt,
}: {
  classSeriesId: string;
  status:
    | "draft"
    | "published"
    | "full"
    | "in_progress"
    | "completed"
    | "cancelled";
  publishedAt: Date | null;
}) {
  const isPublished = status === "published";
  const isLocked =
    status === "in_progress" ||
    status === "completed" ||
    status === "cancelled";

  return (
    <div className="flex items-center gap-2">
      <Badge
        tone={
          isPublished
            ? "success"
            : status === "draft"
              ? "warning"
              : "neutral"
        }
        variant="soft"
        className="capitalize"
      >
        {status === "draft"
          ? "Draft (parents can't see this)"
          : status === "published"
            ? "Published"
            : status.replace("_", " ")}
      </Badge>
      {publishedAt && isPublished && (
        <span className="text-xs text-[var(--muted-foreground)]">
          since {publishedAt.toISOString().slice(0, 10)}
        </span>
      )}
      {!isLocked && (
        <form
          action={isPublished ? unpublishSeries : publishSeries}
          className="inline"
        >
          <input type="hidden" name="classSeriesId" value={classSeriesId} />
          <Button
            type="submit"
            size="sm"
            tone={isPublished ? "neutral" : "triaz"}
            variant={isPublished ? "outline" : "solid"}
          >
            {isPublished ? "Unpublish" : "Publish to parents"}
          </Button>
        </form>
      )}
    </div>
  );
}

interface SessionCoachRow {
  coachPersonId: string;
  role: "lead" | "assistant";
  isSubstitute: boolean;
  substitutingForPersonId: string | null;
  coach: {
    person: { id: string; firstName: string; lastName: string };
  };
}

/**
 * Render the effective coach lineup for one session row in the admin table.
 *
 * Logic:
 *   - If `class_session_coaches` rows exist, they win (someone overrode the
 *     series default for this specific session — usually a substitute).
 *     Anyone in `substitutingForPersonId` gets crossed off.
 *   - Otherwise, fall back to the series default lead + assistants.
 *   - If a sub request is pending, show a small badge so the office knows
 *     it still needs an assignment.
 */
function SessionCoachesCell({
  sessionCoaches,
  seriesLead,
  seriesAssistants,
  pendingSubFor,
}: {
  sessionCoaches: SessionCoachRow[];
  seriesLead: { personId: string; name: string } | null;
  seriesAssistants: Array<{ personId: string; name: string }>;
  pendingSubFor: string | null;
}) {
  const subbedOut = new Set(
    sessionCoaches
      .filter((c) => c.isSubstitute && c.substitutingForPersonId)
      .map((c) => c.substitutingForPersonId as string),
  );

  const overrides = sessionCoaches.map((c) => ({
    personId: c.coachPersonId,
    name:
      [c.coach.person.firstName, c.coach.person.lastName]
        .filter(Boolean)
        .join(" ") || "—",
    isSubstitute: c.isSubstitute,
  }));

  const overrideIds = new Set(overrides.map((o) => o.personId));

  const display: Array<{
    name: string;
    tone: "triaz" | "neutral" | "warning";
    label?: string;
  }> = [];

  if (seriesLead && !subbedOut.has(seriesLead.personId) && !overrideIds.has(seriesLead.personId)) {
    display.push({ name: seriesLead.name, tone: "triaz", label: "lead" });
  }
  for (const a of seriesAssistants) {
    if (subbedOut.has(a.personId) || overrideIds.has(a.personId)) continue;
    display.push({ name: a.name, tone: "neutral", label: "assistant" });
  }
  for (const o of overrides) {
    display.push({
      name: o.name,
      tone: o.isSubstitute ? "warning" : "triaz",
      label: o.isSubstitute ? "sub" : undefined,
    });
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {display.length === 0 ? (
        <span className="text-[var(--muted-foreground)]">—</span>
      ) : (
        display.map((d, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className="font-medium text-[var(--foreground)]">{d.name}</span>
            {d.label && (
              <Badge tone={d.tone} variant="soft" className="capitalize">
                {d.label}
              </Badge>
            )}
          </span>
        ))
      )}
      {pendingSubFor && (
        <Link
          href="/admin/coach-subs"
          className="inline-flex items-center gap-1 text-[var(--triaz-ink)] underline-offset-4 hover:underline"
        >
          <Badge tone="warning" variant="soft">
            Sub requested by {pendingSubFor}
          </Badge>
        </Link>
      )}
    </div>
  );
}
