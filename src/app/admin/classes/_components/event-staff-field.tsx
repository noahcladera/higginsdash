"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PlusIcon } from "@/components/icons";
import type { CoachOption } from "./coach-assignment-field";

/**
 * Sequential staff picker for events: pick who is running the event,
 * then optionally add more staff (only after the first is chosen).
 * Maps to lead + assistants on the server (order preserved).
 */
export function EventStaffField({
  coaches,
  defaultPersonIds = [],
}: {
  coaches: CoachOption[];
  defaultPersonIds?: string[];
}) {
  const [staffIds, setStaffIds] = useState<string[]>(() =>
    defaultPersonIds.length > 0 ? defaultPersonIds : [""],
  );

  const pickedSet = useMemo(() => new Set(staffIds.filter(Boolean)), [staffIds]);

  function optionsFor(slotIndex: number): CoachOption[] {
    const self = staffIds[slotIndex];
    return coaches.filter(
      (c) => c.personId === self || !pickedSet.has(c.personId),
    );
  }

  function setSlot(index: number, personId: string) {
    setStaffIds((prev) => {
      const next = [...prev];
      next[index] = personId;
      return next;
    });
  }

  function addSlot() {
    setStaffIds((prev) => [...prev, ""]);
  }

  function removeSlot(index: number) {
    setStaffIds((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  }

  const filled = staffIds.filter(Boolean);
  const leadId = filled[0] ?? "";
  const assistantIds = filled.slice(1);

  return (
    <div className="space-y-3">
      <input type="hidden" name="leadCoachPersonId" value={leadId} />
      <input
        type="hidden"
        name="assistantCoachPersonIds"
        value={assistantIds.join(",")}
      />

      {staffIds.map((personId, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label>
              {index === 0 ? "Staff member" : `Staff member ${index + 1}`}
            </Label>
            <select
              value={personId}
              onChange={(e) => setSlot(index, e.target.value)}
              className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              required={index === 0}
            >
              <option value="" disabled={index === 0}>
                {index === 0 ? "Select staff…" : "Select another…"}
              </option>
              {optionsFor(index).map((c) => (
                <option key={c.personId} value={c.personId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {index > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeSlot(index)}
            >
              Remove
            </Button>
          )}
        </div>
      ))}

      {filled.length > 0 && filled.length < 6 && !staffIds.includes("") && (
        <Button type="button" variant="outline" size="sm" onClick={addSlot}>
          <PlusIcon className="mr-1 h-3.5 w-3.5" />
          Add another staff member
        </Button>
      )}
    </div>
  );
}
