"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon } from "@/components/icons";
import { KIDS_LEVELS, ADULT_LEVELS, type SkillLevelValue } from "@/lib/skill-levels";

/**
 * Sub-groups repeater. Wraps the wire format from
 * `src/lib/classes/group-payload.ts` and surfaces it as a friendly
 * UI for split classes (e.g. Wed AICS pickup with two age bands and
 * two end times).
 *
 * Emits two hidden form inputs:
 *   - `groupsJson`        JSON-stringified GroupInput[]
 *                         (empty/missing → server creates a single
 *                         default group from the series window)
 *   - `splitEnabled`      "true" | "false" — informational only.
 *
 * Each group exposes an opaque `tempId` the caller can reference from
 * elsewhere on the form (most notably the per-coach group scope in
 * `<CoachAssignmentField>`); on the edit page that tempId is the
 * existing group's database id, so server-side mapping is a no-op.
 */

export interface SubGroupRow {
  tempId: string;
  /** Existing DB id when editing; undefined for newly-added rows. */
  id?: string;
  name: string;
  endTime: string; // HH:MM
  maxStudents: number;
  minStudents: string;
  minAge: string;
  maxAge: string;
  eligibleSkillLevels: SkillLevelValue[];
  internalNotes: string;
  /**
   * Person id of the coach who teaches this sub-group. Empty when
   * unassigned. Required (validated via HTML5 + server) only when the
   * series has 2+ sub-groups — for a single sub-group, the lead coach
   * picked in the Coaches card implicitly covers it.
   */
  coachPersonId: string;
}

export interface SubGroupsFieldProps {
  audience: "kids" | "adults" | "mixed";
  /** Series-level end time (HH:MM); per-group end must be ≤ this. */
  seriesEndTime: string;
  /** Initial rows. Empty/undefined → off (single default on server). */
  defaultGroups?: SubGroupRow[];
  /** When true, render with "split is on" by default. */
  defaultSplitEnabled?: boolean;
  /** Title above the field (omit when used inside a Step header). */
  title?: string;
  /**
   * Roster of lead + assistant coaches the admin can assign to each
   * sub-group. Sourced from `<CoachAssignmentField>` on the create
   * cascade, or from the series' persisted roster on the edit page.
   * When the roster shrinks (e.g. an assistant is removed), any row
   * whose previously-picked coach disappears is auto-cleared and
   * flagged with the inline "No coach assigned" warning.
   */
  coachOptions?: Array<{ personId: string; name: string }>;
  /** When provided, fired whenever the visible group rows change. */
  onChange?: (rows: SubGroupRow[]) => void;
}

export function SubGroupsField({
  audience,
  seriesEndTime,
  defaultGroups,
  defaultSplitEnabled,
  coachOptions,
  onChange,
}: SubGroupsFieldProps) {
  const reactId = useId();
  const initialEnabled =
    defaultSplitEnabled ?? (defaultGroups != null && defaultGroups.length > 1);
  const [splitEnabled, setSplitEnabled] = useState<boolean>(initialEnabled);

  const [rows, setRows] = useState<SubGroupRow[]>(() =>
    defaultGroups && defaultGroups.length > 0
      ? defaultGroups
      : [makeBlankRow(`${reactId}-0`, seriesEndTime)],
  );

  // Re-emit rows when the parent passes a new seriesEndTime (so the
  // single default tracks the series end as the form is filled in)
  // — only when split is off and there's only one row, untouched.
  useEffect(() => {
    if (splitEnabled) return;
    setRows((prev) => {
      if (prev.length !== 1) return prev;
      if (prev[0].endTime === seriesEndTime) return prev;
      return [{ ...prev[0], endTime: seriesEndTime }];
    });
  }, [seriesEndTime, splitEnabled]);

  useEffect(() => {
    // Only expose rows to the parent when split is on. The server
    // synthesizes a single `__default__` group when nothing is
    // submitted, so the parent doesn't need to know about the
    // placeholder row in the off state.
    onChange?.(splitEnabled ? rows : []);
  }, [rows, splitEnabled, onChange]);

  // When the roster of coaches the parent provides changes (admin
  // swapped the lead, removed an assistant, …), drop any previously
  // selected coachPersonId that's no longer offered. The row then
  // shows the "No coach assigned" warning and submit is blocked by
  // the row's required <select>.
  useEffect(() => {
    if (!coachOptions) return;
    const known = new Set(coachOptions.map((c) => c.personId));
    setRows((prev) => {
      let dirty = false;
      const next = prev.map((r) => {
        if (r.coachPersonId && !known.has(r.coachPersonId)) {
          dirty = true;
          return { ...r, coachPersonId: "" };
        }
        return r;
      });
      return dirty ? next : prev;
    });
  }, [coachOptions]);

  function addRow() {
    const tempId = `${reactId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setRows((prev) => [...prev, makeBlankRow(tempId, seriesEndTime)]);
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<SubGroupRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const json = useMemo(() => {
    // When split is off we deliberately emit an empty payload — the
    // server's `ensureAtLeastOneGroup` synthesizes a single default
    // group from the series-level fields (name, endTime, age band,
    // capacity), which is exactly what the placeholder row would be
    // anyway. Emitting the placeholder verbatim would push an empty
    // `name` through the server schema and fail validation.
    if (!splitEnabled) return "";
    return JSON.stringify(
      rows.map((r, idx) => ({
        tempId: r.tempId,
        id: r.id,
        displayOrder: idx,
        name: r.name,
        endTime: r.endTime,
        maxStudents: Number(r.maxStudents),
        minStudents: r.minStudents,
        minAge: r.minAge,
        maxAge: r.maxAge,
        eligibleSkillLevels: r.eligibleSkillLevels,
        internalNotes: r.internalNotes,
        coachPersonId: r.coachPersonId || null,
      })),
    );
  }, [rows, splitEnabled]);

  // Picker visible whenever split is on, even with a single row. The
  // "must pick" hard-block only kicks in for 2+ rows so the lead can
  // implicitly cover a degenerate single-row split.
  const requireCoach = splitEnabled && rows.length >= 2;
  const showCoachPicker = splitEnabled;
  const offerings = coachOptions ?? [];

  return (
    <div className="space-y-4">
      <input type="hidden" name="groupsJson" value={json} />
      <input type="hidden" name="splitEnabled" value={String(splitEnabled)} />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={splitEnabled}
          onChange={(e) => setSplitEnabled(e.target.checked)}
          className="accent-[var(--triaz)]"
        />
        <span>Split this class into sub-groups (different ages / levels / end times)</span>
      </label>

      {splitEnabled ? (
        <div className="space-y-3">
          {rows.map((r, idx) => (
            <div
              key={r.tempId}
              className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Sub-group {idx + 1}
                  {r.id && (
                    <span className="ml-2 normal-case tracking-normal text-[var(--muted-foreground)]/70">
                      · saved
                    </span>
                  )}
                </span>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(idx)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Group name">
                  <Input
                    value={r.name}
                    onChange={(e) => updateRow(idx, { name: e.target.value })}
                    placeholder="e.g. Ages 7–9 (early)"
                    required
                  />
                </Field>
                <Field
                  label="Ends at"
                  hint={`≤ series end (${seriesEndTime || "set start/end first"})`}
                >
                  <Input
                    type="time"
                    value={r.endTime}
                    onChange={(e) => updateRow(idx, { endTime: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Max students">
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={r.maxStudents}
                    onChange={(e) =>
                      updateRow(idx, {
                        maxStudents: Number(e.target.value || 1),
                      })
                    }
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Min students" optional>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={r.minStudents}
                    onChange={(e) =>
                      updateRow(idx, { minStudents: e.target.value })
                    }
                    placeholder="—"
                  />
                </Field>
                <Field label="Min age" optional>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={r.minAge}
                    onChange={(e) =>
                      updateRow(idx, { minAge: e.target.value })
                    }
                    placeholder="—"
                  />
                </Field>
                <Field label="Max age" optional>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={r.maxAge}
                    onChange={(e) =>
                      updateRow(idx, { maxAge: e.target.value })
                    }
                    placeholder="—"
                  />
                </Field>
              </div>
              <LevelPills
                audience={audience}
                selected={new Set(r.eligibleSkillLevels)}
                onToggle={(v) =>
                  updateRow(idx, {
                    eligibleSkillLevels: r.eligibleSkillLevels.includes(v)
                      ? r.eligibleSkillLevels.filter((x) => x !== v)
                      : [...r.eligibleSkillLevels, v],
                  })
                }
              />
              <Field label="Internal notes" optional>
                <Textarea
                  value={r.internalNotes}
                  onChange={(e) =>
                    updateRow(idx, { internalNotes: e.target.value })
                  }
                  rows={2}
                  placeholder="Coach-only notes about this sub-group."
                />
              </Field>
              {showCoachPicker && (
                <CoachPicker
                  required={requireCoach}
                  value={r.coachPersonId}
                  options={offerings}
                  onChange={(personId) =>
                    updateRow(idx, { coachPersonId: personId })
                  }
                />
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            disabled={rows.length >= 6}
          >
            <PlusIcon /> Add sub-group
          </Button>
          <p className="text-xs text-[var(--muted-foreground)]">
            One court block covers the whole class — the latest sub-group
            end becomes the series end. Each sub-group keeps its own
            roster cap and end time on the parent portal.
          </p>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          The class will have a single roster — set the cap on the next
          step. Toggle on if you have two age bands or different end
          times under the same class.
        </p>
      )}
    </div>
  );
}

function makeBlankRow(tempId: string, seriesEndTime: string): SubGroupRow {
  return {
    tempId,
    name: "",
    endTime: seriesEndTime || "",
    maxStudents: 8,
    minStudents: "",
    minAge: "",
    maxAge: "",
    eligibleSkillLevels: [],
    internalNotes: "",
    coachPersonId: "",
  };
}

/**
 * Per-sub-group coach single-select. The dropdown is `required` when
 * the form has 2+ sub-groups so HTML5 form validation already blocks
 * submit; the inline yellow warning gives the admin a friendlier
 * nudge towards "the lead/assistant you swapped in needs to pick up
 * this sub-group".
 */
function CoachPicker({
  required,
  value,
  options,
  onChange,
}: {
  required: boolean;
  value: string;
  options: ReadonlyArray<{ personId: string; name: string }>;
  onChange: (personId: string) => void;
}) {
  const empty = !value;
  const noOptions = options.length === 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>Sub-group coach</Label>
        {!required && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Optional
          </span>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={
          "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 " +
          (required && empty
            ? "border-[var(--warning,#facc15)]"
            : "border-[var(--border)]")
        }
      >
        <option value="">
          {noOptions ? "— pick a lead/assistant in the Coaches step first —" : "— pick a coach —"}
        </option>
        {options.map((c) => (
          <option key={c.personId} value={c.personId}>
            {c.name}
          </option>
        ))}
      </select>
      {required && empty && (
        <p className="text-[11px] font-medium text-[var(--warning,#a16207)]">
          No coach assigned. Pick one before saving — every sub-group
          needs an owning coach when the class is split.
        </p>
      )}
      {!required && (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Add a second sub-group to require a per-sub-group coach.
          With one sub-group, the lead coach implicitly covers it.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {optional && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Optional
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-[11px] text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  );
}

function LevelPills({
  audience,
  selected,
  onToggle,
}: {
  audience: "kids" | "adults" | "mixed";
  selected: Set<SkillLevelValue>;
  onToggle: (v: SkillLevelValue) => void;
}) {
  const showKids = audience === "kids" || audience === "mixed";
  const showAdults = audience === "adults" || audience === "mixed";
  return (
    <div className="space-y-2">
      <Label>Eligible levels (optional)</Label>
      {showKids && (
        <Pills
          title="Kids"
          options={KIDS_LEVELS}
          selected={selected}
          onToggle={onToggle}
        />
      )}
      {showAdults && (
        <Pills
          title="Adults"
          options={ADULT_LEVELS}
          selected={selected}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

function Pills({
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
