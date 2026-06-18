import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { format } from "@/lib/format";
import {
  formatSkillLevel,
  type SkillLevelValue,
} from "@/lib/skill-levels";
import {
  formatMedalLevel,
  isMedalEligible,
  type MedalLevelValue,
} from "@/lib/medal-levels";
import { StudentProgressionSelect } from "./progression-select";

type Archetype = "student" | "parent" | "coach" | "plain";

type ChildSummary = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  gender: string | null;
  skillLevel: SkillLevelValue | null;
  medalLevel: MedalLevelValue | null;
  isStudent: boolean;
};

type GuardianSummary = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  primaryEmail: string | null;
};

type HouseholdSummary = {
  id: string;
  displayName: string;
};

export type PersonHeroProps = {
  person: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    gender: string | null;
    phone: string | null;
    primaryEmail: string | null;
    isAdmin: boolean;
  };
  archetype: Archetype;
  student: {
    skillLevel: SkillLevelValue | null;
  medalLevel: MedalLevelValue | null;
    enrollmentStatus: "active" | "paused" | "archived";
    school: string | null;
  } | null;
  coach: {
    bio: string | null;
  } | null;
  household: HouseholdSummary | null;
  /** Other adults in the same household (for child students). */
  guardians: GuardianSummary[];
  /** Children in the same household (for parents). */
  children: ChildSummary[];
};

export function PersonHero(props: PersonHeroProps) {
  const { person, archetype } = props;

  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--card)] p-5">
      <RoleStrip person={person} archetype={archetype} />

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <IdentityColumn person={person} />
        <ArchetypeColumn {...props} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Role strip
// ---------------------------------------------------------------------------

function RoleStrip({
  person,
  archetype,
}: {
  person: PersonHeroProps["person"];
  archetype: Archetype;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {person.isAdmin && <Badge variant="default">admin</Badge>}
      {archetype === "coach" && <Badge variant="secondary">coach</Badge>}
      {archetype === "student" && <Badge variant="outline">student</Badge>}
      {archetype === "parent" && <Badge variant="outline">parent</Badge>}
      {archetype === "plain" && !person.isAdmin && (
        <span className="text-xs text-[var(--muted-foreground)]">
          No roles assigned.
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left column: identity
// ---------------------------------------------------------------------------

function IdentityColumn({
  person,
}: {
  person: PersonHeroProps["person"];
}) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
      <Term>Age</Term>
      <Detail>
        {format.age(person.dateOfBirth)}
        {person.dateOfBirth && (
          <span className="ml-2 text-xs text-[var(--muted-foreground)]">
            (born {format.date(person.dateOfBirth)})
          </span>
        )}
      </Detail>

      <Term>Gender</Term>
      <Detail>{formatGender(person.gender)}</Detail>

      <Term>Phone</Term>
      <Detail>
        {person.phone ? (
          <a
            href={`tel:${person.phone.replace(/\s+/g, "")}`}
            className="underline-offset-2 hover:underline"
          >
            {person.phone}
          </a>
        ) : (
          <span className="text-[var(--muted-foreground)]">—</span>
        )}
      </Detail>

      <Term>Email</Term>
      <Detail>
        {person.primaryEmail ? (
          <a
            href={`mailto:${person.primaryEmail}`}
            className="underline-offset-2 hover:underline"
          >
            {person.primaryEmail}
          </a>
        ) : (
          <span className="text-[var(--muted-foreground)]">—</span>
        )}
      </Detail>
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Right column: archetype-specific
// ---------------------------------------------------------------------------

function ArchetypeColumn(props: PersonHeroProps) {
  switch (props.archetype) {
    case "student":
      return <StudentBlock {...props} />;
    case "parent":
      return <ParentBlock {...props} />;
    case "coach":
      return <CoachBlock {...props} />;
    case "plain":
      return null;
  }
}

function StudentBlock({
  person,
  student,
  household,
  guardians,
}: PersonHeroProps) {
  if (!student) return null;
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
      <Term>{studentMedalEligible(person) ? "Medal" : "Level"}</Term>
      <Detail>
        <StudentProgressionSelect
          personId={person.id}
          medalEligible={studentMedalEligible(person)}
          medalLevel={student.medalLevel}
          skillLevel={student.skillLevel}
        />
      </Detail>

      <Term>Status</Term>
      <Detail>
        <EnrollmentBadge status={student.enrollmentStatus} />
      </Detail>

      <Term>School</Term>
      <Detail>
        {student.school ?? (
          <span className="text-[var(--muted-foreground)]">—</span>
        )}
      </Detail>

      {household && (
        <>
          <Term>Household</Term>
          <Detail>
            <Link
              href={`/admin/households/${household.id}`}
              className="underline-offset-2 hover:underline"
            >
              {household.displayName}
            </Link>
            {guardians.length > 0 && (
              <div className="mt-1 space-y-0.5 text-xs text-[var(--muted-foreground)]">
                {guardians.map((g) => (
                  <div key={g.id}>
                    <Link
                      href={`/admin/people/${g.id}`}
                      className="hover:underline"
                    >
                      {[g.firstName, g.lastName].filter(Boolean).join(" ")}
                    </Link>
                    {g.phone && <> · {g.phone}</>}
                    {g.primaryEmail && <> · {g.primaryEmail}</>}
                  </div>
                ))}
              </div>
            )}
          </Detail>
        </>
      )}
    </dl>
  );
}

function ParentBlock({ household, children }: PersonHeroProps) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          Children ({children.length})
        </h3>
        {household && (
          <Link
            href={`/admin/households/${household.id}`}
            className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline"
          >
            {household.displayName}
          </Link>
        )}
      </div>
      {children.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No children on record.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
          {children.map((c) => {
            const fullName =
              [c.firstName, c.lastName].filter(Boolean).join(" ") ||
              "(no name)";
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/people/${c.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-[var(--muted)]"
                >
                  <span className="font-medium">{fullName}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {format.age(c.dateOfBirth)}
                    {c.gender && (
                      <> · {formatGender(c.gender).toLowerCase()}</>
                    )}
                  </span>
                  {c.isStudent && (
                    <Badge variant="outline" className="ml-auto">
                      {studentMedalEligible(c)
                        ? formatMedalLevel(c.medalLevel)
                        : formatSkillLevel(c.skillLevel)}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CoachBlock({ coach }: PersonHeroProps) {
  return (
    <div className="space-y-2 text-sm">
      <h3 className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        Coach
      </h3>
      {coach?.bio ? (
        <p className="whitespace-pre-wrap">{coach.bio}</p>
      ) : (
        <p className="text-[var(--muted-foreground)]">
          No bio yet. Coaching specialties and availability will live here in
          a later slice.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small atoms
// ---------------------------------------------------------------------------

function Term({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
      {children}
    </dt>
  );
}

function Detail({ children }: { children: React.ReactNode }) {
  return <dd>{children}</dd>;
}

function EnrollmentBadge({
  status,
}: {
  status: "active" | "paused" | "archived";
}) {
  switch (status) {
    case "active":
      return <Badge variant="default">Active</Badge>;
    case "paused":
      return <Badge variant="secondary">Paused</Badge>;
    case "archived":
      return <Badge variant="outline">Archived</Badge>;
  }
}

function studentMedalEligible(input: {
  dateOfBirth: Date | null;
}): boolean {
  return isMedalEligible({ dateOfBirth: input.dateOfBirth });
}

function formatGender(g: string | null): string {
  if (!g) return "—";
  switch (g) {
    case "male":
      return "Male";
    case "female":
      return "Female";
    case "other":
      return "Other";
    case "prefer_not_to_say":
      return "Prefer not to say";
    default:
      return g;
  }
}
