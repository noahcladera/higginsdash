import Link from "next/link";
import { MetricStrip, Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusSurface } from "@/components/ui/status-surface";
import { PlusIcon } from "@/components/icons";
import { revokeCoachInviteForm } from "../actions";
import { ResendCoachInviteButton } from "../resend-coach-invite-button";
import { CoachLists, type CoachRow } from "../coach-lists";

export type PendingCoachInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
};

const compactBadge =
  "px-1.5 py-px text-[10px] leading-4 font-medium shadow-none";

export function CoachDirectory({
  pendingInvites,
  staff,
  zzp,
  brandName,
}: {
  pendingInvites: PendingCoachInvite[];
  staff: CoachRow[];
  zzp: CoachRow[];
  brandName: string;
}) {
  const staffIds = new Set(staff.map((r) => r.id));
  const zzpOnly = zzp.filter((r) => !staffIds.has(r.id)).length;
  const dualRole = staff.filter((r) => r.isZzp).length;
  const uniqueActive = staff.length + zzpOnly;

  return (
    <div className="space-y-4">
      <MetricStrip density="compact">
        <Stat
          label="Active coaches"
          value={uniqueActive}
          tone="triaz"
          density="compact"
        />
        <Stat label="Staff" value={staff.length} density="compact" />
        <Stat label="ZZP" value={zzp.length} density="compact" />
        <Stat
          label="Pending invites"
          value={pendingInvites.length}
          tone={pendingInvites.length > 0 ? "warning" : "neutral"}
          density="compact"
        />
      </MetricStrip>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
            Pending invites
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Links expire after 14 days.
          </p>
        </div>
        {pendingInvites.length === 0 ? (
          <EmptyState
            title="No pending invites"
            description="Send an invite when a new coach needs portal access."
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/admin/coaches/invites/new">
                  <PlusIcon size={14} /> New invite
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-1">
            {pendingInvites.map((inv) => (
              <li key={inv.id}>
                <StatusSurface
                  tone="warning"
                  className="elev-card flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="text-sm font-medium">{inv.email}</span>
                      <StatusBadge tone="warning" className={compactBadge}>
                        Pending
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {inv.role === "staff_coach" ? "Staff coach" : "ZZP coach"}{" "}
                      · expires {inv.expiresAt.toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ResendCoachInviteButton inviteId={inv.id} />
                    <form action={revokeCoachInviteForm}>
                      <input type="hidden" name="inviteId" value={inv.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Revoke
                      </Button>
                    </form>
                  </div>
                </StatusSurface>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
            Active coaches
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Staff and ZZP profiles with portal access.
          </p>
        </div>
        {staff.length === 0 && zzp.length === 0 ? (
          <EmptyState
            title="No coaches yet"
            description="Send an invite above to add staff or ZZP coaches."
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/admin/coaches/invites/new">
                  <PlusIcon size={14} /> New invite
                </Link>
              </Button>
            }
          />
        ) : (
          <CoachLists staff={staff} zzp={zzp} brandName={brandName} />
        )}
      </section>
    </div>
  );
}
