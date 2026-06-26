import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon } from "@/components/icons";
import {
  deliveryModeLabel,
  deliveryModeTone,
  formatTime,
  fullName,
} from "./format";
import type { DashboardClassRow } from "./queries";

/**
 * Vertical list of every class session scheduled for today across all
 * coaches. Each row deep-links into the admin class detail. Coaches are
 * the *per-session* lineup (subs included), not the series defaults.
 */
export function TodaysClasses({ classes }: { classes: DashboardClassRow[] }) {
  if (classes.length === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon size={20} />}
        title="No classes today"
        description="Nothing scheduled. Quiet day for the program."
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] elev-card overflow-hidden rounded-[var(--radius-md)]">
      {classes.map((c) => {
        const venueLine =
          c.deliveryMode === "pickup" && c.schoolName
            ? `${c.schoolName} → ${c.venueName}`
            : c.venueName;
        const courtLine = c.courtName ? ` · ${c.courtName}` : "";
        return (
          <li key={c.id}>
            <Link
              href={`/admin/classes/${c.seriesId}`}
              className="flex items-start gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-strong)] focus:outline-none focus-visible:bg-[var(--surface-strong)]"
            >
              <div className="w-24 shrink-0">
                <div className="tabular font-display text-lg font-medium tracking-tight">
                  {formatTime(c.startsAt)}
                </div>
                <div className="tabular text-xs text-[var(--muted-foreground)]">
                  → {formatTime(c.endsAt)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {c.programName}
                  {c.seriesName && c.seriesName !== c.programName
                    ? ` · ${c.seriesName}`
                    : ""}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {venueLine}
                  {courtLine} · {c.enrolledCount} enrolled
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {c.coaches.length === 0 ? (
                    <span className="text-[var(--destructive)]">
                      No coach assigned
                    </span>
                  ) : (
                    c.coaches.map((co) => (
                      <span
                        key={co.personId}
                        className="inline-flex items-center gap-1"
                      >
                        <span className="text-[var(--foreground)]">
                          {fullName(co.firstName, co.lastName)}
                        </span>
                        {co.isSubstitute && (
                          <Badge
                            tone="warning"
                            variant="soft"
                            className="px-1.5 py-0 text-[10px]"
                          >
                            sub
                          </Badge>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="shrink-0">
                <Badge tone={deliveryModeTone(c.deliveryMode)} variant="soft">
                  {deliveryModeLabel(c.deliveryMode)}
                </Badge>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
