import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PortalPageHeader } from "@/components/portal/portal-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/portal/avatar";
import { FamilyIcon } from "@/components/icons";
import {
  getHouseholdMembers,
  getUpcomingSessionsForStudents,
  type HouseholdMemberSummary,
  type UpcomingSession,
} from "@/lib/portal/queries";
import { MedalBadge } from "@/components/medals/medal-badge";
import { formatSkillLevel, type SkillLevelValue } from "@/lib/skill-levels";
import {
  getStudentProgressSummariesBulk,
  type ProgressSummary,
} from "@/lib/levels/criteria";
import {
  computeClassTiming,
  formatTimingLine,
} from "@/lib/classes/timing";
import { EditChildDialog } from "./edit-child-dialog";
import { AddChildDialog } from "./add-child-dialog";

/**
 * Parent-facing "My family" page.
 *
 * One hero card per child: avatar, name, age, level, school, emergency
 * contact (with parent-fallback) and upcoming sessions. Adults can add
 * another child at any time via the page-header CTA.
 *
 * Adding another *adult* (a partner / co-parent) isn't a portal flow —
 * they sign up themselves and the office links the households together.
 */
type FamilyPageProps = {
  searchParams: Promise<{ addChild?: string }>;
};

export default async function FamilyPage({ searchParams }: FamilyPageProps) {
  const { person, householdId } = await requireMember();
  const sp = await searchParams;
  const openAddChildDialog = sp.addChild === "1";

  const members = await getHouseholdMembers(householdId);
  const adults = members.filter((m) => m.role === "adult");
  const children = members.filter((m) => m.role === "child");

  const studentChildIds = children
    .filter((c) => c.isStudent)
    .map((c) => c.personId);
  const sessions = await getUpcomingSessionsForStudents(studentChildIds, 30);
  const sessionsByChild = groupBy(sessions, (s) => s.studentPersonId);

  // Per-child progress against the rubric for their current adult skill level.
  const progressPairs = children
    .filter(
      (c): c is HouseholdMemberSummary & { studentSkillLevel: string } =>
        c.isStudent &&
        c.role === "child" &&
        c.studentSkillLevel != null &&
        c.studentMedalLevel == null,
    )
    .map((c) => ({
      studentPersonId: c.personId,
      skillLevel: c.studentSkillLevel as SkillLevelValue,
    }));
  const progressByChild = await getStudentProgressSummariesBulk(progressPairs);

  const parentLastName = person.lastName ?? undefined;

  return (
    <div className="space-y-10">
      <PortalPageHeader
        kicker="Family"
        title="Your family"
        description="Keep your kids' info up to date so coaches always have what they need."
        actions={
          <AddChildDialog
            parentLastName={parentLastName}
            defaultOpen={openAddChildDialog}
          />
        }
      />

      {children.length === 0 ? (
        <EmptyState
          icon={<FamilyIcon size={20} />}
          title="No kids on your account yet"
          description="Add a child to get started — coaches can sign them up for lessons after that."
          action={
            <Button asChild tone="triaz">
              <Link href="/portal/family?addChild=1">Add a child</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {children.map((c) => (
            <ChildCard
              key={c.personId}
              child={c}
              adults={adults}
              sessions={sessionsByChild.get(c.personId) ?? []}
              viewerPersonId={person.id}
              progress={
                c.studentSkillLevel && c.studentMedalLevel == null
                  ? (progressByChild.get(
                      `${c.personId}::${c.studentSkillLevel}`,
                    ) ?? null)
                  : null
              }
            />
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Adding another adult? They need to sign up with their own email and
        then the office will link your households together.
      </p>
    </div>
  );
}

function ChildCard({
  child,
  adults,
  sessions,
  viewerPersonId,
  progress,
}: {
  child: HouseholdMemberSummary;
  adults: HouseholdMemberSummary[];
  sessions: UpcomingSession[];
  viewerPersonId: string;
  progress: ProgressSummary | null;
}) {
  const fullName = [child.firstName, child.lastName].filter(Boolean).join(" ");

  // If no explicit emergency contact, fall back to the household's
  // adults (excluding the viewer themselves so it reads like
  // "default contacts: your partner / co-parent / etc.").
  const fallbackContacts = adults
    .filter((a) => a.personId !== viewerPersonId)
    .map((a) => `${a.firstName} ${a.lastName}`.trim())
    .filter(Boolean);

  return (
    <article className="fade-in elev-card-accent-triaz p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={fullName || "Child"} src={child.avatarUrl} size="lg" />
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl font-medium tracking-tight">
              {fullName || "Unnamed child"}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
              {child.age != null && (
                <span className="tabular">{child.age} years old</span>
              )}
              {child.studentSchool && (
                <>
                  <span aria-hidden>·</span>
                  <span>{child.studentSchool}</span>
                </>
              )}
              {child.role === "child" ? (
                <MedalBadge level={child.studentMedalLevel} />
              ) : (
                <SkillBadge level={child.studentSkillLevel} />
              )}
            </div>
            {child.studentSkillLevel &&
              child.studentMedalLevel == null &&
              progress &&
              progress.total > 0 && (
              <ProgressBar
                level={child.studentSkillLevel}
                achieved={progress.achieved}
                total={progress.total}
              />
            )}
          </div>
        </div>
        <EditChildDialog
          child={{
            personId: child.personId,
            firstName: child.firstName,
            lastName: child.lastName,
            dateOfBirthIso: child.dateOfBirthIso,
            school: child.studentSchool,
            emergencyContactName: child.emergencyContactName,
            emergencyContactPhone: child.emergencyContactPhone,
            emergencyContactRelationship: child.emergencyContactRelationship,
            avatarUrl: child.avatarUrl,
          }}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel label="Who to call if something happens">
          {child.emergencyContactName ? (
            <div className="text-sm">
              <div className="font-medium">{child.emergencyContactName}</div>
              {child.emergencyContactPhone && (
                <div className="tabular text-[var(--muted-foreground)]">
                  {child.emergencyContactPhone}
                </div>
              )}
              {child.emergencyContactRelationship && (
                <div className="text-xs text-[var(--muted-foreground)]">
                  {child.emergencyContactRelationship}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-[var(--muted-foreground)]">
              {fallbackContacts.length > 0 ? (
                <>
                  Defaults to{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {fallbackContacts.join(" and ")}
                  </span>
                  . Add a different contact via Edit if needed.
                </>
              ) : (
                <>
                  No emergency contact set yet.{" "}
                  <span className="text-[var(--foreground)]">
                    Add one with Edit.
                  </span>
                </>
              )}
            </div>
          )}
        </Panel>

        <Panel label="Coming up">
          {sessions.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {child.isStudent
                ? "No upcoming sessions yet."
                : "Not enrolled in any classes — talk to a coach to get started."}
            </p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {sessions.slice(0, 4).map((s, i) => {
                const timing = computeClassTiming({
                  session: { startsAt: s.startsAt, endsAt: s.endsAt },
                  series: {
                    deliveryMode: s.deliveryMode,
                    pickupAt: s.pickupAt,
                  },
                  school:
                    s.schoolCoachArriveAtHubMinutes != null
                      ? {
                          coachArriveAtHubMinutes:
                            s.schoolCoachArriveAtHubMinutes,
                        }
                      : null,
                });
                const venueLine =
                  s.deliveryMode === "pickup" && s.schoolName
                    ? `${s.schoolName} → ${s.venueName}`
                    : s.venueName;
                return (
                  <li key={`${s.id}-${i}`} className="flex items-baseline gap-3">
                    <span className="tabular w-12 shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                      {formatShort(s.startsAt)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.seriesName}</div>
                      <div className="tabular truncate text-xs text-[var(--muted-foreground)]">
                        {formatTimingLine(timing, s.deliveryMode)}
                      </div>
                      <div className="truncate text-xs text-[var(--muted-foreground)]">
                        {venueLine}
                        {s.courtName ? ` · ${s.courtName}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </article>
  );
}

function Panel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="elev-panel rounded-[var(--radius-md)] p-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {label}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ProgressBar({
  level,
  achieved,
  total,
}: {
  level: string;
  achieved: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((achieved / total) * 100);
  return (
    <Link
      href={`/levels/${level}`}
      className="block max-w-xs space-y-1 text-xs"
      title={`${achieved} of ${total} criteria ticked for ${formatSkillLevel(level)}`}
    >
      <div className="flex items-baseline justify-between gap-2 text-[var(--muted-foreground)]">
        <span>
          {achieved} / {total} criteria for next level
        </span>
        <span className="tabular">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full bg-[var(--triaz-ink)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

function SkillBadge({ level }: { level: string | null }) {
  if (!level) {
    return (
      <Badge
        asChild
        variant="outline"
        className="font-normal hover:bg-[var(--muted)]/40"
      >
        <Link href="/levels/kids" title="See what each medal means">
          Level not set
        </Link>
      </Badge>
    );
  }
  return (
    <Badge asChild tone="triaz" className="hover:opacity-90">
      <Link href={`/levels/${level}`} title="See what this level means">
        {formatSkillLevel(level)}
      </Link>
    </Badge>
  );
}

function formatShort(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
  }).format(d);
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function groupBy<T, K>(rows: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}
