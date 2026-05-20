"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { setCoachAvailability } from "@/lib/coach/availability/actions";
import { DAY_OF_WEEK_LABEL, formatMinuteOfDay } from "@/lib/ladder/rules";
import { useActionFeedback } from "@/lib/feedback";
import { PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface Window {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

const HOURS = Array.from({ length: 16 }, (_, i) => 7 + i); // 07:00 → 22:00

/**
 * Coach-facing weekly availability editor. Mirrors the ladder availability
 * form but without the per-window club selector — coach availability is
 * declared globally for now (the office uses it as a soft signal when
 * picking subs / scheduling new lessons).
 */
export function CoachAvailabilityForm({
  initial,
}: {
  initial: Window[];
}) {
  const [windows, setWindows] = React.useState<Window[]>(initial);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const { run, pending, error } = useActionFeedback({
    success: "Availability saved",
    successDescription:
      "The office will see this when picking subs or scheduling lessons.",
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
      // Sensible default: weekday evening block (Mon 16:00–21:00).
      { dayOfWeek: 0, startMinute: 16 * 60, endMinute: 21 * 60 },
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
    run(() => setCoachAvailability({ windows }));
  };

  return (
    <div className="space-y-4">
      {windows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            No availability set yet.
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Empty means &ldquo;ask me anytime&rdquo; — add at least one window if
            you&rsquo;d rather only be approached for specific hours.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {windows.map((w, idx) => (
            <li
              key={idx}
              className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--card)] p-3 sm:grid-cols-[120px_1fr_1fr_auto] sm:items-center sm:gap-3"
            >
              <select
                value={w.dayOfWeek}
                onChange={(e) =>
                  update(idx, { dayOfWeek: Number(e.target.value) })
                }
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                aria-label="Day of week"
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
