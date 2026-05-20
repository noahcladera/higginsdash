import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { getTerms } from "@/lib/tenant";
import { PortalTrialForm } from "./_portal-trial-form";

export default async function PortalRequestTrialPage({
  searchParams,
}: {
  searchParams?: Promise<{
    seriesId?: string;
    audience?: string;
    playerPersonId?: string;
    preferredClub?: string;
  }>;
}) {
  const { user, person, householdId } = await requireMember();
  const terms = await getTerms();
  const sp = (await searchParams) ?? {};
  const seriesId = safeUuid(sp.seriesId);
  const preferredClub =
    sp.preferredClub === "triaz" ||
    sp.preferredClub === "randwijck" ||
    sp.preferredClub === "no_preference"
      ? sp.preferredClub
      : "no_preference";
  const initialAudience =
    sp.audience === "kids" || sp.audience === "adults" ? sp.audience : undefined;
  const initialPlayerPersonId = safeUuid(sp.playerPersonId);

  const [personProfile, householdChildren, series] = await Promise.all([
    prisma.person.findUnique({
      where: { id: person.id },
      select: { phone: true },
    }),
    householdId
      ? prisma.householdMember.findMany({
          where: { householdId, roleInHousehold: "child" },
          select: {
            person: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                dateOfBirth: true,
              },
            },
          },
          orderBy: { person: { firstName: "asc" } },
        })
      : Promise.resolve([]),
    seriesId
      ? prisma.classSeries.findUnique({
          where: { id: seriesId },
          select: { id: true, name: true, program: { select: { name: true } } },
        })
      : Promise.resolve(null),
  ]);

  const childrenOptions = householdChildren.map((m) => ({
    personId: m.person.id,
    displayName: `${m.person.firstName} ${m.person.lastName}`.trim(),
    age: ageFromDob(m.person.dateOfBirth),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Trial"
        title={
          series
            ? `Request a trial for ${series.name}`
            : `Request a trial ${terms.class.singular.toLowerCase()}`
        }
        description={
          series
            ? `Tell us who should join and we'll help you try this ${terms.class.singular.toLowerCase()} before you commit.`
            : `Tell us who should join and we'll suggest the right ${terms.class.singular.toLowerCase()} to start with.`
        }
      />

      <PortalTrialForm
        initialContactName={`${person.firstName} ${person.lastName}`.trim()}
        initialEmail={user.email ?? ""}
        initialPhone={personProfile?.phone ?? ""}
        childrenOptions={childrenOptions}
        initialAudience={initialAudience}
        initialPlayerPersonId={initialPlayerPersonId}
        initialPreferredClub={preferredClub}
        classSeriesId={series?.id ?? null}
        classSeriesName={series?.name ?? null}
        classProgramName={series?.program.name ?? null}
      />
    </div>
  );
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function safeUuid(raw: string | undefined): string | null {
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    raw,
  )
    ? raw
    : null;
}
