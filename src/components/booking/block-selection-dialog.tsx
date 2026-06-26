"use client";

/**
 * Confirmation step after tap-to-select block slots on the admin calendar.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DayOfWeek, RecurringBlockScope } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createBlocksFromSelection,
  type BlockConflictGroup,
} from "@/app/admin/blocks/actions";
import { toast } from "@/lib/feedback";
import type { BlockPattern } from "./block-selection";
import {
  amsterdamDayOfWeek,
  amsterdamMidnightUtc,
  parseLocalDate,
} from "@/lib/booking/time";

const DOW_LABEL: Record<DayOfWeek, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const PRISMA_DOW_TO_IDX: Record<DayOfWeek, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function localDateMatchesDow(iso: string, dow: DayOfWeek): boolean {
  const p = parseLocalDate(iso);
  const m = amsterdamMidnightUtc(p.year, p.month, p.day);
  return amsterdamDayOfWeek(m) === PRISMA_DOW_TO_IDX[dow];
}

export interface BlockSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save (clear selection mode in parent). */
  onCompleted?: () => void;
  clubId: string;
  clubName: string;
  courts: { id: string; name: string }[];
  patterns: BlockPattern[];
  selectedSlotCount: number;
}

export function BlockSelectionDialog({
  open,
  onOpenChange,
  onCompleted,
  clubId,
  clubName,
  courts,
  patterns,
  selectedSlotCount,
}: BlockSelectionDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<BlockConflictGroup[] | null>(null);

  const firstDate = useMemo(() => {
    const dates = patterns.map((p) => p.firstDate);
    return dates.sort((a, b) => a.localeCompare(b))[0] ?? "";
  }, [patterns]);

  const defaultEnd = useMemo(
    () => (firstDate ? addDaysISO(firstDate, 84) : ""),
    [firstDate],
  );

  const [endDate, setEndDate] = useState(defaultEnd);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [exceptionInput, setExceptionInput] = useState("");
  const [exceptions, setExceptions] = useState<string[]>([]);
  const [scope, setScope] = useState<RecurringBlockScope>("full");

  useEffect(() => {
    if (!open) return;
    if (defaultEnd) setEndDate(defaultEnd);
    setLabel("");
    setNotes("");
    setExceptionInput("");
    setExceptions([]);
    setScope("full");
    setError(null);
  }, [open, defaultEnd]);

  const courtName = (id: string) =>
    courts.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  const addException = () => {
    setError(null);
    const raw = exceptionInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      setError("Use YYYY-MM-DD.");
      return;
    }
    if (!firstDate || raw < firstDate || raw > endDate) {
      setError("Exception must fall between the first selected date and repeat-until.");
      return;
    }
    const matchesSomePattern = patterns.some((p) =>
      localDateMatchesDow(raw, p.dayOfWeek),
    );
    if (!matchesSomePattern) {
      setError("That date doesn't fall on any selected weekday.");
      return;
    }
    if (exceptions.includes(raw)) {
      setError("Already added.");
      return;
    }
    setExceptions((prev) => [...prev, raw].sort((a, b) => a.localeCompare(b)));
    setExceptionInput("");
  };

  const removeException = (iso: string) => {
    setExceptions((prev) => prev.filter((x) => x !== iso));
  };

  const handleSubmit = (acknowledgeConflicts = false) => {
    setError(null);
    if (!acknowledgeConflicts) setConflicts(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!endDate || endDate < firstDate) {
      setError("Repeat-until date is invalid.");
      return;
    }
    startTransition(async () => {
      const res = await createBlocksFromSelection({
        clubId,
        endDate,
        label: label.trim(),
        notes: notes.trim() || undefined,
        excludedDates: exceptions,
        patterns: patterns.map((p) => ({
          courtId: p.courtId,
          dayOfWeek: p.dayOfWeek,
          startTime: p.startTime,
          endTime: p.endTime,
          firstDate: p.firstDate,
        })),
        acknowledgeConflicts,
        scope,
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
        description: `${selectedSlotCount} slot${selectedSlotCount === 1 ? "" : "s"} · ${patterns.length} recurring pattern${patterns.length === 1 ? "" : "s"}`,
      });
      onCompleted?.();
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Block off selected slots</DialogTitle>
          <DialogDescription>
            {clubName} · {selectedSlotCount} slot
            {selectedSlotCount === 1 ? "" : "s"} → {patterns.length} recurring
            pattern{patterns.length === 1 ? "" : "s"} (weekly until the end
            date).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <ul className="space-y-1.5 text-sm text-[var(--foreground)]">
            {patterns.map((p, i) => (
              <li
                key={`${p.courtId}-${p.dayOfWeek}-${p.startTime}-${i}`}
                className="rounded border border-[var(--border)] bg-[var(--muted)]/30 px-2 py-1.5"
              >
                <span className="font-medium">{courtName(p.courtId)}</span>
                <span className="text-[var(--muted-foreground)]"> · every </span>
                {DOW_LABEL[p.dayOfWeek]}
                <span className="text-[var(--muted-foreground)]"> </span>
                {p.startTime} – {p.endTime}
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="block-repeat-until">Repeat until</Label>
              <Input
                id="block-repeat-until"
                type="date"
                value={endDate}
                min={firstDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Exceptions (skip these dates)</Label>
            <div className="flex flex-wrap gap-1.5">
              {exceptions.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => removeException(iso)}
                  className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-2 py-0.5 text-xs hover:bg-[var(--muted)]"
                  title="Remove"
                >
                  {iso} ×
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                type="date"
                value={exceptionInput}
                onChange={(e) => setExceptionInput(e.target.value)}
                className="max-w-[11rem]"
              />
              <Button type="button" variant="outline" size="sm" onClick={addException}>
                Add
              </Button>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Only weekdays that match your selection can be skipped.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="block-sel-label">Label (shown on calendar)</Label>
            <Input
              id="block-sel-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Club maintenance"
              maxLength={60}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Who does this block?</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  scope === "full"
                    ? "border-[var(--primary)] bg-[var(--primary)]/5"
                    : "border-[var(--border)]"
                }`}
              >
                <input
                  type="radio"
                  name="block-scope"
                  value="full"
                  checked={scope === "full"}
                  onChange={() => setScope("full")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">Full block</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    Members and coaches can&apos;t book.
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  scope === "members_only"
                    ? "border-[var(--primary)] bg-[var(--primary)]/5"
                    : "border-[var(--border)]"
                }`}
              >
                <input
                  type="radio"
                  name="block-scope"
                  value="members_only"
                  checked={scope === "members_only"}
                  onChange={() => setScope("members_only")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">Members only</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    Members can&apos;t book; coaches can still teach here
                    (e.g. Kids Actief).
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="block-sel-notes">Internal notes (optional)</Label>
            <Textarea
              id="block-sel-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && !conflicts && (
            <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
              {error}
            </p>
          )}

          {conflicts && conflicts.length > 0 && (
            <div className="space-y-2 rounded-md border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">
              <div className="font-semibold">
                {totalClashCount} clash(es) on this selection
              </div>
              <p>
                Confirm to block off anyway — clashing dates will be
                automatically skipped so existing bookings/classes are
                preserved.
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
              disabled={isPending || !label.trim()}
            >
              {isPending
                ? "Saving..."
                : `Block off ${selectedSlotCount} slot${selectedSlotCount === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
