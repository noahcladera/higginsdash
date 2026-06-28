"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { markAttendance } from "@/lib/classes/attendance-actions";
import { cn } from "@/lib/utils";

type Status = "present" | "absent" | "late" | "excused";

const OPTIONS: { value: Status; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

/**
 * Coach roll-call: tap a status for one roster student in one session.
 * Flat button row (no glass SegmentedControl) for reliable iOS Safari taps.
 */
export function RollCallControl({
  classSessionId,
  studentPersonId,
  initialStatus,
}: {
  classSessionId: string;
  studentPersonId: string;
  initialStatus: Status | null;
}) {
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: Status) {
    if (pending || status === next) return;
    setError(null);
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const res = await markAttendance({
        classSessionId,
        studentPersonId,
        status: next,
      });
      if (!res.ok) {
        setStatus(prev);
        setError(res.error);
      }
    });
  }

  const active = status ?? "present";

  return (
    <div className="flex w-full flex-col items-stretch gap-1 sm:items-end">
      <div
        role="tablist"
        aria-label="Attendance"
        className="grid w-full grid-cols-4 gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 sm:w-auto sm:min-w-[280px]"
      >
        {OPTIONS.map((opt) => {
          const selected = active === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={pending}
              onClick={() => choose(opt.value)}
              className={cn(
                "inline-flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-xs font-medium transition-colors sm:text-sm",
                selected
                  ? "bg-[var(--triaz-ink)]/12 font-semibold text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] active:bg-[var(--muted)]/40",
              )}
            >
              {pending && selected && (
                <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
              )}
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && (
        <span className="text-xs text-[var(--danger,#b4232a)]">{error}</span>
      )}
    </div>
  );
}
