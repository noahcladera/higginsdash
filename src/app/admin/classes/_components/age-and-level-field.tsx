"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADULT_LEVELS, type SkillLevelValue } from "@/lib/skill-levels";
import { MEDAL_LEVELS, type MedalLevelValue } from "@/lib/medal-levels";

/**
 * Age band + eligible level multi-pill, shared by the create
 * cascade and the locked edit page.
 *
 * Kids programmes use medal levels; adults use skill levels.
 */
export function AgeAndLevelField({
  audience,
  minAgeDefault = "",
  maxAgeDefault = "",
  levelsDefault = [],
  medalLevelsDefault = [],
  onChange,
  onLevelsChange,
  onMedalLevelsChange,
}: {
  audience: "kids" | "adults" | "mixed";
  minAgeDefault?: string | number | "";
  maxAgeDefault?: string | number | "";
  levelsDefault?: SkillLevelValue[];
  medalLevelsDefault?: MedalLevelValue[];
  onChange?: (band: { minAge: number | null; maxAge: number | null }) => void;
  onLevelsChange?: (levels: SkillLevelValue[]) => void;
  onMedalLevelsChange?: (levels: MedalLevelValue[]) => void;
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
  const [medalLevels, setMedalLevels] = useState<Set<MedalLevelValue>>(
    () => new Set(medalLevelsDefault),
  );

  const showKids = audience === "kids" || audience === "mixed";
  const showAdults = audience === "adults" || audience === "mixed";

  const skillCsv = useMemo(() => Array.from(levels).join(","), [levels]);
  const medalCsv = useMemo(() => Array.from(medalLevels).join(","), [medalLevels]);

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

  useEffect(() => {
    if (!onMedalLevelsChange) return;
    onMedalLevelsChange(Array.from(medalLevels));
  }, [medalLevels, onMedalLevelsChange]);

  function toggleSkill(level: SkillLevelValue) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  function toggleMedal(level: MedalLevelValue) {
    setMedalLevels((prev) => {
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
      <input type="hidden" name="eligibleSkillLevels" value={skillCsv} />
      <input type="hidden" name="eligibleMedalLevels" value={medalCsv} />

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
            title="Kids (medals)"
            options={MEDAL_LEVELS.map((l) => ({
              value: l.value,
              label: `${l.shortCode} — ${l.label}`,
            }))}
            selected={medalLevels}
            onToggle={(v) => toggleMedal(v as MedalLevelValue)}
          />
        )}
        {showAdults && (
          <PillRow
            title="Adults"
            options={ADULT_LEVELS}
            selected={levels}
            onToggle={toggleSkill}
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

function PillRow<T extends string>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: Set<T>;
  onToggle: (v: T) => void;
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
