import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { Button } from "@/components/ui/button";
import { MembersSection } from "./members-section";
import { HouseholdDangerZone } from "./danger-zone";
import { CreditsPanel } from "./credits/credits-panel";
import { SYSTEM_HOUSEHOLD_ID } from "@/lib/system-ids";
import { format } from "@/lib/format";
import {
  getHouseholdCreditBalanceCents,
  getHouseholdCreditLedger,
} from "@/lib/credits";
import { getStudentContactsBulk } from "@/lib/contacts/queries";
import { getCurrentBrand, getFeatureFlags } from "@/lib/tenant";
import { getLegacyProfileForHousehold } from "@/lib/admin/legacy-profile";
import { LegacyHistorySection } from "@/components/admin/legacy-history-section";

export default async function HouseholdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const brand = await getCurrentBrand();

  const household = await prisma.household.findUnique({
    where: { id },
    include: {
      members: {
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
        orderBy: [
          { roleInHousehold: "asc" },
          { joinedHouseholdOn: "asc" },
        ],
      },
    },
  });

  if (!household) notFound();

  const isArchived = household.archivedAt !== null;
  const isSystem = household.id === SYSTEM_HOUSEHOLD_ID;

  const [creditBalanceCents, creditEntries] = await Promise.all([
    getHouseholdCreditBalanceCents(household.id),
    getHouseholdCreditLedger(household.id, 25),
  ]);
  const creatorIds = Array.from(
    new Set(creditEntries.map((e) => e.createdByPersonId)),
  );
  const creators = creatorIds.length
    ? await prisma.person.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const creatorById = new Map(
    creators.map((c) => [
      c.id,
      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || null,
    ]),
  );

  const features = await getFeatureFlags();
  const legacyProfile = features.legacyHistory
    ? await getLegacyProfileForHousehold(household.id)
    : null;

  const memberContactGroups = await getStudentContactsBulk(
    household.members.map((m) => m.personId),
  );
  const contactByMember = new Map(
    memberContactGroups.map((g) => [g.personId, g]),
  );

  const memberRows = household.members.map((m) => {
    const name =
      [m.person.firstName, m.person.lastName].filter(Boolean).join(" ").trim() ||
      "(no name)";
    return {
      id: m.id,
      personId: m.personId,
      name,
      email: m.person.emails[0]?.address ?? null,
      role: m.roleInHousehold,
      isPrimaryContact: m.personId === household.primaryContactPersonId,
      joinedOn: format.date(m.joinedHouseholdOn),
      contactGroup: contactByMember.get(m.personId) ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Households", href: "/admin/households" },
          { label: household.displayName },
        ]}
      />
      <PageHeader
        kicker="Admin · Households"
        title={household.displayName}
        description={`Household id ${household.id}`}
        actions={
          !isSystem ? (
            <Button asChild variant="outline">
              <Link href={`/admin/households/${household.id}/edit`}>Edit</Link>
            </Button>
          ) : undefined
        }
      />

      {isArchived && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
          This household was archived on {format.date(household.archivedAt!)}.
        </div>
      )}

      {isSystem && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
          System placeholder household — referenced by seed data.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Address" surface="card">
          {household.addressLine1 ||
          household.postalCode ||
          household.city ? (
            <address className="not-italic text-sm leading-relaxed">
              {household.addressLine1 && <div>{household.addressLine1}</div>}
              {household.addressLine2 && <div>{household.addressLine2}</div>}
              {(household.postalCode || household.city) && (
                <div>
                  {[household.postalCode, household.city]
                    .filter(Boolean)
                    .join(" ")}
                </div>
              )}
              <div className="text-[var(--muted-foreground)]">
                {household.country}
              </div>
            </address>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No address on file.
            </p>
          )}
        </Section>

        <Section title="Notes" surface="card">
          {household.notes ? (
            <p className="whitespace-pre-wrap text-sm">{household.notes}</p>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No notes.
            </p>
          )}
        </Section>
      </div>

      <Section
        title={`Members (${memberRows.length})`}
        description="A person can only belong to one household at a time."
        surface="card"
      >
        <MembersSection
          householdId={household.id}
          members={memberRows}
          brandName={brand.shortName}
        />
      </Section>

      {!isSystem && (
        <Section
          title="Lesson credit"
          description="Household credit applied automatically at lesson checkout. Lessons only — never used for memberships."
          surface="card"
        >
          <CreditsPanel
            householdId={household.id}
            balanceCents={creditBalanceCents}
            entries={creditEntries.map((e) => ({
              id: e.id,
              amountCents: e.amountCents,
              reason: e.reason,
              note: e.note,
              createdAt: format.date(e.createdAt),
              createdByName: creatorById.get(e.createdByPersonId) ?? null,
              relatedEnrollmentId: e.relatedEnrollmentId,
              relatedPaymentId: e.relatedPaymentId,
            }))}
          />
        </Section>
      )}

      <LegacyHistorySection profile={legacyProfile} />

      {!isSystem && (
        <Section title="Danger zone" surface="card">
          <HouseholdDangerZone
            householdId={household.id}
            isArchived={isArchived}
          />
        </Section>
      )}
    </div>
  );
}
