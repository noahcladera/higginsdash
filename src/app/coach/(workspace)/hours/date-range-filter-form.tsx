"use client";

import { Button } from "@/components/ui/button";
import { DateRangeField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";

export function CoachHoursDateRangeFilterForm({
  from,
  to,
  className,
}: {
  from: string;
  to: string;
  className?: string;
}) {
  return (
    <form
      method="GET"
      className={cn(
        "ml-auto flex flex-wrap items-end gap-3 rounded-full bg-[var(--surface)] px-3 py-1.5",
        className,
      )}
    >
      <DateRangeField
        startName="from"
        endName="to"
        startDefaultValue={from}
        endDefaultValue={to}
        startLabel="From"
        endLabel="To"
        startId="hours-from"
        endId="hours-to"
        mode="any"
        locale="en-NL"
        className="max-w-md"
      />
      <Button type="submit" size="sm" tone="neutral" variant="ghost">
        Update
      </Button>
    </form>
  );
}
