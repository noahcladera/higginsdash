import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * "Active / Archived" toggle for list pages. Driven by the `?archived=1`
 * URL param. Resets `?page` when toggled.
 */
export function ArchivedToggle({
  showArchived,
  searchParams,
}: {
  showArchived: boolean;
  searchParams: Record<string, string | undefined>;
}) {
  const baseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== "archived" && k !== "page") baseParams.set(k, v);
  }

  const activeHref = `?${baseParams.toString()}`;
  const archivedParams = new URLSearchParams(baseParams);
  archivedParams.set("archived", "1");
  const archivedHref = `?${archivedParams.toString()}`;

  return (
    <div className="inline-flex shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
      <Link
        href={activeHref}
        className={cn(
          "rounded-full px-3 py-1.5 transition-colors",
          !showArchived
            ? "control-well font-medium text-[var(--foreground)] shadow-[var(--shadow-elevated)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        Active
      </Link>
      <Link
        href={archivedHref}
        className={cn(
          "rounded-full px-3 py-1.5 transition-colors",
          showArchived
            ? "control-well font-medium text-[var(--foreground)] shadow-[var(--shadow-elevated)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        Archived
      </Link>
    </div>
  );
}
