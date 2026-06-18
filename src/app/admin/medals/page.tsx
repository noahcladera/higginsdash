import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MEDAL_LEVELS } from "@/lib/medal-levels";
import { getTotalByCoachReport } from "@/lib/medals/total-by-coach";
import { MedalsFilters } from "./medals-filters";

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

  const [seasons, clubs, coaches, rows] = await Promise.all([
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
    getTotalByCoachReport({
      seasonId: sp.seasonId,
      clubId: sp.clubId,
      coachPersonId: sp.coachId,
    }),
  ]);

  const exportQuery = new URLSearchParams();
  if (sp.seasonId) exportQuery.set("seasonId", sp.seasonId);
  if (sp.clubId) exportQuery.set("clubId", sp.clubId);
  if (sp.coachId) exportQuery.set("coachId", sp.coachId);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Operations"
        title="Medals — Total By Coach"
        description="Matrix of medal levels per lead coach and programme, matching the workbook Total By Coach tab."
        actions={
          <Link
            href={`/admin/medals/export?${exportQuery.toString()}`}
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            Export CSV
          </Link>
        }
      />

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

      <Section title="Matrix">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No lead-coach assignments in published series for these filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/30">
                <tr>
                  <th className="px-3 py-2 font-medium">Coach</th>
                  <th className="px-3 py-2 font-medium">Programme</th>
                  {MEDAL_LEVELS.map((l) => (
                    <th
                      key={l.value}
                      className="px-2 py-2 text-center font-medium tabular-nums"
                    >
                      {l.shortCode}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.flatMap((row) => {
                  if (row.bySeries.length === 0) {
                    return (
                      <MatrixRow
                        key={row.coachId}
                        coach={row.coachName}
                        programme="—"
                        byMedal={row.byMedal}
                        total={row.grandTotal}
                      />
                    );
                  }
                  const seriesRows = row.bySeries.map((s) => (
                    <MatrixRow
                      key={`${row.coachId}-${s.seriesId}`}
                      coach={row.coachName}
                      programme={s.seriesName}
                      byMedal={s.byMedal}
                      total={s.total}
                    />
                  ));
                  seriesRows.push(
                    <MatrixRow
                      key={`${row.coachId}-total`}
                      coach={`${row.coachName} (total)`}
                      programme=""
                      byMedal={row.byMedal}
                      total={row.grandTotal}
                      bold
                    />,
                  );
                  return seriesRows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function MatrixRow({
  coach,
  programme,
  byMedal,
  total,
  bold,
}: {
  coach: string;
  programme: string;
  byMedal: Record<string, number>;
  total: number;
  bold?: boolean;
}) {
  return (
    <tr className={bold ? "bg-[var(--muted)]/20 font-medium" : undefined}>
      <td className="px-3 py-2">{coach}</td>
      <td className="px-3 py-2 text-[var(--muted-foreground)]">{programme}</td>
      {MEDAL_LEVELS.map((l) => (
        <td key={l.value} className="px-2 py-2 text-center tabular-nums">
          {byMedal[l.value] || "—"}
        </td>
      ))}
      <td className="px-3 py-2 text-right tabular-nums">{total}</td>
    </tr>
  );
}
