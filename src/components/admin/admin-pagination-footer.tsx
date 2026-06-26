import { Pagination } from "@/components/admin/pagination";
import { cn } from "@/lib/utils";

/** Pagination wrapped in elev-panel footer strip. */
export function AdminPaginationFooter({
  page,
  pageSize,
  total,
  searchParams,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <div className={cn("elev-panel px-4 py-3 sm:px-5", className)}>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        searchParams={searchParams}
      />
    </div>
  );
}
