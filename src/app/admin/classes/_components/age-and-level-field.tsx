"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KIDS_LEVELS, ADULT_LEVELS, type SkillLevelValue } from "@/lib/skill-levels";

/**
 * Age band + eligible skill-level multi-pill, shared by the create
 * cascade and the locked edit page.
 *
 * Emits three hidden form inputs:
 *   - `minAge`               number | "" (blank = no lower bound)
 *   - `maxAge`               number | "" (blank = no upper bound)
 *   - `eligibleSkillLevels`  CSV of SkillLevel values
 *
 * `audience` ("kids" | "adults" | "mixed") drives which level pills
 * are visible: kids/mixed show the Tenniskids progression, adults/mixed
 * show the adult buckets.
 */
export function AgeAndLevelField({
  audience,
  minAgeDefault = "",
  maxAgeDefault = "",
  levelsDefault = [],
  onChange,
  onLevelsChange,
}: {
  audience: "kids" | "adults" | "mixed";
  minAgeDefault?: string | number | "";
  maxAgeDefault?: string | number | "";
  levelsDefault?: SkillLevelValue[];
  /**
   * Fired whenever the age band changes. The parent uses this to feed
   * the live "Series name" preview tile, since the series name now
   * carries an `age 5-12` suffix derived from these inputs.
   */
  onChange?: (band: { minAge: number | null; maxAge: number | null }) => void;
  /**
   * Fired whenever the eligible-level pill set changes. Adult series
   * use this to drive the trailing level suffix in the live preview
   * (e.g. `… adults Beginner & Intermediate`).
   */
  onLevelsChange?: (levels: SkillLevelValue[]) => void;
}) {
  const [minAge, setMinAge] = useState<string>(
    minAgeDefault === "" || minAgeDefault == null ? "" : String(minAgeDefault),
  );
  const [maxAge, setMaxAge] = useState<string>(
    maxAgeDefault === "" || maxAgeDefault == null ? "" : String(maxAgeDefault),
  );
  const [levels, setLevels] = useState<Set<SkillLevelValue>>(
    () => new Set(levelsDefault),
  );

  const showKids = audience === "kids" || audience === "mixed";
  const showAdults = audience === "adults" || audience === "mixed";

  const csv = useMemo(() => Array.from(levels).join(","), [levels]);

  useEffect(() => {
    if (!onChange) return;
    const parse = (v: string): number | null => {
      if (v === "") return null;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };
    onChange({ minAge: parse(minAge), maxAge: parse(maxAge) });
  }, [minAge, maxAge, onChange]);

  useEffect(() => {
    if (!onLevelsChange) return;
    onLevelsChange(Array.from(levels));
  }, [levels, onLevelsChange]);

  function toggle(level: SkillLevelValue) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="minAge" value={minAge} />
      <input type="hidden" name="maxAge" value={maxAge} />
      <input type="hidden" name="eligibleSkillLevels" value={csv} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Min age</Label>
            <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Optional
            </span>
          </div>
          <Input
            type="number"
            min={0}
            max={120}
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Max age</Label>
            <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Optional
            </span>
          </div>
          <Input
            type="number"
            min={0}
            max={120}
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            placeholder="—"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Eligible levels</Label>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Optional · multi-select
          </span>
        </div>
        {showKids && (
          <PillRow
            title="Kids (Tenniskids)"
            options={KIDS_LEVELS}
            selected={levels}
            onToggle={toggle}
          />
        )}
        {showAdults && (
          <PillRow
            title="Adults"
            options={ADULT_LEVELS}
            selected={levels}
            onToggle={toggle}
          />
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          Leave all unchecked to allow any level. The portal lists this class
          to parents in matching brackets.
        </p>
      </div>
    </div>
  );
}

function PillRow({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: ReadonlyArray<{ value: SkillLevelValue; label: string }>;
  selected: Set<SkillLevelValue>;
  onToggle: (v: SkillLevelValue) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={
                "rounded-full border px-3 py-1 text-xs transition-colors " +
                (on
                  ? "border-[var(--triaz)] bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--triaz)]/40")
              }
              aria-pressed={on}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
