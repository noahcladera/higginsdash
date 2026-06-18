import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmailSection } from "./email-section";
import { StudentSection } from "./student-section";
import { PersonHero } from "./person-hero";
import { PersonDangerZone } from "./danger-zone";
import { SYSTEM_PERSON_ID } from "@/lib/system-ids";
import { format } from "@/lib/format";
import type { SkillLevelValue } from "@/lib/skill-levels";
import type { MedalLevelValue } from "@/lib/medal-levels";
import { getPersonContacts } from "@/lib/contacts/queries";
import { ContactButton } from "@/components/contacts/contact-button";
import { getCurrentBrand } from "@/lib/tenant";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { person: actor } = await requireAdmin();
  const { id } = await params;
  const brand = await getCurrentBrand();

  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      householdMember: {
        include: {
          household: {
            include: {
              members: {
                include: {
                  person: {
                    include: {
                      student: { select: { skillLevel: true, medalLevel: true } },
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
          },
        },
      },
      student: true,
      coach: true,
    },
  });

  if (!person) notFound();

  const fullName =
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    "(no name)";
  const isArchived = person.archivedAt !== null;
  const isSystem = person.id === SYSTEM_PERSON_ID;
  const isSelf = actor.id === person.id;

  // ----- Archetype + hero data -----------------------------------------
  const householdMembers =
    person.householdMember?.household?.members ?? [];
  const otherMembers = householdMembers.filter((m) => m.personId !== person.id);
  const childMembers = otherMembers.filter(
    (m) => m.roleInHousehold === "child",
  );
  const adultMembers = otherMembers.filter(
    (m) => m.roleInHousehold === "adult",
  );

  const isStudent = !!person.student;
  const isCoach = !!person.coach;
  const isParent =
    !isStudent &&
    person.householdMember?.roleInHousehold === "adult" &&
    childMembers.length > 0;

  const archetype: "student" | "parent" | "coach" | "plain" = isStudent
    ? "student"
    : isParent
      ? "parent"
      : isCoach
        ? "coach"
        : "plain";

  const primaryEmail =
    person.emails.find((e) => e.isPrimary && !e.archivedAt)?.address ?? null;

  const contactGroup = await getPersonContacts(person.id);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "People", href: "/admin/people" },
          { label: fullName },
        ]}
      />
      <PageHeader
        kicker="Admin · People"
        title={fullName}
        description={`Person id ${person.id}`}
        actions={
          !isSystem ? (
            <div className="flex items-center gap-2">
              {contactGroup && contactGroup.targets.length > 0 && (
                <ContactButton
                  group={contactGroup}
                  subjectName={fullName}
                  brandName={brand.shortName}
                  size="sm"
                />
              )}
              <Button asChild variant="outline">
                <Link href={`/admin/people/${person.id}/edit`}>Edit</Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      {isArchived && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
          This person was archived on {format.date(person.archivedAt!)}.
        </div>
      )}

      {isSystem && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
          System placeholder — referenced by seed data. Cannot be edited.
        </div>
      )}

      <PersonHero
        person={{
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          dateOfBirth: person.dateOfBirth,
          gender: person.gender,
          phone: person.phone,
          primaryEmail,
          isAdmin: person.isAdmin,
        }}
        archetype={archetype}
        student={
          person.student
            ? {
                skillLevel: person.student.skillLevel as SkillLevelValue | null,
                medalLevel: person.student.medalLevel as MedalLevelValue | null,
                enrollmentStatus: person.student.enrollmentStatus,
                school: person.student.school,
              }
            : null
        }
        coach={person.coach ? { bio: person.coach.bio } : null}
        household={
          person.householdMember?.household
            ? {
                id: person.householdMember.household.id,
                displayName: person.householdMember.household.displayName,
              }
            : null
        }
        guardians={adultMembers.map((m) => ({
          id: m.person.id,
          firstName: m.person.firstName,
          lastName: m.person.lastName,
          phone: m.person.phone,
          primaryEmail: m.person.emails[0]?.address ?? null,
        }))}
        children={childMembers.map((m) => ({
          id: m.person.id,
          firstName: m.person.firstName,
          lastName: m.person.lastName,
          dateOfBirth: m.person.dateOfBirth,
          gender: m.person.gender,
          skillLevel:
            (m.person.student?.skillLevel as SkillLevelValue | null) ?? null,
          medalLevel:
            (m.person.student?.medalLevel as MedalLevelValue | null) ?? null,
          isStudent: !!m.person.student,
        }))}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Address" surface="card">
          <AddressBlock
            personAddress={{
              addressLine1: person.addressLine1,
              addressLine2: person.addressLine2,
              postalCode: person.postalCode,
              city: person.city,
              country: person.country,
            }}
            household={person.householdMember?.household ?? null}
          />
        </Section>

        <Section title="Emergency contact" surface="card">
          <EmergencyContactBlock
            explicit={{
              name: person.emergencyContactName,
              phone: person.emergencyContactPhone,
              relationship: person.emergencyContactRelationship,
            }}
            guardians={adultMembers.map((m) => ({
              id: m.person.id,
              firstName: m.person.firstName,
              lastName: m.person.lastName,
              phone: m.person.phone,
              primaryEmail: m.person.emails[0]?.address ?? null,
            }))}
          />
        </Section>

        {person.student && (
          <Section title="Student details" surface="card">
            <p className="mb-4 text-xs text-[var(--muted-foreground)]">
              Joined {format.date(person.student.joinedOn)} · skill level lives
              in the hero card above.
            </p>
            <StudentSection
              personId={person.id}
              student={{
                enrollmentStatus: person.student.enrollmentStatus,
                school: person.student.school,
                medicalNotes: person.student.medicalNotes,
              }}
            />
          </Section>
        )}

        {person.notes && (
          <Section title="Notes" surface="card">
            <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
          </Section>
        )}
      </div>

      <Section title="Email addresses" surface="card">
        <EmailSection
          personId={person.id}
          emails={person.emails.map((e) => ({
            id: e.id,
            address: e.address,
            kind: e.kind,
            isPrimary: e.isPrimary,
            isVerified: e.isVerified,
            archivedAt: e.archivedAt,
          }))}
        />
      </Section>

      <Section title="Account meta" surface="card">
        <DescList>
          <DescRow
            label="Last login"
            value={
              person.lastLoginAt
                ? format.dateTime(person.lastLoginAt)
                : "Never"
            }
          />
          <DescRow
            label="Created"
            value={format.dateTime(person.createdAt)}
          />
        </DescList>
      </Section>

      {!isSystem && (
        <Section title="Danger zone" surface="card">
          <PersonDangerZone
            personId={person.id}
            isArchived={isArchived}
            isSelf={isSelf}
          />
        </Section>
      )}
    </div>
  );
}

function DescList({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>;
}

function DescRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </>
  );
}

type AddressFields = {
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
};

function AddressBlock({
  personAddress,
  household,
}: {
  personAddress: AddressFields;
  household:
    | (AddressFields & { displayName: string; id: string })
    | null;
}) {
  const personHasAddress =
    !!personAddress.addressLine1 ||
    !!personAddress.postalCode ||
    !!personAddress.city;

  if (personHasAddress) {
    return (
      <FormattedAddress addr={personAddress} note="On file for this person." />
    );
  }
  if (household) {
    const householdHasAddress =
      !!household.addressLine1 || !!household.postalCode || !!household.city;
    if (householdHasAddress) {
      return (
        <FormattedAddress
          addr={household}
          note={
            <>
              From household{" "}
              <Link
                href={`/admin/households/${household.id}`}
                className="underline underline-offset-2"
              >
                {household.displayName}
              </Link>
              .
            </>
          }
        />
      );
    }
  }
  return (
    <p className="text-sm text-[var(--muted-foreground)]">
      No address on file.
    </p>
  );
}

type ExplicitContact = {
  name: string | null;
  phone: string | null;
  relationship: string | null;
};

type GuardianContact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  primaryEmail: string | null;
};

function EmergencyContactBlock({
  explicit,
  guardians,
}: {
  explicit: ExplicitContact;
  guardians: GuardianContact[];
}) {
  const hasExplicit =
    !!explicit.name || !!explicit.phone || !!explicit.relationship;

  if (!hasExplicit && guardians.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">None on file.</p>
    );
  }

  return (
    <div className="space-y-4">
      {hasExplicit && (
        <DescList>
          <DescRow label="Name" value={explicit.name ?? "—"} />
          <DescRow label="Phone" value={explicit.phone ?? "—"} />
          <DescRow
            label="Relationship"
            value={explicit.relationship ?? "—"}
          />
        </DescList>
      )}

      {guardians.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            {hasExplicit
              ? "Other household guardians"
              : "Household guardians (no explicit emergency contact set)"}
          </div>
          <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
            {guardians.map((g) => {
              const fullName =
                [g.firstName, g.lastName].filter(Boolean).join(" ") ||
                "(no name)";
              return (
                <li key={g.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                  <Link
                    href={`/admin/people/${g.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {fullName}
                  </Link>
                  {g.phone && (
                    <a
                      href={`tel:${g.phone.replace(/\s+/g, "")}`}
                      className="text-[var(--muted-foreground)] hover:underline"
                    >
                      {g.phone}
                    </a>
                  )}
                  {g.primaryEmail && (
                    <a
                      href={`mailto:${g.primaryEmail}`}
                      className="text-[var(--muted-foreground)] hover:underline"
                    >
                      {g.primaryEmail}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {!hasExplicit && (
            <p className="text-xs text-[var(--muted-foreground)]">
              The family can choose which adult is the primary emergency
              contact via the Edit page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FormattedAddress({
  addr,
  note,
}: {
  addr: AddressFields;
  note?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <address className="not-italic text-sm leading-relaxed">
        {addr.addressLine1 && <div>{addr.addressLine1}</div>}
        {addr.addressLine2 && <div>{addr.addressLine2}</div>}
        {(addr.postalCode || addr.city) && (
          <div>
            {[addr.postalCode, addr.city].filter(Boolean).join(" ")}
          </div>
        )}
        {addr.country && <div>{addr.country}</div>}
      </address>
      {note && (
        <p className="text-xs text-[var(--muted-foreground)]">{note}</p>
      )}
    </div>
  );
}
