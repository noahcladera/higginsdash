"use client";

import { useState, useTransition } from "react";
import { setStudentSkillLevelAsCoach } from "../actions";
import { ADULT_LEVELS, type SkillLevelValue } from "@/lib/skill-levels";

export function CoachAdultLevelSelect({
  classSeriesId,
  studentPersonId,
  level,
}: {
  classSeriesId: string;
  studentPersonId: string;
  level: SkillLevelValue | null;
}) {
  const [value, setValue] = useState<string>(level ?? "");
  const [hint, setHint] = useState<"saving" | "saved" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onChange(next: string) {
    const previous = value;
    setValue(next);
    setHint("saving");
    setError(null);
    startTransition(async () => {
      try {
        await setStudentSkillLevelAsCoach({
          classSeriesId,
          studentPersonId,
          skillLevel: next === "" ? null : next,
        });
        setHint("saved");
        setTimeout(() => setHint(null), 1500);
      } catch (e) {
        setValue(previous);
        setHint("error");
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Skill level"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 min-w-[14rem] rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        <option value="">— not set —</option>
        {ADULT_LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <span
        className={
          "text-xs " +
          (hint === "error"
            ? "text-[var(--destructive)]"
            : "text-[var(--muted-foreground)]")
        }
        aria-live="polite"
      >
        {hint === "saving"
          ? "Saving…"
          : hint === "saved"
            ? "Saved"
            : hint === "error"
              ? (error ?? "Save failed")
              : ""}
      </span>
    </div>
  );
}
