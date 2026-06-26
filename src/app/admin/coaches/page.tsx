import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/icons";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import { CoachDirectory } from "./_components/coach-directory";
import type { CoachRow } from "./coach-lists";

export default async function AdminCoachesPage() {
  await requireAdmin();
  const t = await getTerms();
  const brand = await getCurrentBrand();

  const [coaches, pendingInvites] = await Promise.all([
    prisma.person.findMany({
      where: {
        OR: [
          { coach: { archivedAt: null } },
          { zzpCoach: { archivedAt: null } },
        ],
      },
      include: {
        coach: true,
        zzpCoach: true,
        coachClubAccess: {
          include: { club: { select: { name: true, slug: true } } },
        },
        emails: {
          where: { isPrimary: true, archivedAt: null },
          take: 1,
        },
        coachAvailability: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
          select: {
            dayOfWeek: true,
            startMinute: true,
            endMinute: true,
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.coachInvite.findMany({
      where: {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const staff: CoachRow[] = [];
  const zzp: CoachRow[] = [];
  for (const p of coaches) {
    const isStaff = !!p.coach;
    const isZzp = !!p.zzpCoach;
    const clubsAreAll = p.coachClubAccess.length === 0;
    const row: CoachRow = {
      id: p.id,
      name:
        [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—",
      primaryEmail: p.emails[0]?.address ?? "—",
      clubsLabel: p.coachClubAccess.map((a) => a.club.name).join(", "),
      clubsAreAll,
      isStaff,
      isZzp,
      availability: p.coachAvailability.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
      staffCommercials: p.coach
        ? {
            defaultHourlyRate: p.coach.defaultHourlyRate
              ? Number(p.coach.defaultHourlyRate)
              : null,
            courtRentalRate: p.coach.courtRentalRate
              ? Number(p.coach.courtRentalRate)
              : null,
            knltbQualification: p.coach.knltbQualification ?? null,
            employmentType: p.coach.employmentType,
            isActive: p.coach.isActive,
          }
        : null,
      zzpCommercials: p.zzpCoach
        ? {
            defaultCourtRentalRate: p.zzpCoach.defaultCourtRentalRate
              ? Number(p.zzpCoach.defaultCourtRentalRate)
              : null,
            isActive: p.zzpCoach.isActive,
          }
        : null,
    };
    if (isStaff) staff.push(row);
    if (isZzp) zzp.push(row);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
          {t.coach.singular} accounts
        </h1>
        <Button asChild tone="triaz" size="sm">
          <Link href="/admin/coaches/invites/new">
            <PlusIcon size={14} /> New invite
          </Link>
        </Button>
      </div>

      <CoachDirectory
        pendingInvites={pendingInvites}
        staff={staff}
        zzp={zzp}
        brandName={brand.shortName}
      />
    </div>
  );
}
