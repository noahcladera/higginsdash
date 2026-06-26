"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon } from "@/components/icons";
import { ChevronUp, ChevronDown } from "lucide-react";
import { ADULT_MIN_AGE } from "@/lib/classes/age-band";
import { KIDS_LEVELS, ADULT_LEVELS, type SkillLevelValue } from "@/lib/skill-levels";

/**
 * Class groups repeater.
 *
 * A class series always has at least one group. The legacy "Split this
 * class into sub-groups" checkbox is gone — admins simply add a second
 * row when they want a parallel section, and an explicit "Remove" button
 * brings them back to one. This collapses two pieces of state (split
 * on/off + the row list) into a single source of truth (the rows).
 *
 * Wire format (`groupsJson` hidden input):
 *   - Always JSON-stringified {@link GroupRow}[] with at least one entry.
 *   - The server's group payload schema (`src/lib/classes/group-payload.ts`)
 *     is the canonical reader.
 *
 * Each row carries:
 *   - `localKey` — opaque React key. *Never* leaks to the DB; it's just
 *     what we render `<div key=>` against. Stable across renders, but
 *     fresh per row creation. Distinct from `id` (the DB id) so a brand-
 *     new row's key never collides with an existing group's id.
 *   - `id` — the existing `ClassSeriesGroup.id` when editing; `undefined`
 *     for newly-added rows (the server picks an id on insert).
 *   - `coachPersonId` — owning coach, picked inline. Required when there
 *     are 2+ rows; optional for the single-row case (the lead coach on
 *     the series implicitly covers it).
 *
 * The wire payload still carries a `tempId` field for the server to map
 * back; for existing rows we send the DB id, for new rows we send the
 * `localKey`. The server treats the value as opaque.
 */

export interface GroupRow {
  /** Opaque React key — local to this component instance only. */
  localKey: string;
  /** DB id when editing; absent for newly-added rows. */
  id?: string;
  name: string;
  endTime: string; // HH:MM
  maxStudents: number;
  minStudents: string;
  minAge: string;
  maxAge: string;
  eligibleSkillLevels: SkillLevelValue[];
  internalNotes: string;
  /** Empty string = unassigned. Required server-side when rows.length > 1. */
  coachPersonId: string;
}

export interface GroupsFieldProps {
  audience: "kids" | "adults" | "mixed";
  /** Series-level end time (HH:MM); per-group end must be ≤ this. */
  seriesEndTime: string;
  /** Initial rows. Empty/undefined → render one blank row. */
  defaultGroups?: GroupRow[];
  /**
   * Lead + assistant coaches the admin can assign to each row. Sourced
   * from `<CoachAssignmentField>`. When the roster shrinks (e.g. an
   * assistant is removed), any row whose previously-picked coach
   * disappears is auto-cleared and flagged with the inline warning.
   */
  coachOptions?: Array<{ personId: string; name: string }>;
  /** Fired whenever the visible rows change. */
  onChange?: (rows: GroupRow[]) => void;
}

export function GroupsField({
  audience,
  seriesEndTime,
  defaultGroups,
  coachOptions,
  onChange,
}: GroupsFieldProps) {
  const reactId = useId();

  const [rows, setRows] = useState<GroupRow[]>(() =>
    defaultGroups && defaultGroups.length > 0
      ? defaultGroups
      : [makeBlankRow(`${reactId}-0`, seriesEndTime)],
  );

  // When the parent updates the series end time and the admin hasn't
  // yet customised any per-row end (single row, end still tracking
  // series), keep the row in sync. Multi-row case is left alone — the
  // admin clearly wants distinct end times.
  useEffect(() => {
    setRows((prev) => {
      if (prev.length !== 1) return prev;
      if (prev[0].endTime === seriesEndTime) return prev;
      return [{ ...prev[0], endTime: seriesEndTime }];
    });
  }, [seriesEndTime]);

  useEffect(() => {
    onChange?.(rows);
  }, [rows, onChange]);

  // Drop any picked coach that's no longer in the supplied roster.
  // Without this, deleting an assistant who was teaching a group would
  // leave a stale `coachPersonId` and silently fail server validation.
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
    const localKey = `${reactId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setRows((prev) => [...prev, makeBlankRow(localKey, seriesEndTime)]);
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<GroupRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function moveRow(idx: number, delta: -1 | 1) {
    setRows((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  // Wire payload. `tempId` is whatever the server can map back to: the
  // existing DB id when editing, or the local key for new rows.
  const json = useMemo(
    () =>
      JSON.stringify(
        rows.map((r, idx) => ({
          tempId: r.id ?? r.localKey,
          id: r.id,
          displayOrder: idx,
          name: r.name,
          endTime: r.endTime,
          maxStudents: Number(r.maxStudents),
          minStudents: r.minStudents,
          minAge: audience === "adults" ? ADULT_MIN_AGE : r.minAge,
          maxAge: audience === "adults" ? null : r.maxAge,
          eligibleSkillLevels: r.eligibleSkillLevels,
          internalNotes: r.internalNotes,
          coachPersonId: r.coachPersonId || null,
        })),
      ),
    [rows, audience],
  );

  const requireCoach = rows.length >= 2;
  const offerings = coachOptions ?? [];
  const totalCapacity = rows.reduce((sum, r) => sum + (Number(r.maxStudents) || 0), 0);

  return (
    <div className="space-y-4">
      <input type="hidden" name="groupsJson" value={json} />

      <div className="space-y-3">
        {rows.map((r, idx) => (
          <div
            key={r.localKey}
            className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Group {idx + 1}
                {r.id && (
                  <span className="ml-2 normal-case tracking-normal text-[var(--muted-foreground)]/70">
                    · saved
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveRow(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move group ${idx + 1} up`}
                  title="Move up"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(idx, 1)}
                  disabled={idx === rows.length - 1}
                  aria-label={`Move group ${idx + 1} down`}
                  title="Move down"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronDown size={16} />
                </button>
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
              {audience !== "adults" ? (
                <>
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
                </>
              ) : null}
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
                placeholder="Coach-only notes about this group."
              />
            </Field>
            <CoachPicker
              required={requireCoach}
              value={r.coachPersonId}
              options={offerings}
              onChange={(personId) =>
                updateRow(idx, { coachPersonId: personId })
              }
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            disabled={rows.length >= 6}
          >
            <PlusIcon /> Add group
          </Button>
          <p className="text-xs text-[var(--muted-foreground)]">
            Total capacity: <span className="font-medium tabular-nums">{totalCapacity}</span>
            {rows.length > 1 ? " across all groups" : ""}.
          </p>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          One court block covers the whole class — the latest group end
          becomes the series end. Each group keeps its own roster cap and
          end time on the parent portal.
        </p>
      </div>
    </div>
  );
}

function makeBlankRow(localKey: string, seriesEndTime: string): GroupRow {
  return {
    localKey,
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
 * Per-group coach single-select. The dropdown is `required` when the
 * form has 2+ groups, so HTML5 form validation already blocks submit;
 * the inline yellow warning gives the admin a friendlier nudge towards
 * "the lead/assistant you swapped in needs to pick up this group".
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
        <Label>Group coach</Label>
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
          {noOptions
            ? "— pick a lead/assistant in the Coaches step first —"
            : "— pick a coach —"}
        </option>
        {options.map((c) => (
          <option key={c.personId} value={c.personId}>
            {c.name}
          </option>
        ))}
      </select>
      {required && empty && (
        <p className="text-[11px] font-medium text-[var(--warning,#a16207)]">
          No coach assigned. Pick one before saving — every group needs an
          owning coach when the class has more than one.
        </p>
      )}
      {!required && (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          Add a second group to require a per-group coach. With one group,
          the lead coach implicitly covers it.
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
