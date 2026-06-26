import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { MetricStrip, Stat } from "@/components/ui/stat";
import { ClassIcon, PlusIcon } from "@/components/icons";
import { sortSeriesRows } from "@/lib/admin/series-grouping";
import type { ClassRowData } from "./class-row";
import { ClassSeriesMaterialRow } from "./class-series-material-row";

function needsAttention(row: ClassRowData): boolean {
  return row.status === "draft" || row.leadCoachName === "NO COACH YET";
}

export function AdminClassesListView({
  rows,
  q,
}: {
  rows: ClassRowData[];
  q: string;
}) {
  const attentionRows = sortSeriesRows(rows.filter(needsAttention));
  const restRows = sortSeriesRows(rows.filter((r) => !needsAttention(r)));
  const attentionCount = attentionRows.length;
  const publishedCount = rows.filter((r) => r.status === "published").length;
  const missingCourtCount = rows.filter(
    (r) => r.venueKind === "club" && !r.defaultCourtId,
  ).length;

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <MetricStrip density="compact">
          <Stat label="Series" value={0} tone="triaz" density="compact" />
          <Stat label="Needs attention" value={0} tone="warning" density="compact" />
          <Stat label="Published" value={0} density="compact" />
          <Stat label="Missing court" value={0} density="compact" />
        </MetricStrip>
        <EmptyState
          icon={<ClassIcon size={20} />}
          title={q ? `No classes match "${q}".` : "No classes yet"}
          description={
            q
              ? "Try fewer words or clear filters."
              : "Create your first class series to start generating sessions."
          }
          action={
            !q ? (
              <Button asChild tone="triaz" size="sm">
                <Link href="/admin/classes/new">
                  <PlusIcon size={14} /> Create a class
                </Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MetricStrip density="compact">
        <Stat
          label="Series"
          value={rows.length}
          tone="triaz"
          density="compact"
        />
        <Stat
          label="Needs attention"
          value={attentionCount}
          tone={attentionCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
        <Stat label="Published" value={publishedCount} density="compact" />
        <Stat
          label="Missing court"
          value={missingCourtCount}
          tone={missingCourtCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
      </MetricStrip>

      {attentionRows.length > 0 && (
        <div className="alert-glass-warning space-y-1.5 rounded-[var(--radius-md)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--warning-ink)]">
            Needs attention · {attentionRows.length}
          </p>
          <ul className="space-y-1">
            {attentionRows.map((row) => (
              <ClassSeriesMaterialRow key={row.id} data={row} />
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1">
        {restRows.map((r) => (
          <ClassSeriesMaterialRow key={r.id} data={r} />
        ))}
      </ul>
    </div>
  );
}
