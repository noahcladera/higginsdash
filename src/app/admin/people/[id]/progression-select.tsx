"use client";

import { useState, useTransition } from "react";
import { setMedalLevel, setSkillLevel } from "../actions";
import { MEDAL_LEVELS, type MedalLevelValue } from "@/lib/medal-levels";
import {
  ADULT_LEVELS,
  type SkillLevelValue,
} from "@/lib/skill-levels";

/**
 * Admin inline-edit: medal ladder for minors, skill levels for adults.
 */
export function StudentProgressionSelect({
  personId,
  medalEligible,
  medalLevel,
  skillLevel,
}: {
  personId: string;
  medalEligible: boolean;
  medalLevel: MedalLevelValue | null;
  skillLevel: SkillLevelValue | null;
}) {
  if (medalEligible) {
    return (
      <MedalInlineSelect personId={personId} level={medalLevel} />
    );
  }
  return (
    <SkillInlineSelect personId={personId} level={skillLevel} />
  );
}

function MedalInlineSelect({
  personId,
  level,
}: {
  personId: string;
  level: MedalLevelValue | null;
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
        await setMedalLevel(personId, next === "" ? null : next);
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
    <SelectRow
      ariaLabel="Medal level"
      value={value}
      hint={hint}
      error={error}
      onChange={onChange}
    >
      <option value="">— not set —</option>
      {MEDAL_LEVELS.map((l) => (
        <option key={l.value} value={l.value}>
          {l.shortCode} — {l.label}
        </option>
      ))}
    </SelectRow>
  );
}

function SkillInlineSelect({
  personId,
  level,
}: {
  personId: string;
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
        await setSkillLevel(personId, next === "" ? null : next);
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
    <SelectRow
      ariaLabel="Skill level"
      value={value}
      hint={hint}
      error={error}
      onChange={onChange}
    >
      <option value="">— not set —</option>
      {ADULT_LEVELS.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </SelectRow>
  );
}

function SelectRow({
  ariaLabel,
  value,
  hint,
  error,
  onChange,
  children,
}: {
  ariaLabel: string;
  value: string;
  hint: "saving" | "saved" | "error" | null;
  error: string | null;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 min-w-[14rem] rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        {children}
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
