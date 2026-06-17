"use client";

import { useState, useTransition } from "react";

import { markAttendance } from "@/lib/classes/attendance-actions";

type Status = "present" | "absent" | "late" | "excused";

const OPTIONS: { value: Status; label: string; tone: string }[] = [
  { value: "present", label: "Present", tone: "var(--success, #1a7f4b)" },
  { value: "absent", label: "Absent", tone: "var(--danger, #b4232a)" },
  { value: "late", label: "Late", tone: "var(--warning-ink, #8a5a00)" },
  { value: "excused", label: "Excused", tone: "var(--muted-foreground)" },
];

/**
 * Coach roll-call: tap a status for one roster student in one session.
 * Optimistic — reverts and shows the error if the server action rejects.
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
    if (pending) return;
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

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)]">
        {OPTIONS.map((opt) => {
          const active = status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending}
              onClick={() => choose(opt.value)}
              aria-pressed={active}
              className="px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60"
              style={{
                color: active ? "white" : "var(--muted-foreground)",
                backgroundColor: active ? opt.tone : "transparent",
              }}
            >
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
