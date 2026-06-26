"use client";

/**
 * Day-view court calendar grid: rows = hour slots, columns = courts.
 *
 * The grid receives one day's worth of pre-rendered slot states (computed
 * in `src/lib/booking/queries.ts`) and adds the click handlers + dialogs
 * for the booking lifecycle. It works for all three viewer roles:
 *   - admin:  click free slot → book for a coach or member (never as self),
 *             click any booking → can immediately cancel; block-off mode.
 *   - coach:  click free slot → personal or private lesson for self,
 *             click own booking → cancel personal / request-deletion for coaching.
 *   - member: click free slot → personal play under own account; click own
 *             booking → cancel. Coaching slots show as "Reserved".
 *
 * Walk-on-only courts (`isBookable === false`) render in a slim column with
 * subtle hatching; clicking opens an info dialog explaining the walk-on
 * rules instead of the booking dialog.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BookingPartnerCaptureMode } from "@prisma/client";
import {
  createBooking,
  cancelBooking,
  requestBookingCancellation,
} from "@/lib/booking/actions";
import type { CalendarWeek, CalendarSlot } from "@/lib/booking/queries";
import { bookingGridStepMinutes } from "@/lib/booking/time";
import { startCheckout as beginCheckout } from "@/lib/payments/start-checkout";
import { portalPurchaseSuccessUrl } from "@/lib/portal/purchase-success-url";
import { useActionFeedback } from "@/lib/feedback";
import { PartyInput, type PartyEntry } from "./party-input";
import { searchClubMembers } from "@/lib/booking/partner-lookup";
import { BlockSelectionDialog } from "./block-selection-dialog";
import {
  groupSelectionToPatterns,
  type BlockPattern,
} from "./block-selection";
import { RecurringCoachLessonDialog } from "./recurring-coach-lesson-dialog";
import { AdminCreateBookingDialog } from "./admin-create-booking-dialog";
import type { CoachOption } from "./admin-create-booking-dialog";
import {
  contentMinWidthClass,
  getCourtVisual,
  mergeCourtWidthClasses,
  shortenAdminClassLabel,
} from "./court-visuals";
import { useTerms } from "@/components/tenant/terms-provider";
import {
  bookingSlotColorClasses,
  classSlotColorClasses,
  classSlotMergeBorderClasses,
  adminCompactClassSlotClasses,
  adminCompactClassMergeBorderClasses,
  adminCompactBookingSlotClasses,
  adminCompactLegendAccent,
  memberReservedSlotClasses,
  scheduleClassCategoryLabel,
} from "@/lib/admin/schedule-slot-colors";
import { themeBySlug } from "@/lib/club-theme";
import {
  formatLocalDate,
  formatLocalHour,
  localMinutesSinceMidnight,
} from "@/lib/booking/time";

export type ViewerRole = "admin" | "coach" | "member";

const PAST_CELL = "bg-[var(--muted)]/20";
/** Unified fade for any occupied or interactive slot in the past. */
const PAST_SLOT_MUTED = "opacity-50 saturate-[0.82]";

export interface CourtCalendarGridProps {
  data: CalendarWeek;
  /**
   * Subset of dates from `data.days` to render in this view.
   *  - Day view: pass `[date]`.
   *  - Week view: pass 4 or 3 dates (a half-week chunk).
   * If omitted we fall back to the first day in `data.days`.
   *
   * Mutually exclusive with `dayRows`: pass one or the other.
   */
  dayDates?: string[];
  /**
   * Multi-row layout: each inner array is rendered as its own stacked
   * table, sharing the page-level header and "Block off" button. Used by
   * the admin week view to show 4 days on top + 3 days below.
   */
  dayRows?: string[][];
  /** "day" or "week"; only changes header layout + day banners. */
  view?: "day" | "week";
  viewerRole: ViewerRole;
  viewerPersonId: string;
  /** Active coaches for admin on-behalf lesson bookings. */
  coachOptions?: CoachOption[];
  /** Hide page header / block-off tip (multi-club schedule sections after the first). */
  compact?: boolean;
  /** Admin schedule embed: no duplicate date header/tips; keep block-off toolbar. */
  embedded?: boolean;
  /** Week view: scroll this local date column into view on mount. */
  scrollToDate?: string;
}

type SelectedSlot =
  | { kind: "free"; courtId: string; courtName: string; slot: CalendarSlot }
  | {
      kind: "booked";
      courtId: string;
      courtName: string;
      slot: CalendarSlot;
    }
  | { kind: "walkon"; courtName: string }
  | null;

export function CourtCalendarGrid({
  data,
  dayDates,
  dayRows,
  view = "day",
  viewerRole,
  viewerPersonId,
  coachOptions = [],
  compact = false,
  embedded = false,
  scrollToDate,
}: CourtCalendarGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollToDate || view !== "week") return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const target = scroller.querySelector(
      `[data-schedule-day="${scrollToDate}"]`,
    );
    target?.scrollIntoView({ inline: "start", block: "nearest" });
  }, [scrollToDate, view]);

  // Normalise inputs into a single source of truth: an array of day-rows.
  // Day view always renders a single row; week view normally has two rows
  // (Mon–Thu / Fri–Sun) but works for any partitioning.
  const rowDateLists: string[][] = useMemo(() => {
    if (dayRows && dayRows.length > 0) {
      return dayRows.filter((row) => row.length > 0);
    }
    const fallback =
      dayDates && dayDates.length > 0
        ? dayDates
        : [data.days[0]?.date].filter((x): x is string => Boolean(x));
    return fallback.length > 0 ? [fallback] : [];
  }, [dayRows, dayDates, data.days]);

  const visibleDates: string[] = useMemo(
    () => rowDateLists.flat(),
    [rowDateLists],
  );

  const dayByDate = useMemo(() => {
    const map = new Map<string, (typeof data.days)[number]>();
    for (const d of data.days) map.set(d.date, d);
    return map;
  }, [data.days]);

  const rowDays = useMemo(
    () =>
      rowDateLists.map((row) =>
        row
          .map((d) => dayByDate.get(d))
          .filter((d): d is (typeof data.days)[number] => Boolean(d)),
      ),
    [rowDateLists, dayByDate],
  );

  // Day view falls back to the first day of the first row for the header.
  const day = rowDays[0]?.[0] ?? data.days[0];
  const rowStepMin = bookingGridStepMinutes(data.settings.startTimeConstraint);
  const denseGrid = data.hours.length > 20;
  const { todayLocalDate, nowMinutes } = useMemo(() => {
    const now = new Date();
    const [h, m] = formatLocalHour(now).split(":").map(Number);
    return {
      todayLocalDate: formatLocalDate(now),
      nowMinutes: localMinutesSinceMidnight(h, m),
    };
  }, []);

  const rowStartMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return localMinutesSinceMidnight(h, m);
  };

  const slotsByCourtDayHour = useMemo(() => {
    const map = new Map<string, CalendarSlot>();
    const dateSet = new Set(visibleDates);
    for (const court of data.courts) {
      for (const slot of court.slots) {
        const dateKey = slot.startsAtLocal.slice(0, 10);
        if (dateSet.has(dateKey)) {
          map.set(`${court.id}|${slot.startsAtLocal}`, slot);
        }
      }
    }
    return map;
  }, [data, visibleDates]);

  const [selected, setSelected] = useState<SelectedSlot>(null);

  // ---- Tap-to-block (admin): multi-select free cells, then confirm. -----
  const [blockMode, setBlockMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectionDialogOpen, setSelectionDialogOpen] = useState(false);
  const [selectionPatterns, setSelectionPatterns] = useState<BlockPattern[]>(
    [],
  );
  /** Snapshot count for the confirmation dialog (selection may clear after submit). */
  const [dialogSlotCount, setDialogSlotCount] = useState(0);

  const toggleBlockKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDoneBlockSelection = () => {
    const p = groupSelectionToPatterns(selectedKeys);
    if (p.length === 0) return;
    setDialogSlotCount(selectedKeys.size);
    setSelectionPatterns(p);
    setSelectionDialogOpen(true);
  };

  const exitBlockMode = () => {
    setBlockMode(false);
    setSelectedKeys(new Set());
  };

  // Pre-compute per-court visual styling (column width + faint surface tint).
  const visualByCourtId = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getCourtVisual>>();
    for (const c of data.courts) m.set(c.id, getCourtVisual(c));
    return m;
  }, [data.courts]);

  const isWeek = view === "week";
  const useAdminWeekColumnWidths =
    compact && viewerRole === "admin" && isWeek;

  /** Stronger day separators in admin week view. */
  const adminDaySeparator =
    "border-l-[4px] border-l-[var(--border-strong)] pl-1";

  /** Per day×court column min-width when labels are long (admin week grid). */
  const columnContentMinWidth = useMemo(() => {
    if (!useAdminWeekColumnWidths) return new Map<string, string>();
    const maxLen = new Map<string, number>();
    const visible = new Set(visibleDates);
    for (const court of data.courts) {
      for (const slot of court.slots) {
        const dateKey = slot.startsAtLocal.slice(0, 10);
        if (!visible.has(dateKey)) continue;
        const colKey = `${dateKey}|${court.id}`;
        let len = 0;
        if (slot.state.kind === "class") {
          len = shortenAdminClassLabel(slot.state.label).length;
        } else if (slot.state.kind === "booked") {
          len = slot.state.bookedByName.length;
        }
        if (len > 0) {
          maxLen.set(colKey, Math.max(maxLen.get(colKey) ?? 0, len));
        }
      }
    }
    const widths = new Map<string, string>();
    for (const [key, len] of maxLen) {
      widths.set(key, contentMinWidthClass(len));
    }
    return widths;
  }, [data.courts, useAdminWeekColumnWidths, visibleDates]);

  const widthClassForColumn = (
    court: (typeof data.courts)[number],
    date: string,
  ) => {
    const base = visualByCourtId.get(court.id)?.widthClass ?? getCourtVisual(court).widthClass;
    if (!useAdminWeekColumnWidths) return base;
    const extra = columnContentMinWidth.get(`${date}|${court.id}`) ?? "";
    return mergeCourtWidthClasses(base, extra);
  };

  // Compact header label per visible day, grouped per row.
  const rowHeaders = useMemo(
    () =>
      rowDays.map((row) =>
        row.map((d) => ({
          date: d.date,
          weekday: d.weekday,
          isToday: d.date === todayLocalDate,
          // "Apr 19" style.
          short: formatShortDate(d.date),
        })),
      ),
    [rowDays, todayLocalDate],
  );

  /** Narrow vertical walk-on columns in admin + week view. */
  const showSlimWalkonColumn = isWeek || viewerRole === "admin";
  // Whole-week range label spans the first day of the first row to the
  // last day of the last row.
  const flatHeaders = useMemo(() => rowHeaders.flat(), [rowHeaders]);
  const clubTheme = useMemo(
    () => themeBySlug(data.club.slug),
    [data.club.slug],
  );
  const headerLabel = isWeek
    ? `${flatHeaders[0]?.short ?? ""} – ${flatHeaders[flatHeaders.length - 1]?.short ?? ""}`
    : day
      ? `${day.weekday}, ${formatShortDate(day.date)}`
      : "";

  return (
    <div className="space-y-3">
      {!embedded && !compact && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {headerLabel}
            </h2>
            <div className="flex items-center gap-3">
              <div className="text-xs text-[var(--muted-foreground)]">
                {data.club.name} · open{" "}
                {data.hours[0]}–{data.hours[data.hours.length - 1]}
              </div>
              {viewerRole === "admin" && (
                <div className="flex flex-wrap items-center gap-2">
                  {!blockMode ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBlockMode(true)}
                    >
                      Block off
                    </Button>
                  ) : (
                    <>
                      <span className="text-sm text-[var(--muted-foreground)]">
                        Selecting… ({selectedKeys.size})
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={exitBlockMode}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleDoneBlockSelection}
                        disabled={selectedKeys.size === 0}
                      >
                        Done
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {viewerRole === "admin" && !blockMode && (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Tip: choose Block off, then tap free cells to block them weekly until
              an end date (with optional skip dates).
            </p>
          )}
          {viewerRole === "admin" && blockMode && (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Tap free cells across any day or court, then click Done to set repeat
              until and exceptions.
            </p>
          )}
        </>
      )}
      {embedded && viewerRole === "admin" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!blockMode ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBlockMode(true)}
            >
              Block off
            </Button>
          ) : (
            <>
              <span className="text-xs text-[var(--muted-foreground)]">
                Selecting… ({selectedKeys.size})
              </span>
              <Button size="sm" variant="ghost" onClick={exitBlockMode}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDoneBlockSelection}
                disabled={selectedKeys.size === 0}
              >
                Done
              </Button>
            </>
          )}
        </div>
      )}

      {rowDays.map((days, rowIdx) => {
        const dayHeaders = rowHeaders[rowIdx] ?? [];
        // Only this table's time column lights up "now" — and only if today
        // actually appears in this stacked row.
        const todayInThisRow = days.some((d) => d.date === todayLocalDate);
        return (
          <div
            key={rowIdx}
            /*
             * Horizontal scroll-snap on the day-view court grid:
             *
             * - `snap-x snap-proximity` opts in without forcing every
             *   pixel of drag to lock onto a column — drag scrolls
             *   freely, flick snaps to the nearest court.
             * - `scroll-pl-20` (= 5rem) keeps the snap target from
             *   landing under the sticky time gutter, which is `w-20`
             *   (day view) / `w-16` (week view); 5rem is the larger of
             *   the two so neither layout buries the snapped column.
             *
             * Each court header `<th>` carries `snap-start` so the
             * left edge of any column is a valid resting point. We
             * snap on headers (not cells) because the header is the
             * natural column "anchor" — visually obvious and there's
             * exactly one per column.
             */
            className="snap-x snap-proximity overflow-x-auto rounded-md border border-[var(--border)] scroll-pl-20"
            ref={rowIdx === 0 ? scrollRef : undefined}
          >
            <table className="w-full border-collapse text-sm">
              <thead className="bg-[var(--muted)]/40 text-xs uppercase tracking-wide">
                {isWeek && (
                  <tr>
                    <th
                      rowSpan={2}
                      className="w-16 px-2 py-2 text-left align-bottom text-[var(--muted-foreground)]"
                    >
                      Time
                    </th>
                    {dayHeaders.map((dh, di) => (
                      <th
                        key={dh.date}
                        colSpan={data.courts.length}
                        data-schedule-day={dh.date}
                        className={cn(
                          "border-l-2 border-[var(--border)] px-2 py-2 text-left",
                          di === 0 && "border-l-0",
                          di > 0 &&
                            useAdminWeekColumnWidths &&
                            "border-l-[4px] border-l-[var(--border-strong)] pl-2",
                          dh.isToday &&
                            cn(
                              "border-b-2",
                              clubTheme.border,
                              clubTheme.bg,
                              clubTheme.accentText,
                            ),
                        )}
                      >
                        <div className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              "text-sm font-semibold capitalize",
                              dh.isToday && clubTheme.accentText,
                            )}
                          >
                            {dh.weekday.slice(0, 3)}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] font-normal",
                              dh.isToday
                                ? clubTheme.accentText
                                : "text-[var(--muted-foreground)]",
                            )}
                          >
                            {dh.short}
                          </span>
                          {dh.isToday && (
                            <span
                              className={cn(
                                "ml-auto text-[9px] font-semibold uppercase tracking-wide",
                                clubTheme.accentText,
                              )}
                            >
                              today
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                )}
                <tr>
                  {!isWeek && (
                    <th className="w-20 px-2 py-2 text-left text-[var(--muted-foreground)]">
                      Time
                    </th>
                  )}
                  {dayHeaders.flatMap((dh, di) =>
                    data.courts.map((c, ci) => {
                      const v = visualByCourtId.get(c.id);
                      const dayBoundary = isWeek && ci === 0 && di > 0;
                      const headerCls = cn(
                        widthClassForColumn(c, dh.date),
                        "snap-start",
                        dayBoundary
                          ? useAdminWeekColumnWidths
                            ? cn(adminDaySeparator, "px-1.5 py-2 text-left")
            : "border-l-2 border-l-[var(--border-strong)] px-1.5 py-2 text-left"
                          : "border-l border-[var(--border)] px-1.5 py-2 text-left",
                        !c.isBookable && "px-1 text-center",
                        !(useAdminWeekColumnWidths && c.isBookable) &&
                          v?.surfaceTintClass,
                        dh.isToday && clubTheme.bg,
                      );
                      if (c.isBookable) {
                        return (
                          <th
                            key={`${dh.date}|${c.id}`}
                            className={headerCls}
                            title={`${c.surface} · ${c.qualityTier}`}
                          >
                            <div className="flex items-center gap-1 truncate">
                              <span className="truncate">{c.name}</span>
                              {c.isLit && (
                                <span className="text-[10px] text-[var(--muted-foreground)]">
                                  lit
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      }
                      if (showSlimWalkonColumn) {
                        return (
                          <th
                            key={`${dh.date}|${c.id}`}
                            className={cn(
                              headerCls,
                              "px-0 py-1 text-center align-middle",
                            )}
                            title="Walk-on only"
                          >
                            <span className="inline-block max-h-[min(420px,70vh)] whitespace-nowrap text-[8px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                              walk-on · {c.name}
                            </span>
                          </th>
                        );
                      }
                      return (
                        <th
                          key={`${dh.date}|${c.id}`}
                          className={headerCls}
                          title="Walk-on only"
                        >
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-[11px]">{c.name}</span>
                            <Badge
                              variant="outline"
                              className="mt-0.5 h-4 px-1 text-[8px] uppercase"
                            >
                              walk-on
                            </Badge>
                          </div>
                        </th>
                      );
                    }),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.hours.map((hour, hourIdx) => {
                  const rowMin = rowStartMinutes(hour);
                  const isNowRow =
                    todayInThisRow &&
                    rowMin <= nowMinutes &&
                    nowMinutes < rowMin + rowStepMin;
                  const isHalfHourRow = hour.endsWith(":30");
                  const clockHour = parseInt(hour.split(":")[0], 10);
                  const isAltHourBand = clockHour % 2 === 1;
                  const isPastTimeRow =
                    todayInThisRow &&
                    rowMin + rowStepMin <= nowMinutes;
                  return (
                    <tr
                      key={hour}
                      className={cn(
                        isNowRow && todayInThisRow
                          ? "border-t-[3px] border-t-[var(--danger)]"
                          : isHalfHourRow
                            ? "border-t border-[var(--border)]/30"
                            : "border-t-2 border-[var(--border-strong)]",
                        isAltHourBand && "bg-[var(--muted)]/[0.04]",
                        isNowRow &&
                          todayInThisRow &&
                          "bg-[var(--danger-soft)]/20",
                      )}
                    >
                      <td
                        className={cn(
                          "px-2 font-mono text-xs text-[var(--muted-foreground)]",
                          denseGrid ? "py-0.5" : "py-1.5",
                          isHalfHourRow && "text-[var(--muted-foreground)]/70",
                          isPastTimeRow &&
                            "text-[var(--muted-foreground)]/50 line-through decoration-[var(--border-strong)]",
                          isNowRow && "font-semibold text-[var(--danger)]",
                        )}
                      >
                        {hour}
                      </td>
                      {days.flatMap((d, di) =>
                        data.courts.map((court, ci) => {
                          const slot = slotsByCourtDayHour.get(
                            `${court.id}|${d.date}T${hour}`,
                          );
                          const dayBoundary = isWeek && ci === 0 && di > 0;
                          const visual = visualByCourtId.get(court.id);
                          const columnWidth = widthClassForColumn(court, d.date);
                          const isToday = d.date === todayLocalDate;
                          const dimPast =
                            d.date < todayLocalDate ||
                            (isToday &&
                              rowMin + rowStepMin <= nowMinutes);
                          if (!slot) {
                            return (
                              <td
                                key={`${d.date}|${court.id}`}
                                className={cn(
                                  dayBoundary
                                    ? cn(
                                        useAdminWeekColumnWidths
                                          ? adminDaySeparator
                                              : "border-l-2 border-l-[var(--border-strong)]",
                                        isWeek || denseGrid ? "px-1 py-0.5" : "px-2 py-1.5",
                                      )
                                    : cn(
                                        "border-l border-[var(--border)]",
                                        isWeek || denseGrid ? "px-1 py-0.5" : "px-2 py-1.5",
                                      ),
                                  columnWidth,
                                  dimPast && PAST_CELL,
                                )}
                              />
                            );
                          }
                          const blockKey = `${court.id}|${d.date}|${hour}`;
                          const adminBlockMode = viewerRole === "admin" && blockMode;
                          const isBlockSelected =
                            adminBlockMode && selectedKeys.has(blockKey);
                          let continuesFromAbove = false;
                          let continuesToBelow = false;
                          if (hourIdx > 0) {
                            const prevHour = data.hours[hourIdx - 1];
                            const prev = slotsByCourtDayHour.get(
                              `${court.id}|${d.date}T${prevHour}`,
                            );
                            continuesFromAbove = slotContinuesFrom(prev, slot);
                          }
                          if (hourIdx < data.hours.length - 1) {
                            const nextHour = data.hours[hourIdx + 1];
                            const next = slotsByCourtDayHour.get(
                              `${court.id}|${d.date}T${nextHour}`,
                            );
                            continuesToBelow = slotContinuesTo(slot, next);
                          }
                          return (
                            <SlotCell
                              key={`${d.date}|${court.id}`}
                              slot={slot}
                              court={court}
                              viewerRole={viewerRole}
                              viewerPersonId={viewerPersonId}
                              adminBlockMode={adminBlockMode}
                              isBlockSelected={isBlockSelected}
                              onToggleBlockSelection={() =>
                                toggleBlockKey(blockKey)
                              }
                              showSlimWalkon={showSlimWalkonColumn}
                              continuesFromAbove={continuesFromAbove}
                              continuesToBelow={continuesToBelow}
                              dayBoundary={dayBoundary}
                              dimPast={dimPast}
                              compact={isWeek || denseGrid}
                              adminWeekStyle={useAdminWeekColumnWidths}
                              widthClass={columnWidth}
                              surfaceTintClass={
                                useAdminWeekColumnWidths
                                  ? undefined
                                  : visual?.surfaceTintClass
                              }
                              onClick={() => {
                                if (adminBlockMode) return;
                                if (dimPast) return;
                                if (
                                  slot.state.kind === "free" &&
                                  court.isBookable
                                ) {
                                  setSelected({
                                    kind: "free",
                                    courtId: court.id,
                                    courtName: court.name,
                                    slot,
                                  });
                                } else if (
                                  slot.state.kind === "free" &&
                                  !court.isBookable
                                ) {
                                  setSelected({
                                    kind: "walkon",
                                    courtName: court.name,
                                  });
                                } else if (slot.state.kind === "booked") {
                                  const hideCoachingFromMember =
                                    viewerRole === "member" &&
                                    slot.state.purpose === "coaching";
                                  if (hideCoachingFromMember) return;
                                  setSelected({
                                    kind: "booked",
                                    courtId: court.id,
                                    courtName: court.name,
                                    slot,
                                  });
                                } else if (
                                  // Heather feedback v1: coaches can book
                                  // through `members_only` recurring blocks
                                  // even though those blocks render on
                                  // their calendar as informational.
                                  slot.state.kind === "recurring_block" &&
                                  slot.state.coachCanBook &&
                                  court.isBookable
                                ) {
                                  setSelected({
                                    kind: "free",
                                    courtId: court.id,
                                    courtName: court.name,
                                    slot,
                                  });
                                }
                              }}
                            />
                          );
                        }),
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <Legend
        viewerRole={viewerRole}
        adminWeekStyle={useAdminWeekColumnWidths}
      />

      {selected?.kind === "free" && viewerRole === "admin" && (
        <AdminCreateBookingDialog
          open
          onOpenChange={() => setSelected(null)}
          courtId={selected.courtId}
          courtName={selected.courtName}
          slot={selected.slot}
          clubId={data.club.id}
          clubName={data.club.name}
          clubSlug={data.club.slug as "triaz" | "randwijck"}
          coachOptions={coachOptions}
          partnerCaptureMode={data.settings.partnerCaptureMode}
          requiresPayment={!!data.settings.requiresPayment}
          pricePerHourEur={
            data.settings.defaultPricePerHour != null
              ? Number(data.settings.defaultPricePerHour)
              : null
          }
        />
      )}
      {selected?.kind === "free" && viewerRole !== "admin" && (
        <CreateBookingDialog
          open
          onOpenChange={() => setSelected(null)}
          courtId={selected.courtId}
          courtName={selected.courtName}
          slot={selected.slot}
          clubId={data.club.id}
          clubName={data.club.name}
          clubSlug={data.club.slug as "triaz" | "randwijck"}
          partnerCaptureMode={data.settings.partnerCaptureMode}
          viewerRole={viewerRole}
          requiresPayment={!!data.settings.requiresPayment}
          pricePerHourEur={
            data.settings.defaultPricePerHour != null
              ? Number(data.settings.defaultPricePerHour)
              : null
          }
        />
      )}
      {selected?.kind === "booked" && selected.slot.state.kind === "booked" && (
        <BookingDetailDialog
          open
          onOpenChange={() => setSelected(null)}
          courtName={selected.courtName}
          slot={selected.slot}
          viewerRole={viewerRole}
          viewerPersonId={viewerPersonId}
        />
      )}
      {selected?.kind === "walkon" && (
        <WalkOnInfoDialog
          open
          onOpenChange={() => setSelected(null)}
          courtName={selected.courtName}
        />
      )}
      {viewerRole === "admin" && (
        <BlockSelectionDialog
          open={selectionDialogOpen}
          onOpenChange={setSelectionDialogOpen}
          onCompleted={exitBlockMode}
          clubId={data.club.id}
          clubName={data.club.name}
          courts={data.courts.map((c) => ({ id: c.id, name: c.name }))}
          patterns={selectionPatterns}
          selectedSlotCount={dialogSlotCount}
        />
      )}
    </div>
  );
}

/** Format "2026-04-19" → "Apr 19". */
function formatShortDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  // Use UTC to avoid timezone-shifting the date label.
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/** Add 1 hour to an "HH:MM" label, capping at "24:00". */
function addOneHour(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const next = Math.min(24, h + 1);
  return `${String(next).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Slot cell
// ---------------------------------------------------------------------------

function slotContinuesFrom(
  prev: CalendarSlot | undefined,
  slot: CalendarSlot,
): boolean {
  if (!prev) return false;
  if (slot.state.kind === "class" && prev.state.kind === "class") {
    return prev.state.classSessionId === slot.state.classSessionId;
  }
  if (
    slot.state.kind === "recurring_block" &&
    prev.state.kind === "recurring_block"
  ) {
    return prev.state.recurringBlockId === slot.state.recurringBlockId;
  }
  return false;
}

function slotContinuesTo(
  slot: CalendarSlot,
  next: CalendarSlot | undefined,
): boolean {
  if (!next) return false;
  return slotContinuesFrom(slot, next);
}

function formatSlotTimeRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(start)}–${fmt.format(end)}`;
}

// ---------------------------------------------------------------------------
// Slot cell
// ---------------------------------------------------------------------------

const BOOKABLE_SLOT_BASE =
  "block w-full select-none rounded border text-center text-[10px] uppercase tracking-wide transition-[box-shadow,background-color,border-color,opacity] duration-[var(--duration-fast)]";

const BOOKABLE_SLOT_INTERACTIVE = cn(
  "border-dashed text-[var(--muted-foreground)]",
  "hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 hover:text-[var(--foreground)]",
  "hover:shadow-[var(--shadow-elevated)] hover:ring-2 hover:ring-[var(--ring)]",
);

/** Flat dashed cells — keeps the week grid dense (no control-well lift). */
const BOOKABLE_SLOT_INTERACTIVE_COMPACT = cn(
  "border-dashed border-[var(--border)] bg-transparent text-[var(--muted-foreground)]/90",
  "hover:border-[var(--primary)]/45 hover:bg-[var(--primary)]/5 hover:text-[var(--foreground)]",
);

const BOOKABLE_SLOT_INTERACTIVE_DAY = cn(
  BOOKABLE_SLOT_INTERACTIVE,
  "control-well py-1",
);

const BOOKABLE_SLOT_PAST = cn(
  PAST_SLOT_MUTED,
  "cursor-not-allowed border-[var(--border)] bg-transparent text-[var(--muted-foreground)]/70",
);

function SlotCell({
  slot,
  court,
  viewerRole,
  viewerPersonId,
  onClick,
  adminBlockMode,
  isBlockSelected,
  onToggleBlockSelection,
  showSlimWalkon,
  continuesFromAbove,
  continuesToBelow,
  dayBoundary,
  dimPast,
  compact,
  adminWeekStyle,
  widthClass,
  surfaceTintClass,
}: {
  slot: CalendarSlot;
  court: CalendarWeek["courts"][number];
  viewerRole: ViewerRole;
  viewerPersonId: string;
  onClick: () => void;
  adminBlockMode?: boolean;
  isBlockSelected?: boolean;
  onToggleBlockSelection?: () => void;
  showSlimWalkon?: boolean;
  continuesFromAbove?: boolean;
  continuesToBelow?: boolean;
  dayBoundary?: boolean;
  dimPast?: boolean;
  compact?: boolean;
  adminWeekStyle?: boolean;
  widthClass?: string;
  surfaceTintClass?: string;
}) {
  const cellPy = compact ? "py-0.5" : "py-1.5";
  const cellPx = compact ? "px-1" : "px-2";
  const adminDaySep =
    "border-l-[4px] border-l-[var(--border-strong)] pl-0.5";
  const bookableInteractive = compact
    ? cn(BOOKABLE_SLOT_INTERACTIVE_COMPACT, "py-0.5")
    : BOOKABLE_SLOT_INTERACTIVE_DAY;
  const baseCell = cn(
    dayBoundary
      ? adminWeekStyle
        ? `${adminDaySep} ${cellPx} ${cellPy} text-xs leading-tight`
        : `border-l-2 border-l-[var(--border-strong)] ${cellPx} ${cellPy} text-xs leading-tight`
      : `border-l border-[var(--border)] ${cellPx} ${cellPy} text-xs leading-tight`,
    widthClass,
    dimPast && PAST_CELL,
  );
  const reservedCls = memberReservedSlotClasses();
  const bookableButtonCls = cn(
    BOOKABLE_SLOT_BASE,
    dimPast ? cn(BOOKABLE_SLOT_PAST, "py-0.5") : bookableInteractive,
  );
  const bookedButtonHover =
    "transition-[box-shadow,opacity] duration-[var(--duration-fast)] hover:opacity-90 hover:ring-2 hover:ring-[var(--ring)] hover:shadow-[var(--shadow-sm)]";

  switch (slot.state.kind) {
    case "free":
      if (!court.isBookable) {
        return (
          <td
            className={cn(
              dayBoundary
                ? "border-l-2 border-l-[var(--border-strong)] p-0"
                : "border-l border-[var(--border)] p-0",
              widthClass,
              dimPast && PAST_CELL,
              !dimPast &&
                "bg-[repeating-linear-gradient(45deg,_transparent,_transparent_4px,_var(--muted)_4px,_var(--muted)_8px)]",
              dimPast && "bg-[var(--muted)]/35",
            )}
          >
            <button
              type="button"
              onClick={onClick}
              disabled={adminBlockMode || dimPast}
              className={cn(
                "block h-full w-full text-[var(--muted-foreground)] transition-colors duration-[var(--duration-fast)]",
                !dimPast &&
                  "hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]",
                dimPast && "cursor-not-allowed text-[var(--muted-foreground)]/70",
                showSlimWalkon
                  ? "px-0 py-1"
                  : "px-1 py-1.5 text-center text-[10px] uppercase tracking-wide",
              )}
              title={
                adminBlockMode
                  ? "Not selectable — walk-on only"
                  : dimPast
                    ? "Past slot"
                    : "Walk-on rules"
              }
            >
              {showSlimWalkon ? (
                <span className="inline-block max-h-[min(380px,65vh)] whitespace-nowrap text-[7px] font-semibold uppercase tracking-widest [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                  walk-on
                </span>
              ) : (
                "walk-on"
              )}
            </button>
          </td>
        );
      }
      if (adminBlockMode) {
        return (
          <td className={cn(baseCell, surfaceTintClass)}>
            <button
              type="button"
              onClick={() => {
                if (dimPast) return;
                onToggleBlockSelection?.();
              }}
              disabled={dimPast}
              className={cn(
                BOOKABLE_SLOT_BASE,
                dimPast
                  ? cn(BOOKABLE_SLOT_PAST, "py-0.5")
                  : cn(
                      bookableInteractive,
                      isBlockSelected &&
                        "border-solid border-[var(--warning)] bg-[var(--warning-soft)]/60 text-[var(--warning-ink)] hover:ring-[var(--warning)]/40",
                    ),
              )}
              title={dimPast ? "Past slot" : "Tap to select for block"}
            >
              {isBlockSelected ? "selected" : compact ? "+" : "select"}
            </button>
          </td>
        );
      }
      return (
        <td className={cn(baseCell, !dimPast && surfaceTintClass)}>
          <button
            type="button"
            onClick={onClick}
            disabled={dimPast}
            className={bookableButtonCls}
            title={dimPast ? "Past slot" : undefined}
          >
            {dimPast ? "—" : compact ? "+" : "book"}
          </button>
        </td>
      );

    case "booked": {
      if (viewerRole === "member" && slot.state.purpose === "coaching") {
        return (
          <td className={baseCell}>
            <div
              className={cn(
                "block w-full rounded px-1 py-0.5 text-left text-[11px]",
                reservedCls,
                dimPast && PAST_SLOT_MUTED,
              )}
              title="Reserved"
            >
              <div className="truncate font-medium">Reserved</div>
            </div>
          </td>
        );
      }
      const isOwn = slot.state.bookedByPersonId === viewerPersonId;
      const bookingArgs = {
        purpose: slot.state.purpose,
        status: slot.state.status,
        isOwn,
      };
      const cls =
        adminWeekStyle && viewerRole === "admin"
          ? adminCompactBookingSlotClasses(bookingArgs)
          : bookingSlotColorClasses(bookingArgs);
      const fullName = slot.state.bookedByName || "—";
      // In compact (week) mode use just the first name to fit in narrow cols.
      const displayName = compact ? fullName.split(" ")[0] : fullName;
      return (
        <td className={baseCell}>
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "block w-full rounded border px-1 py-0.5 text-left text-[11px]",
              cls,
              dimPast && PAST_SLOT_MUTED,
              !dimPast && bookedButtonHover,
            )}
            title={[
              `${fullName} (${slot.state.purpose})`,
              slot.state.partnerNames.length > 0
                ? `with ${slot.state.partnerNames.join(", ")}`
                : null,
            ]
              .filter(Boolean)
              .join(" — ")}
          >
            <div className="truncate font-medium">{displayName}</div>
            {!compact && (
              <div className="text-[9px] uppercase tracking-wide opacity-75">
                {slot.state.purpose}
                {slot.state.status === "cancellation_requested"
                  ? " · pending"
                  : ""}
              </div>
            )}
          </button>
        </td>
      );
    }

    case "class": {
      const memberLabel = viewerRole === "member" ? "Reserved" : slot.state.label;
      const memberTitle = viewerRole === "member" ? "Reserved" : slot.state.label;
      const deliveryArgs = {
        deliveryMode: slot.state.deliveryMode,
        classType: slot.state.classType,
      };
      const useAdminCompactStyle = adminWeekStyle && viewerRole === "admin";
      const cls =
        viewerRole === "member"
          ? reservedCls
          : useAdminCompactStyle
            ? adminCompactClassSlotClasses(deliveryArgs)
            : classSlotColorClasses(deliveryArgs);
      const mergeBorder = useAdminCompactStyle
        ? adminCompactClassMergeBorderClasses({
            continuesFromAbove,
            continuesToBelow,
          })
        : classSlotMergeBorderClasses({
            ...deliveryArgs,
            continuesFromAbove,
            continuesToBelow,
            isMember: viewerRole === "member",
          });
      const category =
        viewerRole === "admin"
          ? scheduleClassCategoryLabel(deliveryArgs)
          : "class";
      const adminCompact = compact && viewerRole === "admin";
      const showBlockLabel = !continuesFromAbove;
      const sessionTimeRange = formatSlotTimeRange(
        slot.state.sessionStartsAtUtc,
        slot.state.sessionEndsAtUtc,
      );
      return (
        <td
          className={cn(
            baseCell,
            cls,
            mergeBorder,
            continuesFromAbove && "pt-0",
            continuesToBelow && "pb-0",
            dimPast && PAST_SLOT_MUTED,
          )}
          title={memberTitle}
        >
          {showBlockLabel &&
            (adminCompact ? (
              <div className="truncate text-[10px] leading-tight">
                <span className="font-semibold tabular-nums">
                  {sessionTimeRange}
                </span>
                <span className="text-[var(--muted-foreground)]"> · </span>
                {shortenAdminClassLabel(memberLabel)}
              </div>
            ) : (
              <>
                <div className="truncate text-[11px] font-medium">
                  {memberLabel}
                </div>
                {!compact && (
                  <div className="text-[9px] uppercase tracking-wide opacity-75">
                    {category}
                  </div>
                )}
              </>
            ))}
        </td>
      );
    }

    case "recurring_block": {
      const blockLabel =
        viewerRole === "member" ? "Blocked" : slot.state.label;
      const blockTitle =
        viewerRole === "member"
          ? "Blocked"
          : slot.state.coachCanBook
            ? `${slot.state.label} (members only — you can still book here)`
            : slot.state.label;
      // Heather feedback v1: members_only blocks render as informational
      // for coaches/admins — striped instead of solid, and the cell
      // remains clickable so they can still book on top.
      const isInfoOnly = slot.state.coachCanBook;
      return (
        <td
          className={cn(
            baseCell,
            isInfoOnly
              ? "bg-stone-100 text-stone-600"
              : "bg-stone-200 text-stone-700",
            dimPast && PAST_SLOT_MUTED,
            continuesFromAbove &&
              (isInfoOnly ? "border-t-stone-100" : "border-t-stone-200"),
            continuesToBelow &&
              (isInfoOnly ? "border-b-stone-100" : "border-b-stone-200"),
            continuesFromAbove && "pt-0",
            continuesToBelow && "pb-0",
            isInfoOnly && "cursor-pointer hover:bg-stone-50",
          )}
          title={blockTitle}
          onClick={() => {
            if (!isInfoOnly) return;
            if (!court.isBookable) {
              onClick();
              return;
            }
            onClick();
          }}
        >
          {!continuesFromAbove && (
            <>
              <div className="truncate text-[11px] font-medium">
                {blockLabel}
              </div>
              {!compact && (
                <div className="text-[9px] uppercase tracking-wide opacity-75">
                  {isInfoOnly ? "members only" : "blocked"}
                </div>
              )}
            </>
          )}
        </td>
      );
    }

    case "outside_hours":
      return <td className={cn(baseCell, "bg-[var(--muted)]/40")} />;
  }
}

// ---------------------------------------------------------------------------
// Create-booking dialog
// ---------------------------------------------------------------------------

function CreateBookingDialog({
  open,
  onOpenChange,
  courtId,
  courtName,
  slot,
  clubId,
  clubName,
  clubSlug,
  partnerCaptureMode,
  viewerRole,
  requiresPayment,
  pricePerHourEur,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtId: string;
  courtName: string;
  slot: CalendarSlot;
  clubId: string;
  clubName: string;
  clubSlug: "triaz" | "randwijck";
  partnerCaptureMode: BookingPartnerCaptureMode;
  viewerRole: ViewerRole;
  /** True when the club's `BookingSettings.requiresPayment` is set (e.g. Randwijck). */
  requiresPayment: boolean;
  /** Hourly rate from `BookingSettings.defaultPricePerHour`, in euros. */
  pricePerHourEur: number | null;
}) {
  const router = useRouter();
  const t = useTerms();
  const [checkoutPending, startCheckout] = useTransition();
  const { run, pending: createPending, error } = useActionFeedback({
    success: "Court booked",
    successDescription: `${courtName} · ${clubName}`,
    onSuccess: () => onOpenChange(false),
  });
  const isPending = checkoutPending || createPending;
  const [purpose] = useState<"personal" | "coaching">(
    viewerRole === "coach" ? "coaching" : "personal",
  );
  const [partyEntries, setPartyEntries] = useState<PartyEntry[]>([]);
  const [notes, setNotes] = useState("");
  // Coaching-only duration override. Members and personal bookings always
  // use the club default (60 min at Randwijck / Zwette today).
  const [durationMinutes, setDurationMinutes] = useState<30 | 45 | 60>(60);
  const [recurringOpen, setRecurringOpen] = useState(false);

  // Coaching bookings cap at 2 invitees (3 starts to compete with our
  // structured class business). Personal/doubles caps at 3.
  const partyMax = purpose === "coaching" ? 2 : 3;
  const partyLabel =
    purpose === "coaching" ? t.student.singular : "Partner";
  const canPickDuration = viewerRole === "coach" && purpose === "coaching";
  const effectiveDuration = canPickDuration ? durationMinutes : 60;
  const memberPartnerLookup =
    partnerCaptureMode === "fk_member" && purpose === "personal";

  const willChargeMember =
    requiresPayment &&
    viewerRole === "member" &&
    purpose !== "coaching" &&
    pricePerHourEur != null;
  const priceDueEur = willChargeMember
    ? Math.round(((pricePerHourEur as number) * effectiveDuration) / 60 * 100) / 100
    : 0;

  const handleSubmit = () => {
    const partnerList = partyEntries.map((entry) => ({
      partnerName: entry.partnerName,
      personId: entry.personId,
    }));
    const bookingInput = {
      courtId,
      startsAtUtc: slot.startsAtUtc.toISOString(),
      needsLights: false,
      purpose,
      durationMinutes: canPickDuration ? durationMinutes : undefined,
      notes: notes.trim() || undefined,
      partners: partnerList,
    };

    if (willChargeMember && priceDueEur > 0) {
      onOpenChange(false);
      startCheckout(() => {
        void beginCheckout(
          {
            amountEur: priceDueEur,
            description: `${courtName} · ${clubName} · ${slot.startsAtLocal.replace("T", " ")}`,
            returnUrl: portalPurchaseSuccessUrl({
              kind: "booking",
              next: "/portal/bookings",
              amountEur: priceDueEur,
            }),
            action: {
              kind: "court_booking_create",
              payload: bookingInput,
            },
          },
          router,
        );
      });
      return;
    }

    run(() => createBooking(bookingInput));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book {courtName}</DialogTitle>
          <DialogDescription>
            {clubName} · {slot.startsAtLocal.replace("T", " ")} ·{" "}
            {effectiveDuration === 60
              ? "1 hour"
              : `${effectiveDuration} min`}
            {viewerRole === "member" && (
              <>
                {" "}
                · Books under your account — add partners if someone else is
                playing with you.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {viewerRole === "coach" && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Book a {t.privateLesson.singular.toLowerCase()} on this court.
            </p>
          )}

          {canPickDuration && (
            <div className="space-y-1">
              <Label>Duration</Label>
              <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
                {([30, 45, 60] as const).map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMinutes(mins)}
                    className={cn(
                      "px-3 py-1.5 text-sm transition-colors",
                      "border-l border-[var(--border)] first:border-l-0",
                      durationMinutes === mins
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]/60",
                    )}
                    aria-pressed={durationMinutes === mins}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Private-lesson slot length. Grid cells stay 60 min; your
                booking will be {durationMinutes} minutes long.
              </p>
            </div>
          )}

          <PartyInput
            value={partyEntries}
            onChange={setPartyEntries}
            label={partyLabel}
            max={partyMax}
            lookup={
              memberPartnerLookup
                ? async (q) => {
                    const res = await searchClubMembers({
                      clubSlug,
                      query: q,
                    });
                    return res.ok ? res.candidates : [];
                  }
                : undefined
            }
            membersOnly={memberPartnerLookup}
          />

          <div className="flex items-center justify-between gap-3">
            {canPickDuration && (
              <button
                type="button"
                onClick={() => setRecurringOpen(true)}
                className="text-xs text-[var(--accent)] underline underline-offset-2 hover:opacity-80"
              >
                Make this recurring →
              </button>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending
              ? "Booking..."
              : willChargeMember && priceDueEur > 0
                ? `Continue to payment · €${priceDueEur.toFixed(2)}`
                : "Confirm booking"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {recurringOpen && (
        <RecurringCoachLessonDialog
          open={recurringOpen}
          onOpenChange={setRecurringOpen}
          courtId={courtId}
          courtName={courtName}
          clubId={clubId}
          clubName={clubName}
          slotLocalDate={slot.startsAtLocal.slice(0, 10)}
          slotLocalStart={slot.startsAtLocal.slice(11, 16)}
          initialDurationMinutes={durationMinutes}
          onCreated={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Booking detail dialog (cancel / request deletion)
// ---------------------------------------------------------------------------

function BookingDetailDialog({
  open,
  onOpenChange,
  courtName,
  slot,
  viewerRole,
  viewerPersonId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtName: string;
  slot: CalendarSlot;
  viewerRole: ViewerRole;
  viewerPersonId: string;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const cancel = useActionFeedback({
    success: "Booking cancelled",
    successDescription: `${courtName} · ${slot.startsAtLocal.replace("T", " ")}`,
    onSuccess: () => onOpenChange(false),
  });
  const request = useActionFeedback({
    success: "Cancellation requested",
    successDescription: "An admin will review and either approve or push back.",
    onSuccess: () => onOpenChange(false),
  });
  const isPending = cancel.pending || request.pending;
  const error = localError ?? cancel.error ?? request.error;
  const t = useTerms();

  if (slot.state.kind !== "booked") return null;
  // Members normally can't peek into coaching slots, but they should see a
  // read-only explanation when a cancellation request is pending — that
  // slot may turn back into bookable time and the office wants the
  // explanation visible, not buried in an opaque grid block.
  if (viewerRole === "member" && slot.state.purpose === "coaching") {
    if (slot.state.status === "cancellation_requested") {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Coaching slot · pending review</DialogTitle>
              <DialogDescription>
                {slot.startsAtLocal.replace("T", " ")} · {courtName}
              </DialogDescription>
            </DialogHeader>
            <p className="rounded-md bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning-ink)]">
              {slot.state.bookedByName} asked the office to cancel this
              coaching session.
              {slot.state.cancellationReason
                ? ` Reason: ${slot.state.cancellationReason}`
                : ""}{" "}
              We&apos;ll release the slot if it&apos;s approved.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    return null;
  }
  const isOwn = slot.state.bookedByPersonId === viewerPersonId;
  const isCoachingByOwner =
    isOwn && slot.state.purpose === "coaching" && viewerRole === "coach";
  const canImmediatelyCancel =
    viewerRole === "admin" || (isOwn && !isCoachingByOwner);

  const handleCancel = () => {
    setLocalError(null);
    cancel.run(() =>
      cancelBooking({
        bookingId: slot.state.kind === "booked" ? slot.state.bookingId : "",
        reason: reason.trim() || undefined,
      }),
    );
  };

  const handleRequestDeletion = () => {
    setLocalError(null);
    if (reason.trim().length < 5) {
      setLocalError("Please give a reason of at least 5 characters.");
      return;
    }
    request.run(() =>
      requestBookingCancellation({
        bookingId: slot.state.kind === "booked" ? slot.state.bookingId : "",
        reason: reason.trim(),
      }),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Booking on {courtName}</DialogTitle>
          <DialogDescription>
            {slot.startsAtLocal.replace("T", " ")}
            {viewerRole === "admin" ? (
              <>
                {" "}
                · Booked by {slot.state.bookedByName}
                {slot.state.purpose === "coaching"
                  ? ` · ${t.privateLesson.singular}`
                  : " · Personal play"}
              </>
            ) : (
              <>
                {" "}
                · booked by {slot.state.bookedByName} ({slot.state.purpose})
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {slot.state.partnerNames.length > 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {slot.state.purpose === "coaching"
              ? t.student.singular
              : "Playing with"}
            {slot.state.partnerNames.length > 1 ? "s" : ""}:{" "}
            <span className="text-[var(--foreground)]">
              {slot.state.partnerNames.join(", ")}
            </span>
          </p>
        )}

        {slot.state.status === "cancellation_requested" && (
          <p className="rounded-md bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning-ink)]">
            Awaiting admin decision on the deletion request.
          </p>
        )}

        {(canImmediatelyCancel || isCoachingByOwner) && (
          <div className="space-y-1">
            <Label htmlFor="reason">
              {isCoachingByOwner
                ? "Why are you requesting deletion? (admin will review)"
                : "Reason (optional)"}
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        )}

        {error && (
          <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Close
          </Button>
          {canImmediatelyCancel && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending ? "Cancelling..." : "Cancel booking"}
            </Button>
          )}
          {isCoachingByOwner && (
            <Button onClick={handleRequestDeletion} disabled={isPending}>
              {isPending ? "Sending..." : "Request deletion"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Walk-on info dialog
// ---------------------------------------------------------------------------

function WalkOnInfoDialog({
  open,
  onOpenChange,
  courtName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{courtName} · walk-on only</DialogTitle>
          <DialogDescription>
            This court is never bookable in advance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            If the court is empty, just walk on — you have it for{" "}
            <strong>1 hour</strong> from the moment you start playing.
          </p>
          <p>
            If someone is already on it, sit by the court and wait. The
            current players keep it until the end of their hour, then it&apos;s
            yours for the next hour.
          </p>
          <p className="text-[var(--muted-foreground)]">
            No reservations, no app, no payment — first come, next on.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend({
  viewerRole,
  adminWeekStyle,
}: {
  viewerRole: ViewerRole;
  adminWeekStyle?: boolean;
}) {
  if (viewerRole === "member") {
    return (
      <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
        <LegendChip className="border-dashed" label="Available" />
        <LegendChip
          className="border-[var(--success)]/50 bg-[var(--success-soft)] text-[var(--success-ink)]"
          label="Your booking"
        />
        <LegendChip
          className="border-[var(--delivery-onsite)]/50 bg-[var(--delivery-onsite-soft)] text-[var(--delivery-onsite-ink)]"
          label="Other member"
        />
        <LegendChip
          className="border-[var(--border-strong)] bg-[var(--surface-strong)] text-[var(--muted-foreground)]"
          label="Reserved"
        />
      </div>
    );
  }
  if (adminWeekStyle) {
    return (
      <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
        <LegendChip className="border-dashed" label="Available" />
        <LegendChip
          className={adminCompactLegendAccent("success")}
          label="Your booking"
        />
        <LegendChip
          className={adminCompactLegendAccent("onsite")}
          label="Other member"
        />
        <LegendChip
          className={adminCompactLegendAccent("private")}
          label="Private lesson"
        />
        <LegendChip
          className={adminCompactLegendAccent("warning")}
          label="Deletion pending"
        />
        <LegendChip
          className={adminCompactLegendAccent("at_club")}
          label="At club lesson"
        />
        <LegendChip
          className={adminCompactLegendAccent("pickup")}
          label="Pickup lesson"
        />
        <LegendChip
          className="border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted-foreground)]"
          label="Blocked"
        />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
      <LegendChip className="border-dashed" label="Available" />
      <LegendChip
        className="border-[var(--success)]/50 bg-[var(--success-soft)] text-[var(--success-ink)]"
        label="Your booking"
      />
      <LegendChip
        className="border-[var(--delivery-onsite)]/50 bg-[var(--delivery-onsite-soft)] text-[var(--delivery-onsite-ink)]"
        label="Other member"
      />
      <LegendChip
        className="border-[var(--border-strong)] bg-[var(--surface-strong)] text-[var(--muted-foreground)]"
        label="Reserved"
      />
      <LegendChip
        className="border-[var(--delivery-private)]/50 bg-[var(--delivery-private-soft)] text-[var(--delivery-private-ink)]"
        label="Private lesson"
      />
      <LegendChip
        className="border-[var(--warning)]/50 bg-[var(--warning-soft)] text-[var(--warning-ink)]"
        label="Deletion pending"
      />
      <LegendChip
        className="border-[var(--delivery-at-club)]/50 bg-[var(--delivery-at-club-soft)] text-[var(--delivery-at-club-ink)]"
        label="At club lesson"
      />
      <LegendChip
        className="border-[var(--delivery-pickup)]/50 bg-[var(--delivery-pickup-soft)] text-[var(--delivery-pickup-ink)]"
        label="Pickup lesson"
      />
      <LegendChip className="bg-[var(--surface-strong)] text-[var(--muted-foreground)]" label="Blocked" />
    </div>
  );
}

function LegendChip({
  className,
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "rounded border border-[var(--border)] px-1.5 py-0.5",
        className,
      )}
    >
      {label}
    </span>
  );
}
