import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { GroupedSection } from "@/components/ui/grouped-list";

export function CoachPendingBanner({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <GroupedSection>
      <li className="grouped-row p-0">
        <Link
          href="/coach/bookings"
          className="flex min-h-[3rem] w-full items-center gap-3 bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning-ink)] no-underline active:opacity-90"
        >
          <span className="min-w-0 flex-1">
            {count} deletion request{count === 1 ? "" : "s"} awaiting an admin
            decision.
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium">
            View bookings
            <ArrowRightIcon size={14} />
          </span>
        </Link>
      </li>
    </GroupedSection>
  );
}
