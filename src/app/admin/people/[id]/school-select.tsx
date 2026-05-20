"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { KNOWN_SCHOOLS, isKnownSchool } from "@/lib/schools";

const OTHER = "__other__";

/**
 * Two-control input bound to a single text-valued form field (`name`).
 *
 * - The visible <select> picks one of the curated schools or "Other".
 * - When "Other" is picked, a free-text input appears.
 * - A hidden <input name={name}> is updated by both controls so the
 *   server action receives a single string (or empty when nothing picked).
 */
export function SchoolSelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string | null;
}) {
  const initial = defaultValue ?? "";
  const initialKnown = isKnownSchool(initial);

  const [mode, setMode] = useState<string>(initialKnown ? initial : initial ? OTHER : "");
  const [other, setOther] = useState<string>(initialKnown ? "" : initial);

  const value = mode === OTHER ? other : mode === "" ? "" : mode;

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        <option value="">— select school —</option>
        {KNOWN_SCHOOLS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.hint ? `${s.label} — ${s.hint}` : s.label}
          </option>
        ))}
        <option value={OTHER}>Other (specify)</option>
      </select>
      {mode === OTHER && (
        <Input
          aria-label="School name"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="School name"
        />
      )}
    </div>
  );
}
