"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";

/*
 * Inline date jump used in every booking calendar header (coach, portal,
 * admin). Picking a date in the field navigates immediately — no Go
 * button. Navigation runs inside `useTransition` so the click is
 * acknowledged with a tiny "Loading…" hint while the new RSC payload
 * streams in, instead of feeling unresponsive.
 *
 * `DateField`'s `onCommit` only fires when the user has finished a real
 * date (typed all segments, picked from the popover, or pressed Enter on
 * a partial), so we don't fire navigations on every keystroke.
 */
export function BookingDateJumpForm({
  basePath,
  clubSlug,
  date,
  className,
  dateFieldClassName,
  dateFieldSize = "default",
}: {
  /**
   * Route the date picker should navigate to. The `?club=…&date=…`
   * query string is appended; everything else stays as-is on the page.
   */
  basePath: "/coach/book" | "/portal/book" | "/admin/bookings";
  clubSlug: string;
  /** Currently selected date (YYYY-MM-DD), used as the field's default. */
  date: string;
  className?: string;
  dateFieldClassName?: string;
  dateFieldSize?: "default" | "compact";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={cn("ml-auto flex items-center gap-2", className)}
      aria-busy={pending || undefined}
    >
      <DateField
        defaultValue={date}
        mode="any"
        locale="en-NL"
        size={dateFieldSize}
        className={cn("min-w-[200px]", dateFieldClassName)}
        onCommit={(iso) => {
          if (!iso || iso === date) return;
          startTransition(() => {
            router.push(
              `${basePath}?club=${encodeURIComponent(clubSlug)}&date=${encodeURIComponent(iso)}`,
            );
          });
        }}
      />
      {pending && (
        <span
          className="text-xs text-[var(--muted-foreground)]"
          aria-live="polite"
        >
          Loading…
        </span>
      )}
    </div>
  );
}
