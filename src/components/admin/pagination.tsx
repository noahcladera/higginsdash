import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageSize,
  total,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function buildHref(p: number) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v) next.set(k, v);
    }
    next.set("page", String(p));
    return `?${next.toString()}`;
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="text-[var(--muted-foreground)]">
        {total === 0
          ? "No results"
          : `Showing ${start}\u2013${end} of ${total}`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          asChild={hasPrev}
          variant="outline"
          size="sm"
          disabled={!hasPrev}
        >
          {hasPrev ? <Link href={buildHref(page - 1)}>Previous</Link> : <span>Previous</span>}
        </Button>
        <span className="text-xs text-[var(--muted-foreground)]">
          Page {page} of {totalPages}
        </span>
        <Button
          asChild={hasNext}
          variant="outline"
          size="sm"
          disabled={!hasNext}
        >
          {hasNext ? <Link href={buildHref(page + 1)}>Next</Link> : <span>Next</span>}
        </Button>
      </div>
    </div>
  );
}
