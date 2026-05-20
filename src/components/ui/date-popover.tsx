"use client";

import * as React from "react";
import {
  addDaysIso,
  addYearsIso,
  clampIsoToMinMax,
  isIsoDateString,
  nextMondayIso,
  todayIso,
} from "@/lib/dates/segments";
import { cn } from "@/lib/utils";

export type DatePickerMode = "dob" | "future" | "any";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function localToIso(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}

function parseIsoToLocal(iso: string): { y: number; m0: number; d: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return { y, m0: mo, d };
}

/** Monday on or before the 1st of (y, m0). */
function calendarStart(y: number, m0: number): Date {
  const first = new Date(y, m0, 1);
  const dow = first.getDay(); // 0 Sun … 6 Sat
  const daysSinceMonday = (dow + 6) % 7;
  return new Date(y, m0, 1 - daysSinceMonday);
}

function weekdayShortLabels(locale: string): string[] {
  const base = new Date(2024, 0, 1); // Monday
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    labels.push(
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d),
    );
  }
  return labels;
}

export interface DatePickerPopoverProps {
  open: boolean;
  onClose: () => void;
  /** Wrapper element used to position the popover and to scope outside-click. */
  anchorEl: HTMLElement | null;
  locale: string;
  mode: DatePickerMode;
  /** Highlight + initial month when opening */
  valueIso: string;
  minIso?: string;
  maxIso?: string;
  onPick: (iso: string) => void;
}

export function DatePickerPopover({
  open,
  onClose,
  anchorEl,
  locale,
  mode,
  valueIso,
  minIso,
  maxIso,
  onPick,
}: DatePickerPopoverProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [flipUp, setFlipUp] = React.useState(false);
  const [alignRight, setAlignRight] = React.useState(false);
  const [viewY, setViewY] = React.useState(() => new Date().getFullYear());
  const [viewM0, setViewM0] = React.useState(() => new Date().getMonth());

  const today = todayIso();

  React.useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const panelH = 340; // rough — enough for grid + header + footer
    const panelW = 280;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    setFlipUp(spaceBelow < panelH + 12 && spaceAbove > spaceBelow);
    const overflowsRight = r.left + panelW > window.innerWidth - 8;
    setAlignRight(overflowsRight);
  }, [open, anchorEl]);

  React.useEffect(() => {
    if (!open) return;
    const parsed =
      valueIso && isIsoDateString(valueIso)
        ? parseIsoToLocal(valueIso)
        : null;
    if (parsed) {
      setViewY(parsed.y);
      setViewM0(parsed.m0);
      return;
    }
    if (mode === "dob") {
      const guess = addYearsIso(today, -30);
      const p = guess ? parseIsoToLocal(guess) : null;
      if (p) {
        setViewY(p.y);
        setViewM0(p.m0);
        return;
      }
    }
    const n = new Date();
    setViewY(n.getFullYear());
    setViewM0(n.getMonth());
  }, [open, mode, valueIso, today]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const el = panelRef.current;
      if (!el || el.contains(e.target as Node)) return;
      if (anchorEl?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose, anchorEl]);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("button[data-day]:not(:disabled)")
        ?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, viewY, viewM0]);

  if (!open) return null;

  const minY = minIso && isIsoDateString(minIso)
    ? Number(minIso.slice(0, 4))
    : mode === "dob" && maxIso && isIsoDateString(maxIso)
      ? Number(maxIso.slice(0, 4)) - 100
      : viewY - 80;
  const maxY = maxIso && isIsoDateString(maxIso)
    ? Number(maxIso.slice(0, 4))
    : mode === "dob"
      ? new Date().getFullYear()
      : viewY + 20;

  const years: number[] = [];
  for (let y = maxY; y >= minY; y--) years.push(y);

  const start = calendarStart(viewY, viewM0);
  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      iso: localToIso(d.getFullYear(), d.getMonth(), d.getDate()),
      inMonth: d.getMonth() === viewM0 && d.getFullYear() === viewY,
    });
  }

  const wk = weekdayShortLabels(locale);

  function cellDisabled(iso: string): boolean {
    if (!isIsoDateString(iso)) return true;
    if (minIso && isIsoDateString(minIso) && iso < minIso) return true;
    if (maxIso && isIsoDateString(maxIso) && iso > maxIso) return true;
    return false;
  }

  const quick =
    mode === "future"
      ? ([
          { label: "Today", iso: today },
          {
            label: "Tomorrow",
            iso: addDaysIso(today, 1) ?? today,
          },
          {
            label: "Next Mon",
            iso: nextMondayIso(today) ?? today,
          },
        ] as const)
      : null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Choose date"
      className={cn(
        "absolute z-[60] w-[280px] rounded-[var(--radius-lg)] bg-[var(--card)] p-3 shadow-[var(--shadow-lg)]",
        "border border-[var(--border)] outline-none animate-in fade-in-0",
        flipUp ? "bottom-full mb-1.5" : "top-full mt-1.5",
        alignRight ? "right-0" : "left-0",
      )}
      data-state="open"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {quick && (
        <div className="mb-2 flex flex-wrap gap-1">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={cellDisabled(q.iso)}
              onClick={() => {
                const v = clampIsoToMinMax(q.iso, minIso, maxIso);
                onPick(v);
                onClose();
              }}
              className={cn(
                "rounded-full border border-[var(--border)] px-2 py-0.5 text-xs",
                "hover:bg-[var(--muted)]/50 disabled:opacity-40",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <select
          aria-label="Month"
          className={cn(
            "min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm",
            "text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          )}
          value={viewM0}
          onChange={(e) => setViewM0(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, m) => (
            <option key={m} value={m}>
              {new Intl.DateTimeFormat(locale, { month: "long" }).format(
                new Date(2000, m, 1),
              )}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          className={cn(
            "w-[5.5rem] shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm",
            "text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          )}
          value={viewY}
          onChange={(e) => setViewY(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {wk.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {cells.map(({ iso, inMonth }) => {
          const dis = cellDisabled(iso);
          const selected = valueIso === iso && isIsoDateString(iso);
          return (
            <button
              key={iso + String(inMonth)}
              type="button"
              data-day={iso}
              disabled={dis}
              onClick={() => {
                const v = clampIsoToMinMax(iso, minIso, maxIso);
                onPick(v);
                onClose();
              }}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-sm tabular-nums",
                inMonth
                  ? "text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)]/60",
                selected &&
                  "bg-[var(--triaz)] text-[var(--triaz-ink)] font-medium",
                !selected &&
                  !dis &&
                  "hover:bg-[var(--muted)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                dis && "cursor-not-allowed opacity-30",
              )}
            >
              {iso.slice(8, 10).replace(/^0/, "")}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between gap-2">
        <button
          type="button"
          className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline"
          onClick={() => {
            const p = new Date(viewY, viewM0 - 1, 1);
            setViewY(p.getFullYear());
            setViewM0(p.getMonth());
          }}
        >
          ← Prev
        </button>
        <button
          type="button"
          className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline"
          onClick={() => {
            const p = new Date(viewY, viewM0 + 1, 1);
            setViewY(p.getFullYear());
            setViewM0(p.getMonth());
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
