"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PlusIcon } from "@/components/icons";

export type CoachOption = { personId: string; name: string };

/**
 * One coach assignment as the form holds it client-side. Per-group
 * teaching is not carried here — that decision lives on each group row
 * inside `<GroupsField>`. The remaining per-assignment metadata is just
 * the pickup tickbox.
 */
type AssignmentRow = {
  coachPersonId: string;
  role: "lead" | "assistant";
  participatesInPickup: boolean;
};

/**
 * Optional callback fired whenever the lead/assistant roster changes.
 * The Groups card uses this to keep its per-group coach dropdowns in
 * sync (offered options shrink when an assistant is
 * removed, dropped picks are cleared client-side).
 */
type RosterChange = {
  /** Person id of the lead, or null when "no coach yet". */
  leadPersonId: string | null;
  /** Person ids of every assistant currently picked, in form order. */
  assistantPersonIds: string[];
};

/**
 * Lead-coach + N-assistants picker shared by the create cascade and
 * the locked edit page's Coaches section.
 *
 * Emits these hidden inputs (every form needs them):
 *   leadCoachPersonId        uuid | "" (empty = "NO COACH YET")
 *   assistantCoachPersonIds  CSV of uuids
 *   coachAssignmentsJson     JSON-stringified AssignmentRow[]
 *                            (only emitted when at least one coach
 *                             is picked; carries pickup tickbox state)
 *
 * Pickup mode adds a per-coach "does pickup" tick box. Per-sub-group
 * teaching now lives on `<SubGroupsField>`, so swapping coach X → Y
 * here cannot silently inherit X's sub-group assignment — Y simply
 * shows up in the Sub-groups card's coach dropdowns and the admin
 * has to assign explicitly.
 *
 * Rules:
 *   - At most 5 assistants.
 *   - A person can't be picked twice (lead or assistant).
 *   - Default state: lead = unassigned, no assistants.
 */
export function CoachAssignmentField({
  coaches,
  leadDefault = "",
  assistantsDefault = [],
  assignmentsDefault,
  isPickup = false,
  onRosterChange,
}: {
  coaches: CoachOption[];
  leadDefault?: string | null;
  assistantsDefault?: string[];
  /** When provided, supersedes leadDefault/assistantsDefault so the
   * page can hand back per-coach pickup state. */
  assignmentsDefault?: AssignmentRow[];
  /** Toggles the per-coach "does pickup" checkbox. Pickup-only. */
  isPickup?: boolean;
  /** Notifies the parent on every roster mutation so sibling fields
   * (notably `<SubGroupsField>`) can refresh their coach pickers. */
  onRosterChange?: (change: RosterChange) => void;
}) {
  const initial = useMemo<AssignmentRow[]>(() => {
    if (assignmentsDefault && assignmentsDefault.length > 0) {
      return assignmentsDefault;
    }
    const out: AssignmentRow[] = [];
    if (leadDefault) {
      out.push({
        coachPersonId: leadDefault,
        role: "lead",
        participatesInPickup: true,
      });
    } else {
      out.push({
        coachPersonId: "",
        role: "lead",
        participatesInPickup: true,
      });
    }
    for (const a of assistantsDefault ?? []) {
      out.push({
        coachPersonId: a,
        role: "assistant",
        participatesInPickup: true,
      });
    }
    return out;
  }, [assignmentsDefault, leadDefault, assistantsDefault]);

  const [rows, setRows] = useState<AssignmentRow[]>(initial);
  const showRich = isPickup;

  const leadIdx = rows.findIndex((r) => r.role === "lead");
  const leadRow = leadIdx >= 0 ? rows[leadIdx] : null;
  const assistantRows = rows
    .map((r, i) => ({ row: r, idx: i }))
    .filter(({ row }) => row.role === "assistant");

  const pickedSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.coachPersonId) s.add(r.coachPersonId);
    return s;
  }, [rows]);

  function optionsFor(selfId: string): CoachOption[] {
    return coaches.filter(
      (c) => c.personId === selfId || !pickedSet.has(c.personId),
    );
  }

  function updateRow(idx: number, patch: Partial<AssignmentRow>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }

  function onLeadChange(next: string) {
    if (leadIdx < 0) return;
    const promotedFromAssistant = next && rows.some(
      (r, i) => i !== leadIdx && r.coachPersonId === next,
    );
    setRows((prev) => {
      const updated = prev.map((r, i) =>
        i === leadIdx ? { ...r, coachPersonId: next } : r,
      );
      if (promotedFromAssistant) {
        return updated.filter(
          (r, i) => i === leadIdx || r.coachPersonId !== next,
        );
      }
      return updated;
    });
  }

  function addAssistant() {
    if (assistantRows.length >= 5) return;
    setRows((prev) => [
      ...prev,
      {
        coachPersonId: "",
        role: "assistant",
        participatesInPickup: true,
      },
    ]);
  }

  function removeAssistant(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  // Hidden form payloads -----------------------------------------------
  // Legacy (kept so sections that haven't migrated yet still parse).
  const assistantCsv = useMemo(
    () =>
      assistantRows
        .map(({ row }) => row.coachPersonId)
        .filter(Boolean)
        .join(","),
    [assistantRows],
  );
  const leadHidden = leadRow?.coachPersonId ?? "";

  // Rich payload — only emit non-empty when the admin actually has a
  // coach picked, otherwise the server falls back to the legacy
  // pair-of-fields path and synthesizes the NO COACH YET placeholder.
  const richJson = useMemo(() => {
    const cleaned = rows
      .filter((r) => r.coachPersonId)
      .map((r) => ({
        coachPersonId: r.coachPersonId,
        role: r.role,
        participatesInPickup: isPickup ? r.participatesInPickup : true,
      }));
    return cleaned.length > 0 ? JSON.stringify(cleaned) : "";
  }, [rows, isPickup]);

  // Notify the parent on every roster change so the Sub-groups card
  // can refresh its per-row coach pickers (and clear stale picks for
  // an assistant who got removed). The callback is held in a ref so
  // identity changes on the parent don't re-fire this effect — the
  // effect should only re-run when the underlying `rows` change.
  const onRosterChangeRef = useRef(onRosterChange);
  useEffect(() => {
    onRosterChangeRef.current = onRosterChange;
  });
  useEffect(() => {
    const cb = onRosterChangeRef.current;
    if (!cb) return;
    const lead = rows.find((r) => r.role === "lead");
    cb({
      leadPersonId: lead?.coachPersonId ? lead.coachPersonId : null,
      assistantPersonIds: rows
        .filter((r) => r.role === "assistant" && r.coachPersonId)
        .map((r) => r.coachPersonId),
    });
  }, [rows]);

  const canAddMore = assistantRows.length < 5;
  const hasUnavailableSlots = assistantRows.some(({ row }) => !row.coachPersonId);

  return (
    <div className="space-y-4">
      <input type="hidden" name="leadCoachPersonId" value={leadHidden} />
      <input type="hidden" name="assistantCoachPersonIds" value={assistantCsv} />
      <input type="hidden" name="coachAssignmentsJson" value={richJson} />

      <div className="space-y-1.5">
        <Label>Lead coach</Label>
        <select
          value={leadRow?.coachPersonId ?? ""}
          onChange={(e) => onLeadChange(e.target.value)}
          className={selectClass}
        >
          <option value="">— No coach yet (assign later) —</option>
          {optionsFor(leadRow?.coachPersonId ?? "").map((c) => (
            <option key={c.personId} value={c.personId}>
              {c.name}
            </option>
          ))}
        </select>
        {leadRow?.coachPersonId && showRich && (
          <CoachExtras
            row={leadRow}
            onChange={(patch) => updateRow(leadIdx, patch)}
          />
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          The lead is who gets paid as lead and who appears first to
          parents. Leave unassigned if you&apos;re staffing later.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Assistants</Label>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Optional · up to 5
          </span>
        </div>
        {assistantRows.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            No assistants yet.
          </p>
        ) : (
          <div className="space-y-3">
            {assistantRows.map(({ row, idx }) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={row.coachPersonId}
                    onChange={(e) =>
                      updateRow(idx, { coachPersonId: e.target.value })
                    }
                    className={selectClass}
                  >
                    <option value="" disabled>
                      Pick an assistant…
                    </option>
                    {optionsFor(row.coachPersonId).map((c) => (
                      <option key={c.personId} value={c.personId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAssistant(idx)}
                  >
                    Remove
                  </Button>
                </div>
                {row.coachPersonId && showRich && (
                  <CoachExtras
                    row={row}
                    onChange={(patch) => updateRow(idx, patch)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addAssistant}
            disabled={!canAddMore || hasUnavailableSlots}
            title={
              !canAddMore
                ? "Max 5 assistants"
                : hasUnavailableSlots
                  ? "Fill the empty assistant row first"
                  : undefined
            }
          >
            <PlusIcon /> Add assistant
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Pickup-mode per-coach tick box. Only rendered for pickup classes —
 * the per-sub-group teaching dropdown moved to `<SubGroupsField>`,
 * so this component is now strictly about whether the coach joins the
 * gocab leaving Triaz or meets the kids back at the club.
 */
function CoachExtras({
  row,
  onChange,
}: {
  row: AssignmentRow;
  onChange: (patch: Partial<AssignmentRow>) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-[var(--border)]/60 bg-[var(--surface-strong)]/40 p-2">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={row.participatesInPickup}
          onChange={(e) =>
            onChange({ participatesInPickup: e.target.checked })
          }
          className="accent-[var(--triaz)]"
        />
        <span>
          Joins the pickup{" "}
          <span className="text-[var(--muted-foreground)]">
            (untick if this coach only meets the kids back at the club)
          </span>
        </span>
      </label>
    </div>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
