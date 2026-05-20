import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCoachSeriesWithRoster } from "@/lib/coach/class-series-queries";
import { formatLocalDate } from "@/lib/booking/time";
import {
  formatSkillLevel,
  getNextSkillLevel,
  type SkillLevelValue,
} from "@/lib/skill-levels";
import { CoachLevelSelect } from "./coach-level-select";
import { cn } from "@/lib/utils";
import { getStudentContactsBulk } from "@/lib/contacts/queries";
import { ContactButton } from "@/components/contacts/contact-button";
import { getCurrentBrand } from "@/lib/tenant";
import { getEnrollmentsNeedingReview } from "@/lib/season-review/queries";
import { recordReview } from "@/lib/season-review/actions";
import { listClassUpdatesForSeries } from "@/lib/class-updates/queries";
import { PostClassUpdateForm } from "@/components/class-updates/post-class-update-form";
import { ClassUpdateList } from "@/components/class-updates/class-update-list";

export default async function CoachClassSeriesPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;
  const { person, allowedClubIds } = await requireCoach();
  const brand = await getCurrentBrand();
  const series = await getCoachSeriesWithRoster(person.id, seriesId, {
    allowedClubIds,
  });
  if (!series) notFound();

  // Show the season-review gate from a week before the series ends and
  // for a week after — same window the admin tile uses.
  const now = new Date();
  const seasonReviewWindowOpen =
    series.endsOn.getTime() - now.getTime() <= 14 * 86_400_000 &&
    now.getTime() - series.endsOn.getTime() <= 7 * 86_400_000;

  const studentIds = series.enrollments.map((e) => e.studentPersonId);
  const enrollmentsNeedingReview = seasonReviewWindowOpen
    ? await getEnrollmentsNeedingReview(seriesId)
    : [];
  const updates = await listClassUpdatesForSeries(seriesId, { limit: 10 });
  const [roles, sessionsCompleted, skillHistory, contactGroups] = await Promise.all([
    studentIds.length > 0
      ? prisma.householdMember.findMany({
          where: { personId: { in: studentIds } },
          select: { personId: true, roleInHousehold: true },
        })
      : Promise.resolve([]),
    // Heather feedback v1: prompt the coach in week 2 to confirm
    // skill levels (they've now seen each student play once or
    // twice). We count completed sessions in this series — anything
    // that already ended counts.
    prisma.classSession.count({
      where: {
        classSeriesId: seriesId,
        endsAt: { lte: new Date() },
        status: { not: "cancelled" },
      },
    }),
    studentIds.length > 0
      ? prisma.studentSkillHistory.groupBy({
          by: ["studentId"],
          where: {
            studentId: { in: studentIds },
            // Anything recorded after the series started counts as
            // "the coach already confirmed this season".
            changedAt: { gte: series.startsOn },
          },
          _max: { changedAt: true },
        })
      : Promise.resolve([] as { studentId: string; _max: { changedAt: Date | null } }[]),
    getStudentContactsBulk(studentIds),
  ]);
  const contactByStudent = new Map(contactGroups.map((g) => [g.personId, g]));
  const roleByStudent = Object.fromEntries(
    roles.map((r) => [r.personId, r.roleInHousehold]),
  );
  const reviewedThisSeason = new Set(skillHistory.map((h) => h.studentId));
  // Mid-season "confirm levels" prompt — superseded by the explicit
  // season-review gate once we're within the end-of-season window.
  const promptActive =
    !seasonReviewWindowOpen &&
    sessionsCompleted >= 2 &&
    sessionsCompleted <= 6;
  const studentsToReview = promptActive
    ? series.enrollments.filter(
        (e) => !reviewedThisSeason.has(e.studentPersonId),
      )
    : [];

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Roster"
        title={series.name}
        description={
          <>
            {series.program.name} · {series.venue.name}
            <br />
            {formatLocalDate(series.startsOn)} – {formatLocalDate(series.endsOn)}{" "}
            <Badge variant="outline" className="ml-2 align-middle">
              {series.status}
            </Badge>
          </>
        }
        actions={
          <Link
            href="/coach/classes"
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            All classes
          </Link>
        }
      />

      {seasonReviewWindowOpen && enrollmentsNeedingReview.length > 0 && (
        <SeasonReviewBanner
          endsOn={series.endsOn}
          enrollments={enrollmentsNeedingReview.map((e) => ({
            id: e.id,
            studentPersonId: e.studentPersonId,
            displayName:
              [
                e.student.person.firstName,
                e.student.person.lastName,
              ]
                .filter(Boolean)
                .join(" ")
                .trim() || "Unnamed",
            currentLevel: e.student.skillLevel as SkillLevelValue | null,
          }))}
        />
      )}

      {studentsToReview.length > 0 && (
        <SkillReviewBanner
          sessionsCompleted={sessionsCompleted}
          remaining={studentsToReview.length}
          totalRoster={series.enrollments.length}
        />
      )}

      <Section
        title="Updates"
        description="Post a quick note (and optional video link) for parents. Lands in their inbox and on their class page."
      >
        <div className="space-y-6">
          <PostClassUpdateForm classSeriesId={seriesId} />
          <ClassUpdateList
            updates={updates}
            variant="coach"
            classSeriesId={seriesId}
            emptyHint="No updates posted yet — your first one will go to every enrolled household."
          />
        </div>
      </Section>

      <Section
        title="Students"
        description="Skill level saves automatically. Tap a name for household contacts."
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
                  const sl = e.student.skillLevel as SkillLevelValue | null;
                  const needsReview =
                    promptActive && !reviewedThisSeason.has(e.studentPersonId);
                  return (
                    <tr
                      key={e.id}
                      className={cn(
                        needsReview && "bg-[var(--warning-soft)]/40",
                      )}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/coach/classes/${seriesId}/students/${e.studentPersonId}`}
                          className="font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                        >
                          {name}
                        </Link>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {e.status === "waitlist" ? "Waitlist" : "Active"}
                          {needsReview && " · level not reviewed yet"}
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
                        <div className="mb-1 flex items-center gap-2 md:hidden">
                          <span>{formatSkillLevel(sl)}</span>
                          {needsReview && (
                            <Badge tone="warning" variant="soft" className="text-[10px]">
                              Confirm
                            </Badge>
                          )}
                        </div>
                        <div className="hidden items-center gap-2 md:flex">
                          <CoachLevelSelect
                            classSeriesId={seriesId}
                            studentPersonId={e.studentPersonId}
                            level={sl}
                          />
                          {needsReview && (
                            <Badge tone="warning" variant="soft" className="text-[10px]">
                              Confirm
                            </Badge>
                          )}
                        </div>
                        <div className="md:hidden">
                          <CoachLevelSelect
                            classSeriesId={seriesId}
                            studentPersonId={e.studentPersonId}
                            level={sl}
                          />
                        </div>
                      </td>
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

function SeasonReviewBanner({
  endsOn,
  enrollments,
}: {
  endsOn: Date;
  enrollments: Array<{
    id: string;
    studentPersonId: string;
    displayName: string;
    currentLevel: SkillLevelValue | null;
  }>;
}) {
  return (
    <div className="rounded-lg border border-[var(--triaz-ink)] bg-[var(--triaz-ink)]/[0.04] p-4 text-sm text-[var(--triaz-ink)]">
      <div className="space-y-1">
        <div className="font-semibold">Season-end review</div>
        <p className="text-[var(--muted-foreground)]">
          The series ends {formatLocalDate(endsOn)}. For each student
          below, mark whether they stay at their current level or move
          up. Parents are notified the moment you decide.
        </p>
      </div>
      <ul className="mt-4 divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--background)]">
        {enrollments.map((e) => {
          const next = getNextSkillLevel(e.currentLevel);
          return (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="space-y-0.5">
                <div className="font-medium">{e.displayName}</div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  Currently {formatSkillLevel(e.currentLevel)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <form action={recordReview}>
                  <input type="hidden" name="enrollmentId" value={e.id} />
                  <input type="hidden" name="outcome" value="stayed" />
                  <Button type="submit" variant="outline" size="sm">
                    Stay at {formatSkillLevel(e.currentLevel)}
                  </Button>
                </form>
                {next && (
                  <form action={recordReview}>
                    <input type="hidden" name="enrollmentId" value={e.id} />
                    <input type="hidden" name="outcome" value="promoted" />
                    <Button type="submit" size="sm">
                      Promote to {formatSkillLevel(next)}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SkillReviewBanner({
  sessionsCompleted,
  remaining,
  totalRoster,
}: {
  sessionsCompleted: number;
  remaining: number;
  totalRoster: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 text-sm text-[var(--triaz-ink)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="font-semibold">
            Time to confirm skill levels
          </div>
          <p className="text-[var(--muted-foreground)]">
            You&apos;ve taught {sessionsCompleted} session
            {sessionsCompleted === 1 ? "" : "s"} of this series.
            Take a moment to set or update the skill level for{" "}
            <span className="font-medium text-[var(--triaz-ink)]">
              {remaining} of {totalRoster}
            </span>{" "}
            student{remaining === 1 ? "" : "s"} so the level reflects
            what you&apos;ve seen on court.
          </p>
        </div>
      </div>
    </div>
  );
}
