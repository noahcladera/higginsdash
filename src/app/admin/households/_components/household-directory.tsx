import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MetricStrip, Stat } from "@/components/ui/stat";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusSurface } from "@/components/ui/status-surface";
import { ChevronRightIcon, FamilyIcon } from "@/components/icons";
import { AdminPaginationFooter } from "@/components/admin/admin-pagination-footer";
import { cn } from "@/lib/utils";

export type HouseholdDirectoryRow = {
  id: string;
  displayName: string;
  city: string | null;
  archivedAt: Date | null;
  primaryContactName: string;
  memberCount: number;
};

export type HouseholdDirectoryStats = {
  total: number;
  totalMembers: number;
  emptyCount: number;
  archived: number;
};

export function HouseholdDirectory({
  rows,
  stats,
  showArchived,
  query,
  householdLabel,
  page,
  pageSize,
  searchParams,
}: {
  rows: HouseholdDirectoryRow[];
  stats: HouseholdDirectoryStats;
  showArchived: boolean;
  query: string;
  householdLabel: string;
  page: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <div className="space-y-6">
      <MetricStrip>
        <Stat
          label={showArchived ? "Archived" : `Active ${householdLabel.toLowerCase()}`}
          value={stats.total}
          hint={query ? `Matching "${query}"` : "In directory"}
          tone="triaz"
        />
        <Stat
          label="Members"
          value={stats.totalMembers}
          hint="Across visible results"
        />
        <Stat
          label="Empty"
          value={stats.emptyCount}
          hint={`No linked ${householdLabel.toLowerCase()} members`}
          tone={stats.emptyCount > 0 ? "warning" : "neutral"}
        />
        <Stat
          label="Archived total"
          value={stats.archived}
          hint={stats.archived === 0 ? "None hidden" : "Switch toggle to browse"}
          tone={stats.archived > 0 ? "warning" : "neutral"}
        />
      </MetricStrip>

      {rows.length === 0 ? (
        <EmptyState
          title={
            query
              ? "No matches"
              : showArchived
                ? `No archived ${householdLabel.toLowerCase()}`
                : `No ${householdLabel.toLowerCase()} yet`
          }
          description={
            query
              ? `Nothing matches "${query}".`
              : showArchived
                ? "Archived households appear here."
                : `Create a ${householdLabel.toLowerCase()} to sell memberships and enrolments to.`
          }
        />
      ) : (
        <Section title="Directory" surface="bare">
          <ul className="space-y-2">
            {rows.map((household) => (
              <HouseholdRow
                key={household.id}
                household={household}
                householdLabel={householdLabel}
                archived={!!household.archivedAt}
              />
            ))}
          </ul>
        </Section>
      )}

      <AdminPaginationFooter
        page={page}
        pageSize={pageSize}
        total={stats.total}
        searchParams={searchParams}
      />
    </div>
  );
}

function HouseholdRow({
  household,
  archived = false,
}: {
  household: HouseholdDirectoryRow;
  householdLabel: string;
  archived?: boolean;
}) {
  return (
    <li>
      <Link
        href={`/admin/households/${household.id}`}
        className="group block rounded-[var(--radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <StatusSurface
          tone="triaz"
          className={cn(
            "elev-card flex items-center gap-3 px-4 py-3.5 transition-[transform,box-shadow] duration-[var(--duration-fast)] sm:gap-4 sm:py-4",
            "group-hover:-translate-y-px group-hover:shadow-[var(--shadow-elevated)]",
            archived && "opacity-70 saturate-[0.92]",
          )}
        >
          <div
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full control-well bg-[var(--triaz-soft)] text-[var(--triaz-ink)] sm:flex"
            aria-hidden
          >
            <FamilyIcon size={20} />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium tracking-tight text-[var(--foreground)]">
                {household.displayName}
              </span>
              {archived && (
                <Badge tone="neutral" variant="soft">
                  archived
                </Badge>
              )}
              <span className="tabular text-xs text-[var(--muted-foreground)] sm:hidden">
                {household.memberCount} members
              </span>
            </div>
            <p className="truncate text-sm text-[var(--muted-foreground)]">
              {household.primaryContactName}
              {household.city ? ` · ${household.city}` : ""}
            </p>
          </div>

          <div className="hidden shrink-0 text-right sm:block">
            <div className="font-display text-2xl font-medium tabular-nums leading-none tracking-tight">
              {household.memberCount}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {household.memberCount === 1 ? "member" : "members"}
            </div>
          </div>

          <ChevronRightIcon
            size={16}
            className="shrink-0 text-[var(--muted-foreground)] transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-[var(--foreground)]"
          />
        </StatusSurface>
      </Link>
    </li>
  );
}
