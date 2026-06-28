import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Glass-friendly week pager for coach home / calendar sections.
 */
export function CoachWeekPager({
  prevHref,
  nextHref,
  thisWeekHref,
  isThisWeek,
  label,
  className,
}: {
  prevHref: string;
  nextHref: string;
  thisWeekHref: string;
  isThisWeek: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <div className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm">
        <span className="font-display text-base font-medium leading-none tracking-tight">
          {label}
        </span>
        {isThisWeek && (
          <span className="ml-2 inline-flex items-center rounded-full bg-[var(--triaz-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--triaz-ink)]">
            This week
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button asChild variant="ghost" tone="neutral" size="icon">
          <Link aria-label="Previous week" href={prevHref} className="group/scrub">
            <span
              aria-hidden
              className="inline-flex transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] group-hover/scrub:-translate-x-0.5"
            >
              <ChevronLeftIcon />
            </span>
          </Link>
        </Button>
        {!isThisWeek && (
          <Button asChild variant="ghost" tone="neutral" size="sm">
            <Link href={thisWeekHref}>Today</Link>
          </Button>
        )}
        <Button asChild variant="ghost" tone="neutral" size="icon">
          <Link aria-label="Next week" href={nextHref} className="group/scrub">
            <span
              aria-hidden
              className="inline-flex transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] group-hover/scrub:translate-x-0.5"
            >
              <ChevronRightIcon />
            </span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
