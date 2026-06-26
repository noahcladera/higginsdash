import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { MetricStrip, Stat } from "@/components/ui/stat";
import { buildWhatsAppLink } from "@/lib/contacts/phone";
import {
  getCoachAssignmentGaps,
  getCoachMedalsReport,
} from "@/lib/medals/coach-medals-report";
import {
  buildLevelReminderWhatsAppBody,
  buildMedalReminderWhatsAppBody,
} from "@/lib/medals/reminder-messages";
import { resolveAppOrigin } from "@/lib/site-url";
import { getCurrentBrand } from "@/lib/tenant";
import { MedalsFilters } from "./medals-filters";
import {
  MedalsCoachMatrix,
  type CoachMedalsMatrixRow,
} from "./_components/medals-coach-matrix";

export default async function AdminMedalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    seasonId?: string;
    clubId?: string;
    coachId?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const [seasons, clubs, coaches, reportRows, brand, origin] =
    await Promise.all([
      prisma.season.findMany({
        orderBy: { startsOn: "desc" },
        select: { id: true, name: true },
        take: 20,
      }),
      prisma.club.findMany({
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.coach.findMany({
        where: { isActive: true, person: { archivedAt: null } },
        orderBy: { person: { lastName: "asc" } },
        select: {
          personId: true,
          person: { select: { firstName: true, lastName: true } },
        },
      }),
      getCoachMedalsReport({
        seasonId: sp.seasonId,
        clubId: sp.clubId,
        coachPersonId: sp.coachId,
      }),
      getCurrentBrand(),
      resolveAppOrigin(),
    ]);

  const fullGapsByCoach = new Map(
    (
      await Promise.all(
        reportRows.map(async (row) => [
          row.coachId,
          await getCoachAssignmentGaps(row.coachId),
        ] as const),
      )
    ).map(([coachId, gaps]) => [coachId, gaps]),
  );

  const rows: CoachMedalsMatrixRow[] = reportRows.map((row) => {
    const fullGaps = fullGapsByCoach.get(row.coachId);
    const missingMedals = fullGaps?.missingMedals ?? row.missingMedals;
    const missingLevels = fullGaps?.missingLevels ?? row.missingLevels;

    const whatsappMedalsUrl =
      missingMedals.length > 0
        ? buildWhatsAppLink(
            row.coachPhone,
            buildMedalReminderWhatsAppBody({
              coachName: row.coachName,
              brandName: brand.shortName,
              origin,
              gaps: missingMedals,
            }),
          )
        : null;

    const whatsappLevelsUrl =
      missingLevels.length > 0
        ? buildWhatsAppLink(
            row.coachPhone,
            buildLevelReminderWhatsAppBody({
              coachName: row.coachName,
              brandName: brand.shortName,
              origin,
              gaps: missingLevels,
            }),
          )
        : null;

    return {
      ...row,
      missingMedals,
      missingLevels,
      whatsappMedalsUrl,
      whatsappLevelsUrl,
    };
  });

  const exportQuery = new URLSearchParams();
  if (sp.seasonId) exportQuery.set("seasonId", sp.seasonId);
  if (sp.clubId) exportQuery.set("clubId", sp.clubId);
  if (sp.coachId) exportQuery.set("coachId", sp.coachId);

  const coachCount = rows.length;
  const enrolledCount = rows.reduce((sum, row) => sum + row.enrolledCount, 0);
  const assignedCount = rows.reduce((sum, row) => sum + row.assignedCount, 0);
  const missingMedalCount = rows.reduce(
    (sum, row) => sum + row.missingMedals.length,
    0,
  );
  const missingLevelCount = rows.reduce(
    (sum, row) => sum + row.missingLevels.length,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
          Medals
        </h1>
        <Button asChild variant="outline" tone="neutral" size="sm">
          <Link href={`/admin/medals/export?${exportQuery.toString()}`}>
            Export CSV
          </Link>
        </Button>
      </div>

      <MedalsFilters
        seasons={seasons}
        clubs={clubs}
        coaches={coaches.map((c) => ({
          id: c.personId,
          name:
            [c.person.firstName, c.person.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || "Unnamed",
        }))}
        selected={{
          seasonId: sp.seasonId ?? "",
          clubId: sp.clubId ?? "",
          coachId: sp.coachId ?? "",
        }}
      />

      <MetricStrip density="compact">
        <Stat label="Coaches" value={coachCount} tone="triaz" density="compact" />
        <Stat label="Enrolled" value={enrolledCount} density="compact" />
        <Stat label="Assigned" value={assignedCount} density="compact" />
        <Stat
          label="Missing medal"
          value={missingMedalCount}
          tone={missingMedalCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
        <Stat
          label="Missing level"
          value={missingLevelCount}
          tone={missingLevelCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
      </MetricStrip>

      <MedalsCoachMatrix rows={rows} initialCoachId={sp.coachId} />
    </div>
  );
}
