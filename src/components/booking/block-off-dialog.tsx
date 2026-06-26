"use client";

/**
 * Admin "Block off slots" dialog.
 *
 * Used both from the calendar header button (no presets) and from the
 * drag-to-select gesture on the calendar grid (pre-fills court + dates +
 * time range). On submit it calls the createBlock server action which
 * persists one RecurringBlock row per (court x weekday) combination.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createBlock, type BlockConflictGroup } from "@/app/admin/blocks/actions";
import { toast } from "@/lib/feedback";

type Dow = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAYS: { id: Dow; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

export interface BlockOffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  clubName: string;
  courts: { id: string; name: string; isBookable: boolean }[];
  /** Optional preset from drag selection. */
  initial?: {
    courtIds?: string[];
    startDate?: string; // YYYY-MM-DD
    endDate?: string;
    startTime?: string; // HH:MM
    endTime?: string;
    daysOfWeek?: Dow[];
  };
}

function todayLocalISO() {
  const d = new Date();
  // Format in local time (Amsterdam) so the picker matches what the admin sees.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA gives YYYY-MM-DD
}

function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function dowOfISO(iso: string): Dow {
  const [y, m, d] = iso.split("-").map(Number);
  // Use UTC to avoid local DST surprises; only weekday is needed.
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][wd] as Dow;
}

function countDates(startISO: string, endISO: string, days: Set<Dow> | null) {
  let total = 0;
  let cur = startISO;
  while (cur <= endISO) {
    if (!days || days.has(dowOfISO(cur))) total++;
    cur = addDaysISO(cur, 1);
  }
  return total;
}

function diffHours(startHHMM: string, endHHMM: string) {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  return Math.max(0, (eh + em / 60) - (sh + sm / 60));
}

export function BlockOffDialog({
  open,
  onOpenChange,
  clubId,
  clubName,
  courts,
  initial,
}: BlockOffDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<BlockConflictGroup[] | null>(null);

  const bookableCourts = useMemo(
    () => courts.filter((c) => c.isBookable),
    [courts],
  );

  const today = useMemo(todayLocalISO, []);
  const [courtIds, setCourtIds] = useState<string[]>(initial?.courtIds ?? []);
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [endDate, setEndDate] = useState(
    initial?.endDate ?? addDaysISO(today, 30),
  );
  const [startTime, setStartTime] = useState(initial?.startTime ?? "17:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "21:00");
  const [days, setDays] = useState<Set<Dow>>(
    new Set(initial?.daysOfWeek ?? []),
  );
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  // Reset state whenever the dialog re-opens with new presets.
  useEffect(() => {
    if (!open) return;
    setCourtIds(initial?.courtIds ?? []);
    setStartDate(initial?.startDate ?? today);
    setEndDate(initial?.endDate ?? addDaysISO(today, 30));
    setStartTime(initial?.startTime ?? "17:00");
    setEndTime(initial?.endTime ?? "21:00");
    setDays(new Set(initial?.daysOfWeek ?? []));
    setLabel("");
    setNotes("");
    setError(null);
    setConflicts(null);
    // Intentionally only re-run when the dialog (re)opens with a new initial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const toggleCourt = (id: string) =>
    setCourtIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleDay = (id: Dow) =>
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const validRange =
    startDate <= endDate &&
    startTime < endTime &&
    courtIds.length > 0 &&
    label.trim().length > 0;

  const summary = useMemo(() => {
    if (!validRange) return null;
    const dateCount = countDates(
      startDate,
      endDate,
      days.size === 0 ? null : days,
    );
    const hoursPerOccurrence = diffHours(startTime, endTime);
    const totalHours = courtIds.length * dateCount * hoursPerOccurrence;
    return {
      dateCount,
      hoursPerOccurrence,
      totalHours,
    };
  }, [validRange, startDate, endDate, days, startTime, endTime, courtIds]);

  const handleSubmit = (acknowledgeConflicts = false) => {
    setError(null);
    if (!acknowledgeConflicts) setConflicts(null);
    startTransition(async () => {
      const res = await createBlock({
        clubId,
        courtIds,
        startDate,
        endDate,
        startTime,
        endTime,
        daysOfWeek: Array.from(days),
        label: label.trim(),
        notes: notes.trim() || undefined,
        acknowledgeConflicts,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.conflicts && res.conflicts.length > 0) {
          setConflicts(res.conflicts);
        }
        toast.error("Couldn't block off slots", { description: res.error });
        return;
      }
      toast.success("Slots blocked off", {
        description: summary
          ? `${courtIds.length} court${courtIds.length === 1 ? "" : "s"} · ${summary.totalHours} court-hour${summary.totalHours === 1 ? "" : "s"}`
          : undefined,
      });
      onOpenChange(false);
      router.refresh();
    });
  };

  const totalClashCount = useMemo(
    () => (conflicts ?? []).reduce((n, g) => n + g.clashes.length, 0),
    [conflicts],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Block off slots</DialogTitle>
          <DialogDescription>
            {clubName} · these courts can&apos;t be booked while the block is
            active.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {/* Courts */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Courts</Label>
              <button
                type="button"
                className="text-[11px] text-[var(--muted-foreground)] underline-offset-2 hover:underline"
                onClick={() =>
                  setCourtIds(
                    courtIds.length === bookableCourts.length
                      ? []
                      : bookableCourts.map((c) => c.id),
                  )
                }
              >
                {courtIds.length === bookableCourts.length
                  ? "Clear all"
                  : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {bookableCourts.map((c) => {
                const checked = courtIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm",
                      checked
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border)] hover:bg-[var(--muted)]/30",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCourt(c.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span>{c.name}</span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Days of week */}
          <section className="space-y-2">
            <Label>Days of week</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const checked = days.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      checked
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] hover:bg-[var(--muted)]/30",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Leave empty to block <em>every</em> day in the date range.
            </p>
          </section>

          {/* Date range */}
          <section>
            <DateRangeField
              startLabel="Start date"
              endLabel="End date"
              startId="block-start-date"
              endId="block-end-date"
              startValue={startDate}
              endValue={endDate}
              onChange={({ start, end }) => {
                setStartDate(start);
                setEndDate(end);
              }}
              mode="any"
              locale="en-NL"
            />
          </section>

          {/* Time range */}
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="block-start-time">Start time</Label>
              <Input
                id="block-start-time"
                type="time"
                step={3600}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="block-end-time">End time</Label>
              <Input
                id="block-end-time"
                type="time"
                step={3600}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </section>

          {/* Label + notes */}
          <section className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="block-label">Label (shown on calendar)</Label>
              <Input
                id="block-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Golden Sports, KV Triaz korfball"
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="block-notes">Internal notes (optional)</Label>
              <Textarea
                id="block-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Visible only to admins."
              />
            </div>
          </section>

          {summary && (
            <div className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
              <strong className="text-[var(--foreground)]">
                {courtIds.length} court{courtIds.length === 1 ? "" : "s"}
              </strong>{" "}
              ·{" "}
              <strong className="text-[var(--foreground)]">
                {summary.dateCount} date{summary.dateCount === 1 ? "" : "s"}
              </strong>{" "}
              · {summary.hoursPerOccurrence}h per slot ={" "}
              <strong className="text-[var(--foreground)]">
                {summary.totalHours} court-hour
                {summary.totalHours === 1 ? "" : "s"} blocked
              </strong>
            </div>
          )}

          {error && !conflicts && (
            <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
              {error}
            </p>
          )}

          {conflicts && conflicts.length > 0 && (
            <div className="space-y-2 rounded-md border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">
              <div className="font-semibold">
                {totalClashCount} clash(es) on this block
              </div>
              <p>
                Confirm to create the block anyway — clashing dates will be
                automatically skipped so the existing bookings/classes stay
                intact.
              </p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {conflicts.flatMap((g) =>
                  g.clashes.map((c) => (
                    <li key={`${g.courtId}-${g.dayOfWeek}-${c.date}`}>
                      <span className="font-mono">{c.date}</span> · {g.courtName}
                      : {c.conflicts.map((d) => d.label).join(", ")}
                    </li>
                  )),
                )}
              </ul>
            </div>
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
          {conflicts && conflicts.length > 0 ? (
            <Button
              onClick={() => handleSubmit(true)}
              disabled={isPending}
            >
              {isPending
                ? "Saving..."
                : `Block off, skip ${totalClashCount} clash(es)`}
            </Button>
          ) : (
            <Button
              onClick={() => handleSubmit(false)}
              disabled={!validRange || isPending}
            >
              {isPending ? "Saving..." : "Block off"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
