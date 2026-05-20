import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { UserIcon } from "@/components/icons";
import { formatRelative, fullName } from "./format";
import type { DashboardSignupRow } from "./queries";

/**
 * Recent people created in the last 7 days. Surfaces fresh signups so
 * the office can chase up missing memberships, welcome calls, etc.
 */
export function RecentSignups({ signups }: { signups: DashboardSignupRow[] }) {
  if (signups.length === 0) {
    return (
      <EmptyState
        icon={<UserIcon size={20} />}
        title="No new signups"
        description="Nobody new has been added in the last week."
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      {signups.map((p) => (
        <li key={p.id}>
          <Link
            href={`/admin/people/${p.id}`}
            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-strong)] focus:outline-none focus-visible:bg-[var(--surface-strong)]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {fullName(p.firstName, p.lastName)}
                </span>
                {p.isStudent && (
                  <Badge tone="triaz" variant="soft" className="px-1.5 py-0 text-[10px]">
                    student
                  </Badge>
                )}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {p.household ? p.household.displayName : "No household"} ·{" "}
                {formatRelative(p.createdAt)}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
