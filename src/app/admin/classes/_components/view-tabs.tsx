import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminClassesFilters } from "@/lib/admin/classes-filters";
import { adminClassesHrefPatch } from "@/lib/admin/classes-href";

export function AdminClassesViewTabs({
  filters,
}: {
  filters: AdminClassesFilters;
}) {
  const calHref = adminClassesHrefPatch(filters, { view: "calendar" });
  const listHref = adminClassesHrefPatch(filters, { view: "list" });

  return (
    <div
      className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1"
      role="tablist"
      aria-label="View"
    >
      <Link
        href={calHref}
        scroll={false}
        role="tab"
        aria-selected={filters.view === "calendar"}
        className={cn(
          "rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors",
          filters.view === "calendar"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-sm)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        Calendar
      </Link>
      <Link
        href={listHref}
        scroll={false}
        role="tab"
        aria-selected={filters.view === "list"}
        className={cn(
          "rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors",
          filters.view === "list"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-sm)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        List
      </Link>
    </div>
  );
}
