import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  defaultCalendarFromISO,
  shiftCalendarFromISO,
  type AdminClassesFilters,
} from "@/lib/admin/classes-filters";
import { adminClassesHrefPatch } from "@/lib/admin/classes-href";
import { Button } from "@/components/ui/button";

export function AdminCalendarDayNav({
  filters,
}: {
  filters: AdminClassesFilters;
}) {
  const today = defaultCalendarFromISO();
  const prevFrom = shiftCalendarFromISO(filters.fromISO, -filters.span);
  const nextFrom = shiftCalendarFromISO(filters.fromISO, filters.span);
  const isToday = filters.fromISO === today;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link
          href={adminClassesHrefPatch(filters, { fromISO: prevFrom })}
          scroll={false}
        >
          ← Prev
        </Link>
      </Button>
      {!isToday && (
        <Button asChild variant="outline" size="sm">
          <Link
            href={adminClassesHrefPatch(filters, { fromISO: today })}
            scroll={false}
          >
            Today
          </Link>
        </Button>
      )}
      <Button asChild variant="outline" size="sm">
        <Link
          href={adminClassesHrefPatch(filters, { fromISO: nextFrom })}
          scroll={false}
        >
          Next →
        </Link>
      </Button>

      <div className="ml-auto flex items-center gap-1 rounded-md border border-[var(--border)] p-0.5">
        {([1, 3, 7] as const).map((sp) => (
          <Link
            key={sp}
            href={adminClassesHrefPatch(filters, { span: sp })}
            scroll={false}
            className={cn(
              "rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium",
              filters.span === sp
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-sm)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {sp === 1 ? "1d" : sp === 3 ? "3d" : "Week"}
          </Link>
        ))}
      </div>
    </div>
  );
}
