"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { CalendarSlot, CalendarWeek } from "@/lib/booking/queries";
import { LinkSegmentedControl } from "@/components/ui/link-segmented-control";

type ViewerRole = "admin" | "coach" | "member";

function formatTimelineDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function slotLabel(
  slot: CalendarSlot,
  viewerRole: ViewerRole,
  viewerPersonId: string,
): string {
  switch (slot.state.kind) {
    case "free":
      return "Available";
    case "booked":
      if (viewerRole === "member" && slot.state.purpose === "coaching") {
        return "Reserved";
      }
      if (slot.state.bookedByPersonId === viewerPersonId) {
        return "Your booking";
      }
      return slot.state.bookedByName || "Booked";
    case "class":
      return slot.state.label;
    case "recurring_block":
      return slot.state.label || "Blocked";
    default:
      return "—";
  }
}

function slotTone(
  slot: CalendarSlot,
  dimPast: boolean,
): "free" | "booked" | "muted" {
  if (dimPast) return "muted";
  if (slot.state.kind === "free") return "free";
  return "booked";
}

function isSlotInteractive(
  slot: CalendarSlot,
  dimPast: boolean,
  viewerRole: ViewerRole,
  viewerPersonId: string,
): boolean {
  if (dimPast) return false;
  if (slot.state.kind === "free") return true;
  if (slot.state.kind === "booked") {
    if (viewerRole === "member" && slot.state.purpose === "coaching") {
      return false;
    }
    return slot.state.bookedByPersonId === viewerPersonId;
  }
  return false;
}

function nonBookableHint(
  slot: CalendarSlot,
  viewerRole: ViewerRole,
): string | null {
  if (slot.state.kind === "booked" && slot.state.purpose === "coaching") {
    return "Reserved for a class";
  }
  if (slot.state.kind === "class") {
    return slot.state.label;
  }
  if (slot.state.kind === "recurring_block") {
    return viewerRole === "member" ? "This slot is blocked" : slot.state.label;
  }
  if (slot.state.kind === "booked") {
    return "Already booked";
  }
  return null;
}

export function MemberCourtTimeline({
  data,
  dayDate,
  viewerRole,
  viewerPersonId,
  activeCourtId,
  courtHrefFor,
  slotHrefFor,
  onSelectSlot,
  todayLocalDate,
  nowMinutes,
  rowStepMin,
}: {
  data: CalendarWeek;
  dayDate: string;
  viewerRole: ViewerRole;
  viewerPersonId: string;
  activeCourtId: string;
  /** Link href for each court tab — native navigation for iOS Safari. */
  courtHrefFor: (courtId: string) => string;
  /**
   * Shareable/cold-load href for bookable slots (encodes `?slot=`); null
   * renders a non-navigable row. Taps are intercepted by `onSelectSlot`
   * to open the sheet client-side without a navigation.
   */
  slotHrefFor: (
    court: CalendarWeek["courts"][number],
    slot: CalendarSlot,
  ) => string | null;
  /** Open the booking sheet for a slot instantly (no navigation). */
  onSelectSlot?: (
    court: CalendarWeek["courts"][number],
    slot: CalendarSlot,
  ) => void;
  todayLocalDate: string;
  nowMinutes: number;
  rowStepMin: number;
}) {
  const bookableCourts = data.courts.filter((c) => c.isBookable);
  const court =
    bookableCourts.find((c) => c.id === activeCourtId) ?? bookableCourts[0];
  if (!court) return null;

  const courtOptions = bookableCourts.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const slotsForDay = court.slots.filter(
    (s) => s.startsAtLocal.slice(0, 10) === dayDate,
  );
  const slotByHour = new Map(
    slotsForDay.map((s) => {
      const hour = s.startsAtLocal.slice(11, 16);
      return [hour, s];
    }),
  );

  const isToday = dayDate === todayLocalDate;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] lg:hidden">
      <div className="grouped-section-header border-b border-[var(--content-separator)] px-4 py-2.5">
        {formatTimelineDay(dayDate)}
      </div>
      <div className="space-y-4 p-4">
        {courtOptions.length > 1 && (
          <LinkSegmentedControl
            options={courtOptions}
            value={court.id}
            hrefFor={courtHrefFor}
            aria-label="Court"
          />
        )}
        <GroupedTimeline
          hours={data.hours}
          slotByHour={slotByHour}
          court={court}
          viewerRole={viewerRole}
          viewerPersonId={viewerPersonId}
          isToday={isToday}
          nowMinutes={nowMinutes}
          rowStepMin={rowStepMin}
          slotHrefFor={slotHrefFor}
          onSelectSlot={onSelectSlot}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Walk-on courts are first-come on site — no booking needed.
        </p>
      </div>
    </div>
  );
}

function GroupedTimeline({
  hours,
  slotByHour,
  court,
  viewerRole,
  viewerPersonId,
  isToday,
  nowMinutes,
  rowStepMin,
  slotHrefFor,
  onSelectSlot,
}: {
  hours: string[];
  slotByHour: Map<string, CalendarSlot>;
  court: CalendarWeek["courts"][number];
  viewerRole: ViewerRole;
  viewerPersonId: string;
  isToday: boolean;
  nowMinutes: number;
  rowStepMin: number;
  slotHrefFor: (
    court: CalendarWeek["courts"][number],
    slot: CalendarSlot,
  ) => string | null;
  onSelectSlot?: (
    court: CalendarWeek["courts"][number],
    slot: CalendarSlot,
  ) => void;
}) {
  return (
    <ul className="grouped-section list-none m-0 overflow-hidden p-0">
      {hours.map((hour) => {
        const slot = slotByHour.get(hour);
        if (!slot) return null;
        const rowMin =
          parseInt(hour.split(":")[0], 10) * 60 +
          parseInt(hour.split(":")[1], 10);
        const dimPast = isToday && rowMin + rowStepMin <= nowMinutes;
        const tone = slotTone(slot, dimPast);
        const label = slotLabel(slot, viewerRole, viewerPersonId);
        const interactive = isSlotInteractive(
          slot,
          dimPast,
          viewerRole,
          viewerPersonId,
        );
        const hint = nonBookableHint(slot, viewerRole);
        const href = interactive ? slotHrefFor(court, slot) : null;

        const rowClass = cn(
          "flex min-h-11 flex-1 touch-manipulation px-4 py-3 text-left text-sm transition-colors",
          tone === "free" &&
            "bg-[var(--triaz-soft)]/20 font-semibold text-[var(--triaz-ink)] active:bg-[var(--triaz-soft)]/40",
          tone === "booked" &&
            "text-[var(--foreground)] active:bg-[var(--muted)]/30",
        );

        return (
          <li key={hour} className="grouped-row gap-3 p-0">
            <div className="flex w-full items-stretch">
              <div
                className={cn(
                  "flex w-16 shrink-0 items-center justify-center border-r border-[var(--content-separator)] font-mono text-xs",
                  dimPast && "text-[var(--muted-foreground)]/50 line-through",
                )}
              >
                {hour}
              </div>
              {href ? (
                <Link
                  href={href}
                  prefetch={false}
                  className={rowClass}
                  onClick={(e) => {
                    // Intercept the tap: open the sheet client-side without
                    // a navigation (the href stays for share / cold-load).
                    // Let modified clicks (new tab) navigate normally.
                    if (
                      onSelectSlot &&
                      !e.metaKey &&
                      !e.ctrlKey &&
                      !e.shiftKey &&
                      !e.altKey
                    ) {
                      e.preventDefault();
                      onSelectSlot(court, slot);
                    }
                  }}
                >
                  {label}
                </Link>
              ) : (
                <div
                  role="status"
                  tabIndex={hint ? 0 : undefined}
                  onClick={() => hint && toast.info(hint)}
                  onKeyDown={(e) => {
                    if (hint && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      toast.info(hint);
                    }
                  }}
                  className={cn(
                    rowClass,
                    tone === "muted"
                      ? "cursor-default text-[var(--muted-foreground)]/70"
                      : "cursor-default text-[var(--muted-foreground)]",
                    hint && "active:bg-[var(--muted)]/20",
                  )}
                >
                  {label}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
