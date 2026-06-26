import { SearchInput } from "@/components/admin/search-input";
import { ArchivedToggle } from "@/components/admin/archived-toggle";
import { cn } from "@/lib/utils";

/**
 * Glass ribbon toolbar for admin list pages — search + active/archived toggle.
 */
export function AdminListToolbar({
  searchPlaceholder,
  showArchived,
  searchParams,
  className,
}: {
  searchPlaceholder?: string;
  showArchived: boolean;
  searchParams: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-ribbon flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5",
        className,
      )}
    >
      <SearchInput
        placeholder={searchPlaceholder ?? "Search…"}
        className="max-w-none flex-1"
      />
      <ArchivedToggle showArchived={showArchived} searchParams={searchParams} />
    </div>
  );
}
