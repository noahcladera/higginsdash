"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  CampOptionsConfigSchema,
  type CampOption,
} from "@/lib/classes/camp-options";

type Row = {
  localKey: string;
  label: string;
  attendanceKind:
    | "full_week_half_day"
    | "full_week_full_day"
    | "daily_drop_in_half_day"
    | "daily_drop_in_full_day";
  amountEur: string;
  forMembers: boolean;
};

function newId() {
  return crypto.randomUUID();
}

export function CampOptionsField({
  defaultOptions = null,
  /** Active camp days from the schedule (Mon–Fri minus exclusions). */
  scheduleDropInDates = [],
}: {
  defaultOptions?: { options: CampOption[]; dropInEnabled: boolean; dropInDates: string[] } | null;
  scheduleDropInDates?: string[];
}) {
  const base = defaultOptions ?? {
    options: [
      {
        id: newId(),
        label: "Half day (week)",
        attendanceKind: "full_week_half_day" as const,
        amountEur: 0,
      },
      {
        id: newId(),
        label: "Full day (week)",
        attendanceKind: "full_week_full_day" as const,
        amountEur: 0,
      },
    ],
    dropInEnabled: false,
    dropInDates: [] as string[],
  };

  const [rows, setRows] = useState<Row[]>(
    base.options.map((o) => ({
      localKey: o.id,
      label: o.label,
      attendanceKind: o.attendanceKind,
      amountEur: String(o.amountEur),
      forMembers: !!o.forMembers,
    })),
  );
  const [dropInEnabled, setDropInEnabled] = useState(base.dropInEnabled);

  const effectiveDropInDates = useMemo(() => {
    if (scheduleDropInDates.length > 0) return [...scheduleDropInDates].sort();
    return base.dropInDates;
  }, [scheduleDropInDates, base.dropInDates]);

  const jsonValue = useMemo(() => {
    const options = rows
      .map((r) => ({
        id: r.localKey,
        label: r.label.trim(),
        attendanceKind: r.attendanceKind,
        amountEur: Number.parseFloat(r.amountEur),
        forMembers: r.forMembers || undefined,
      }))
      .filter((r) => r.label && Number.isFinite(r.amountEur) && r.amountEur >= 0);

    const candidate = {
      options,
      dropInEnabled,
      dropInDates: dropInEnabled ? effectiveDropInDates.filter(Boolean).sort() : [],
    };
    const parsed = CampOptionsConfigSchema.safeParse(candidate);
    return parsed.success ? JSON.stringify(parsed.data) : JSON.stringify(candidate);
  }, [rows, dropInEnabled, effectiveDropInDates]);

  function addDropInPrice(kind: "daily_drop_in_half_day" | "daily_drop_in_full_day") {
    setRows((prev) => [
      ...prev,
      {
        localKey: newId(),
        label: kind === "daily_drop_in_half_day" ? "Drop-in half day" : "Drop-in full day",
        attendanceKind: kind,
        amountEur: "",
        forMembers: false,
      },
    ]);
  }

  function up(localKey: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)));
  }

  function remove(localKey: string) {
    setRows((prev) => prev.filter((r) => r.localKey !== localKey));
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="campOptionsJson" value={jsonValue} />

      {rows.map((row) => (
        <div key={row.localKey} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={row.label}
                onChange={(e) => up(row.localKey, { label: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Option type</Label>
              <select
                value={row.attendanceKind}
                onChange={(e) =>
                  up(row.localKey, {
                    attendanceKind: e.target.value as Row["attendanceKind"],
                  })
                }
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm"
              >
                <option value="full_week_half_day">Week · Half day</option>
                <option value="full_week_full_day">Week · Full day</option>
                <option value="daily_drop_in_half_day">Drop-in · Half day</option>
                <option value="daily_drop_in_full_day">Drop-in · Full day</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Price (EUR)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={row.amountEur}
                onChange={(e) => up(row.localKey, { amountEur: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={row.forMembers}
                onChange={(e) => up(row.localKey, { forMembers: e.currentTarget.checked })}
                className="h-3.5 w-3.5"
              />
              Member price
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(row.localKey)}>
              Remove
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addDropInPrice("daily_drop_in_half_day")}>
          Add drop-in half-day price
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addDropInPrice("daily_drop_in_full_day")}>
          Add drop-in full-day price
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--border)] p-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={dropInEnabled}
            onChange={(e) => setDropInEnabled(e.currentTarget.checked)}
            className="h-4 w-4"
          />
          Enable daily drop-in bookings
        </label>
        {dropInEnabled && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted-foreground)]">
              {scheduleDropInDates.length > 0
                ? "Drop-in dates match the camp week calendar — mark days off on the schedule step to remove them."
                : "Drop-in dates sync from the camp week when you save. On edit, they follow the saved schedule."}
            </p>
            {effectiveDropInDates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {effectiveDropInDates.map((iso) => (
                  <span
                    key={iso}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs tabular-nums"
                  >
                    {iso}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">
                No camp days in range yet — set the week on the schedule step first.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
