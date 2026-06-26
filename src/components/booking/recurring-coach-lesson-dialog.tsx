"use client";

/**
 * Dialog for a coach to turn a one-off private-lesson slot into a recurring
 * series. Pre-fills day/time/court from whatever slot the coach clicked on
 * the court calendar. The coach picks:
 *
 *  - duration (30 / 45 / 60 min, inherited from the confirm dialog)
 *  - description shown on the calendar (usually the student name)
 *  - start date (defaults to the clicked slot's date)
 *  - end date (defaults to +12 weeks, but can be shortened)
 *
 * Submit flow:
 *
 *   1. Click "Request series".
 *   2. Dialog calls `previewRecurringBlockConflicts` to enumerate every
 *      occurrence and find existing bookings/classes/blocks on those slots.
 *   3a. No clashes  -> immediately calls `createRecurringCoachBlock` (pending).
 *   3b. Has clashes -> swap to a clash list. Coach can either:
 *        - "Request anyway, skipping these dates" — submits with the clash
 *          dates pushed into `excludedDates`.
 *        - "Pick different day/time" — back to the form.
 *
 * The created row lands in `status: 'pending'` and waits for an admin to
 * approve via /admin/blocks/requests.
 */

import { useMemo, useState, useTransition } from "react";
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
import { DateRangeField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createRecurringCoachBlock,
  previewRecurringBlockConflicts,
} from "@/lib/booking/actions";
import type { RecurringConflictDate } from "@/lib/booking/recurring";
import { toast } from "@/lib/feedback";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export interface RecurringCoachLessonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtId: string;
  courtName: string;
  clubId: string;
  clubName: string;
  /** YYYY-MM-DD of the slot the coach clicked. */
  slotLocalDate: string;
  /** "HH:MM" — the local start time of the clicked slot. */
  slotLocalStart: string;
  initialDurationMinutes: 30 | 45 | 60;
  /** Called after a successful create so the parent dialog can close. */
  onCreated?: () => void;
}

type ViewMode = "form" | "clashes";

export function RecurringCoachLessonDialog({
  open,
  onOpenChange,
  courtId,
  courtName,
  clubId,
  clubName,
  slotLocalDate,
  slotLocalStart,
  initialDurationMinutes,
  onCreated,
}: RecurringCoachLessonDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("form");
  const [clashes, setClashes] = useState<RecurringConflictDate[]>([]);
  const [occurrenceCount, setOccurrenceCount] = useState(0);

  const slotDayOfWeek = useMemo<DayOfWeek>(
    () => dayOfWeekFor(slotLocalDate),
    [slotLocalDate],
  );
  const defaultEndsOn = useMemo(
    () => addDaysIso(slotLocalDate, 7 * 12),
    [slotLocalDate],
  );

  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<30 | 45 | 60>(initialDurationMinutes);
  const [startsOn, setStartsOn] = useState(slotLocalDate);
  const [endsOn, setEndsOn] = useState(defaultEndsOn);

  const reset = () => {
    setError(null);
    setView("form");
    setClashes([]);
    setOccurrenceCount(0);
  };

  const closeDialog = () => {
    reset();
    onOpenChange(false);
  };

  const handleRequestClick = () => {
    setError(null);
    if (description.trim().length < 3) {
      setError("Give the series a short name (student name works well).");
      return;
    }
    startTransition(async () => {
      const previewRes = await previewRecurringBlockConflicts({
        courtId,
        clubId,
        dayOfWeek: slotDayOfWeek,
        startTimeLocal: slotLocalStart,
        durationMinutes: duration,
        startsOn,
        endsOn,
        description: description.trim(),
      });
      if (!previewRes.ok) {
        setError(previewRes.error);
        return;
      }
      setOccurrenceCount(previewRes.occurrenceCount);
      if (previewRes.clashes.length === 0) {
        await submitRequest([]);
        return;
      }
      setClashes(previewRes.clashes);
      setView("clashes");
    });
  };

  const submitRequest = async (excludedDates: string[]) => {
    setError(null);
    const res = await createRecurringCoachBlock({
      courtId,
      clubId,
      dayOfWeek: slotDayOfWeek,
      startTimeLocal: slotLocalStart,
      durationMinutes: duration,
      startsOn,
      endsOn,
      description: description.trim(),
      excludedDates,
    });
    if (!res.ok) {
      // The server action also re-runs the scan; if a clash slipped in
      // between preview and submit it'll come back here.
      if (res.conflicts && res.conflicts.length > 0) {
        setClashes(res.conflicts);
        setView("clashes");
      }
      setError(res.error);
      toast.error("Couldn't request lesson series", { description: res.error });
      return;
    }
    toast.success("Lesson series sent for review", {
      description: "Admin will get back to you with a yes or no shortly.",
    });
    onCreated?.();
    router.refresh();
    closeDialog();
  };

  const handleSkipAndSubmit = () => {
    startTransition(async () => {
      await submitRequest(clashes.map((c) => c.date));
    });
  };

  const handleBackToForm = () => {
    setView("form");
    setClashes([]);
    setError(null);
  };

  const remainingAfterSkip = Math.max(0, occurrenceCount - clashes.length);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {view === "clashes"
              ? "Heads up — clashes on these dates"
              : "Recurring private lesson"}
          </DialogTitle>
          <DialogDescription>
            {courtName} · {clubName} · every {DAY_LABEL[slotDayOfWeek]} at{" "}
            {slotLocalStart}
          </DialogDescription>
        </DialogHeader>

        {view === "form" && (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--warning-ink)]">
              <strong className="font-semibold">Goes through admin first.</strong>{" "}
              Recurring lessons are submitted as requests. Admin reviews each
              one (in case the club is planning a class on that day) and may
              decline with a note. You'll get an email either way.
            </div>

            <div className="space-y-1">
              <Label htmlFor="recurring-description">Series name</Label>
              <Input
                id="recurring-description"
                placeholder="e.g. Private lesson with Rick"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className="space-y-1">
              <Label>Duration</Label>
              <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
                {([30, 45, 60] as const).map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDuration(mins)}
                    className={cn(
                      "px-3 py-1.5 text-sm transition-colors",
                      "border-l border-[var(--border)] first:border-l-0",
                      duration === mins
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]/60",
                    )}
                    aria-pressed={duration === mins}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
            </div>

            <DateRangeField
              startLabel="Starts on"
              endLabel="Ends on"
              startId="recurring-starts-on"
              endId="recurring-ends-on"
              startValue={startsOn}
              endValue={endsOn}
              onChange={({ start, end }) => {
                setStartsOn(start);
                setEndsOn(end);
              }}
              mode="any"
              locale="en-NL"
              className="gap-3"
            />

            {error && (
              <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
                {error}
              </p>
            )}
          </div>
        )}

        {view === "clashes" && (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--warning-ink)]">
              {clashes.length} of {occurrenceCount} date(s) already have
              something else on this court at {slotLocalStart}. You can submit
              the request anyway — those dates will be skipped — or go back
              and pick a different day or time.
            </div>

            <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--border)] divide-y divide-[var(--border)]">
              {clashes.map((c) => (
                <div key={c.date} className="px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{formatDateLong(c.date)}</span>
                    <span className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      will be skipped
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--muted-foreground)]">
                    {c.conflicts.map((d, i) => (
                      <li key={i}>
                        <span className="font-medium text-[var(--foreground)]">
                          {d.label}
                        </span>
                        {d.byName ? ` · ${d.byName}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="text-xs text-[var(--muted-foreground)]">
              {remainingAfterSkip} occurrence(s) will be requested if you
              continue.
            </p>

            {error && (
              <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {view === "form" && (
            <>
              <Button
                variant="outline"
                onClick={closeDialog}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleRequestClick} disabled={isPending}>
                {isPending ? "Checking..." : "Request series"}
              </Button>
            </>
          )}
          {view === "clashes" && (
            <>
              <Button
                variant="outline"
                onClick={handleBackToForm}
                disabled={isPending}
              >
                Pick different day/time
              </Button>
              <Button
                onClick={handleSkipAndSubmit}
                disabled={isPending || remainingAfterSkip === 0}
              >
                {isPending
                  ? "Submitting..."
                  : `Request ${remainingAfterSkip} date(s), skip clashes`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "YYYY-MM-DD" → mon/tue/... (UTC math — date-only strings are timezone-free).
function dayOfWeekFor(iso: string): DayOfWeek {
  const [y, m, d] = iso.split("-").map(Number);
  const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun=0..Sat=6
  const map: Record<number, DayOfWeek> = {
    0: "sun",
    1: "mon",
    2: "tue",
    3: "wed",
    4: "thu",
    5: "fri",
    6: "sat",
  };
  return map[jsDow];
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60_000;
  const next = new Date(t);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
