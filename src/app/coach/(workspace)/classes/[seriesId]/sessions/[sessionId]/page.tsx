import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon, ClockIcon, MapPinIcon } from "@/components/icons";
import { getCoachSessionWithRoster } from "@/lib/coach/class-series-queries";
import {
  computeClassTiming,
  formatTimingLine,
  deliveryModeLabel,
} from "@/lib/classes/timing";
import { format } from "@/lib/format";
import {
  formatStudentLevel,
  studentMedalEligible,
} from "@/lib/medals/coach-roster";
import type { MedalLevelValue } from "@/lib/medal-levels";
import type { SkillLevelValue } from "@/lib/skill-levels";
import { CoachStudentLevelSelect } from "../../coach-student-level-select";
import { RequestSubButton } from "./_request-sub-button";
import { RollCallControl } from "./_roll-call";
import { getStudentContactsBulk } from "@/lib/contacts/queries";
import { ContactButton } from "@/components/contacts/contact-button";
import { getCurrentBrand } from "@/lib/tenant";
import { PostClassUpdateForm } from "@/components/class-updates/post-class-update-form";

/**
 * Coach view of one specific class occurrence: timing breakdown, venue,
 * and the active roster (with editable skill levels). Reachable from
 * blocks on the coach calendar, the home-page mini week-grid, and the
 * "Today's classes" list.
 */
export default async function CoachSessionPage({
  params,
}: {
  params: Promise<{ seriesId: string; sessionId: string }>;
}) {
  const { seriesId, sessionId } = await params;
  const { person, allowedClubIds } = await requireCoach();
  const brand = await getCurrentBrand();
  const session = await getCoachSessionWithRoster(
    person.id,
    seriesId,
    sessionId,
    { allowedClubIds },
  );
  if (!session) notFound();

  const series = session.classSeries;
  const timing = computeClassTiming({
    session: { startsAt: session.startsAt, endsAt: session.endsAt },
    series: {
      deliveryMode: series.deliveryMode,
      pickupAt: series.pickupAt,
    },
    school: series.school
      ? { coachArriveAtHubMinutes: series.school.coachArriveAtHubMinutes }
      : null,
  });

  const isCancelled =
    session.status === "cancelled" || session.cancelledAt != null;
  const modeTone =
    series.deliveryMode === "pickup"
      ? "joint"
      : series.deliveryMode === "onsite"
        ? "warning"
        : series.venue.kind === "club"
          ? "triaz"
          : "neutral";

  const venueLine =
    series.deliveryMode === "pickup" && series.school
      ? `${series.school.name} → ${series.venue.name}`
      : series.venue.name;

  const studentIds = series.enrollments.map((e) => e.studentPersonId);
  const [roles, plannedAbsences, subRequest, filledSubRow, contactGroups, attendanceRows] = await Promise.all([
    studentIds.length > 0
      ? prisma.householdMember.findMany({
          where: { personId: { in: studentIds } },
          select: { personId: true, roleInHousehold: true },
        })
      : Promise.resolve([] as { personId: string; roleInHousehold: string }[]),
    studentIds.length > 0
      ? prisma.attendance.findMany({
          where: {
            classSessionId: sessionId,
            studentPersonId: { in: studentIds },
            status: "excused",
          },
          select: { studentPersonId: true, notes: true },
        })
      : Promise.resolve([] as { studentPersonId: string; notes: string | null }[]),
    prisma.coachSubRequest.findFirst({
      where: {
        classSessionId: sessionId,
        requesterCoachPersonId: person.id,
        status: "pending",
      },
      select: { id: true, reason: true, createdAt: true },
    }),
    prisma.classSessionCoach.findFirst({
      where: {
        classSessionId: sessionId,
        isSubstitute: true,
        substitutingForPersonId: person.id,
      },
      include: {
        coach: {
          select: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    getStudentContactsBulk(studentIds),
    studentIds.length > 0
      ? prisma.attendance.findMany({
          where: {
            classSessionId: sessionId,
            studentPersonId: { in: studentIds },
          },
          select: { studentPersonId: true, status: true },
        })
      : Promise.resolve(
          [] as { studentPersonId: string; status: string }[],
        ),
  ]);
  const contactByStudent = new Map(
    contactGroups.map((g) => [g.personId, g]),
  );
  const attendanceByStudent = new Map(
    attendanceRows.map((a) => [a.studentPersonId, a.status]),
  );
  const roleByStudent = Object.fromEntries(
    roles.map((r) => [r.personId, r.roleInHousehold]),
  );
  const skipByStudent = new Map(
    plannedAbsences.map((a) => [a.studentPersonId, a.notes ?? null]),
  );
  const skippingCount = plannedAbsences.length;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={series.program.name}
        title={series.name}
        description={
          <>
            <span className="tabular">{format.dateTime(session.startsAt)}</span>{" "}
            <span className="text-[var(--muted-foreground)]">
              · ends {format.time(session.endsAt)}
            </span>
            <br />
            {venueLine}
            <Badge tone={modeTone} variant="soft" className="ml-2 align-middle">
              {deliveryModeLabel(series.deliveryMode)}
            </Badge>
            {isCancelled && (
              <Badge tone="warning" variant="soft" className="ml-2 align-middle">
                Cancelled
              </Badge>
            )}
          </>
        }
        actions={
          <Link
            href={`/coach/classes/${seriesId}`}
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            ← Back to series
          </Link>
        }
      />

      {isCancelled && (
        <div className="fade-in flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-5 py-3 text-sm text-[oklch(0.30_0.10_75)]">
          <CalendarIcon size={18} />
          <div>
            <div className="font-medium">This session is cancelled.</div>
            {session.cancellationReason && (
              <div className="mt-0.5 text-xs opacity-80">
                {session.cancellationReason}
              </div>
            )}
          </div>
        </div>
      )}

      {!isCancelled && (
        <Section
          title="Post a session update"
          description="Tied to this session — appears on the parents' inbox and class page with a 'from Wednesday's class' tag."
        >
          <PostClassUpdateForm
            classSeriesId={seriesId}
            classSessionId={sessionId}
          />
        </Section>
      )}

      {!isCancelled && session.startsAt.getTime() > Date.now() && (
        <Section
          title="Can't make it?"
          description="Flag the office now so we can line up a sub. The slot stays on the schedule until they assign one."
        >
          <RequestSubButton
            classSessionId={sessionId}
            pending={
              subRequest
                ? {
                    id: subRequest.id,
                    reason: subRequest.reason,
                    requestedAtIso: subRequest.createdAt.toISOString(),
                  }
                : null
            }
            filled={
              filledSubRow
                ? {
                    id: filledSubRow.id,
                    substituteName:
                      `${filledSubRow.coach.person.firstName} ${filledSubRow.coach.person.lastName}`.trim(),
                  }
                : null
            }
          />
        </Section>
      )}

      <Section
        title="Timing"
        description={
          series.deliveryMode === "pickup"
            ? "Pickup classes start when you leave Triaz with the gocab — that's when paid hours kick in."
            : "You're expected at the venue at class start."
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3">
            <ClockIcon size={18} />
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                Schedule
              </div>
              <div className="tabular text-sm font-medium">
                {formatTimingLine(timing, series.deliveryMode)}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3">
            <MapPinIcon size={18} />
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                Where
              </div>
              <div className="text-sm font-medium">{venueLine}</div>
              {session.court?.name && (
                <div className="text-xs text-[var(--muted-foreground)]">
                  Court: {session.court.name}
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Students"
        description={
          skippingCount > 0
            ? `${series.enrollments.length} on the roster · ${skippingCount} skipping this session.`
            : `${series.enrollments.length} on the roster. Level saves automatically.`
        }
      >
        {series.enrollments.length === 0 ? (
          <EmptyState
            title="No enrollments"
            description="No active or waitlist students in this series yet."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/30">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  {!isCancelled && (
                    <th className="px-4 py-3 font-medium text-right">
                      Attendance
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium text-right">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {series.enrollments.map((e) => {
                  const p = e.student.person;
                  const name =
                    [p.firstName, p.lastName].filter(Boolean).join(" ").trim() ||
                    "Unnamed";
                  const role = roleByStudent[e.studentPersonId] ?? null;
                  const medalEligible = studentMedalEligible(p, role);
                  const medalLevel = e.student.medalLevel as MedalLevelValue | null;
                  const sl = e.student.skillLevel as SkillLevelValue | null;
                  const skipNote = skipByStudent.get(e.studentPersonId);
                  const isSkipping = skipByStudent.has(e.studentPersonId);
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/coach/classes/${seriesId}/students/${e.studentPersonId}`}
                            className="font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                          >
                            {name}
                          </Link>
                          {isSkipping && (
                            <Badge tone="warning" variant="soft">
                              Skipping
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {e.status === "waitlist" ? "Waitlist" : "Active"}
                          {skipNote ? ` · "${skipNote}"` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {role === "child"
                          ? "Child"
                          : role === "adult"
                            ? "Adult"
                            : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="mb-1 md:hidden">
                          {formatStudentLevel({
                            medalEligible,
                            medalLevel,
                            skillLevel: sl,
                          })}
                        </div>
                        <CoachStudentLevelSelect
                          classSeriesId={seriesId}
                          studentPersonId={e.studentPersonId}
                          medalEligible={medalEligible}
                          medalLevel={medalLevel}
                          skillLevel={sl}
                        />
                      </td>
                      {!isCancelled && (
                        <td className="px-4 py-3 text-right">
                          <RollCallControl
                            classSessionId={sessionId}
                            studentPersonId={e.studentPersonId}
                            initialStatus={
                              (attendanceByStudent.get(
                                e.studentPersonId,
                              ) as
                                | "present"
                                | "absent"
                                | "late"
                                | "excused"
                                | undefined) ?? null
                            }
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const group = contactByStudent.get(e.studentPersonId);
                          if (!group || group.targets.length === 0) {
                            return (
                              <span className="text-xs text-[var(--muted-foreground)]">
                                —
                              </span>
                            );
                          }
                          return (
                            <ContactButton
                              group={group}
                              subjectName={name}
                              brandName={brand.shortName}
                              size="xs"
                            />
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
