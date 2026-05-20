"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { setAvailability } from "@/lib/ladder/actions";
import { DAY_OF_WEEK_LABEL, formatMinuteOfDay } from "@/lib/ladder/rules";
import { useActionFeedback } from "@/lib/feedback";
import { PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface Window {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  clubId: string | null;
}

const HOURS = Array.from({ length: 16 }, (_, i) => 7 + i); // 07:00 → 22:00

export function AvailabilityForm({
  eligibleClubs,
  initial,
}: {
  eligibleClubs: { id: string; name: string }[];
  initial: Window[];
}) {
  const [windows, setWindows] = React.useState<Window[]>(
    initial.length > 0
      ? initial
      : [
          // Sensible default: Saturday 10:00–14:00.
          { dayOfWeek: 5, startMinute: 10 * 60, endMinute: 14 * 60, clubId: null },
        ],
  );
  const [localError, setLocalError] = React.useState<string | null>(null);
  const { run, pending, error } = useActionFeedback({
    success: "Availability saved",
    successDescription: "Challengers will see these windows when matching you.",
    onSuccess: () => setLocalError(null),
  });
  const displayError = localError ?? error;

  const update = (idx: number, patch: Partial<Window>) => {
    setWindows((prev) =>
      prev.map((w, i) => (i === idx ? { ...w, ...patch } : w)),
    );
    setLocalError(null);
  };

  const removeAt = (idx: number) => {
    setWindows((prev) => prev.filter((_, i) => i !== idx));
    setLocalError(null);
  };

  const addWindow = () => {
    setWindows((prev) => [
      ...prev,
      { dayOfWeek: 6, startMinute: 10 * 60, endMinute: 12 * 60, clubId: null },
    ]);
    setLocalError(null);
  };

  const submit = () => {
    setLocalError(null);
    for (const w of windows) {
      if (w.endMinute <= w.startMinute) {
        setLocalError("Each window's end time must be after its start.");
        return;
      }
    }
    run(() => setAvailability({ windows }));
  };

  return (
    <div className="space-y-4">
      {windows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No windows yet — add one below.
        </p>
      ) : (
        <ul className="space-y-2">
          {windows.map((w, idx) => (
            <li
              key={idx}
              className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--card)] p-3 sm:grid-cols-[120px_1fr_1fr_1fr_auto] sm:items-center sm:gap-3"
            >
              <select
                value={w.dayOfWeek}
                onChange={(e) =>
                  update(idx, { dayOfWeek: Number(e.target.value) })
                }
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              >
                {DAY_OF_WEEK_LABEL.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={w.startMinute}
                onChange={(e) =>
                  update(idx, { startMinute: Number(e.target.value) })
                }
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                aria-label="Start time"
              >
                {HOURS.map((h) => (
                  <option key={`s${h}`} value={h * 60}>
                    From {formatMinuteOfDay(h * 60)}
                  </option>
                ))}
              </select>
              <select
                value={w.endMinute}
                onChange={(e) =>
                  update(idx, { endMinute: Number(e.target.value) })
                }
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                aria-label="End time"
              >
                {HOURS.concat([23]).map((h) => (
                  <option key={`e${h}`} value={h * 60}>
                    Until {formatMinuteOfDay(h * 60)}
                  </option>
                ))}
              </select>
              <select
                value={w.clubId ?? ""}
                onChange={(e) =>
                  update(idx, {
                    clubId: e.target.value === "" ? null : e.target.value,
                  })
                }
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                aria-label="Club"
              >
                <option value="">Either club</option>
                {eligibleClubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  "text-[var(--muted-foreground)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]",
                )}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          tone="neutral"
          size="sm"
          onClick={addWindow}
          disabled={windows.length >= 20}
        >
          <PlusIcon /> Add window
        </Button>
        <div className="flex items-center gap-3">
          {displayError && (
            <span className="text-xs text-[var(--destructive)]">
              {displayError}
            </span>
          )}
          <Button
            type="button"
            tone="triaz"
            disabled={pending}
            onClick={submit}
          >
            {pending ? "Saving…" : "Save availability"}
          </Button>
        </div>
      </div>
    </div>
  );
}
