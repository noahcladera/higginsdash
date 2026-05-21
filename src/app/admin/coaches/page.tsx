import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/icons";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusSurface } from "@/components/ui/status-surface";
import { revokeCoachInviteForm } from "./actions";
import { ResendCoachInviteButton } from "./resend-coach-invite-button";
import { CoachLists, type CoachRow } from "./coach-lists";

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

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={t.coach.plural}
        title={`${t.coach.singular} accounts`}
        description={`Invite staff, then scope which ${t.club.plural.toLowerCase()} they can use.`}
        actions={
          <Button asChild tone="joint">
            <Link href="/admin/coaches/invites/new">
              <PlusIcon size={16} /> New invite
            </Link>
          </Button>
        }
      />

      <Section
        title="Pending invites"
        description="Links expire after 14 days. Resend if the email was lost."
      >
        {pendingInvites.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No pending invites.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {pendingInvites.map((inv) => (
              <StatusSurface
                key={inv.id}
                as="li"
                tone="warning"
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{inv.email}</span>
                    <StatusBadge tone="warning">Pending</StatusBadge>
                  </div>
                  <div className="text-sm text-[var(--muted-foreground)]">
                    {inv.role === "staff_coach" ? "Staff coach" : "ZZP coach"} ·
                    expires {inv.expiresAt.toISOString().slice(0, 10)}
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ResendCoachInviteButton inviteId={inv.id} />
                  <form action={revokeCoachInviteForm}>
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Revoke
                    </Button>
                  </form>
                </div>
              </StatusSurface>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Active coaches"
        description="Staff and ZZP profiles with portal access. Use the filter to focus on one role at a time."
      >
        {coaches.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No coaches yet — send an invite above.
          </p>
        ) : (
          (() => {
            const staff: CoachRow[] = [];
            const zzp: CoachRow[] = [];
            for (const p of coaches) {
              const isStaff = !!p.coach;
              const isZzp = !!p.zzpCoach;
              const clubsAreAll = p.coachClubAccess.length === 0;
              const row: CoachRow = {
                id: p.id,
                name:
                  [p.firstName, p.lastName].filter(Boolean).join(" ").trim() ||
                  "—",
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
              // A dual-role coach shows up in both lists so they can't be
              // missed when an admin filters down to a single role.
              if (isStaff) staff.push(row);
              if (isZzp) zzp.push(row);
            }
            return (
              <CoachLists
                staff={staff}
                zzp={zzp}
                brandName={brand.shortName}
              />
            );
          })()
        )}
      </Section>
    </div>
  );
}
