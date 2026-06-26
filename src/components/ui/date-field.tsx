"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clampIsoToMinMax,
  getSegmentOrder,
  isIsoDateString,
  isoToSegments,
  parsePastedText,
  segmentsToIso,
  todayIso,
  type SegmentKey,
  type Segments,
} from "@/lib/dates/segments";
import { DatePickerPopover, type DatePickerMode } from "@/components/ui/date-popover";

export type { DatePickerMode as DateMode };

export interface DateFieldProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  onCommit?: (iso: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: { d?: string; m?: string; y?: string };
  mode?: DatePickerMode;
  min?: string;
  max?: string;
  locale?: string;
  className?: string;
  hideCalendarButton?: boolean;
  /** Shorter pill-shaped control (e.g. booking header toolbars). */
  size?: "default" | "compact";
}

const MAX_LEN: Record<SegmentKey, number> = { d: 2, m: 2, y: 4 };

function segmentSpinRange(
  key: SegmentKey,
  segs: Segments,
): { min: number; max: number } | null {
  if (key === "y") return { min: 1, max: 9999 };
  const yStr = segs.y.trim();
  const mStr = segs.m.trim();
  const y = yStr.length >= 4 ? Number(yStr.slice(0, 4)) : new Date().getFullYear();
  const m = mStr ? Number(mStr) : 1;
  if (key === "m") return { min: 1, max: 12 };
  if (key === "d") {
    const mo = Math.min(12, Math.max(1, m || 1));
    const yy = Number.isFinite(y) && y >= 1 ? y : new Date().getFullYear();
    const dim = new Date(yy, mo, 0).getDate();
    return { min: 1, max: dim };
  }
  return null;
}

export function DateField({
  name,
  value,
  defaultValue = "",
  onChange,
  onCommit,
  id,
  required,
  disabled,
  placeholder = { d: "DD", m: "MM", y: "YYYY" },
  mode = "any",
  min,
  max,
  locale = "en-NL",
  className,
  hideCalendarButton,
  size = "default",
}: DateFieldProps) {
  const isControlled = value !== undefined;
  const today = todayIso();
  const maxIso = max ?? (mode === "dob" ? today : undefined);
  const minIso = min ?? (mode === "future" ? today : undefined);

  const [innerIso, setInnerIso] = React.useState(defaultValue);
  const committedIso = isControlled ? (value ?? "") : innerIso;
  const latestIsoRef = React.useRef(committedIso);
  latestIsoRef.current = committedIso;

  const [segments, setSegments] = React.useState<Segments>(() =>
    isoToSegments(committedIso),
  );
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const segRefs = {
    d: React.useRef<HTMLInputElement>(null),
    m: React.useRef<HTMLInputElement>(null),
    y: React.useRef<HTMLInputElement>(null),
  };

  React.useEffect(() => {
    if (!isControlled) return;
    setSegments(isoToSegments(value ?? ""));
  }, [isControlled, value]);

  const order = React.useMemo(() => getSegmentOrder(locale), [locale]);

  const setCommitted = React.useCallback(
    (iso: string, opts?: { commit?: boolean }) => {
      const clamped = clampIsoToMinMax(iso, minIso, maxIso);
      const next = clamped && isIsoDateString(clamped) ? clamped : "";
      if (!isControlled) setInnerIso(next);
      onChange?.(next);
      setSegments(isoToSegments(next));
      if (opts?.commit) onCommit?.(next);
    },
    [isControlled, minIso, maxIso, onChange, onCommit],
  );

  const tryParseAndCommit = React.useCallback(
    (segs: Segments, opts?: { commit?: boolean }) => {
      const empty =
        !segs.d.trim() && !segs.m.trim() && !segs.y.trim();
      if (empty) {
        setCommitted("", opts);
        return;
      }
      const pivot = new Date().getFullYear();
      const raw = segmentsToIso(segs, { pivotYear: pivot });
      if (!raw || !isIsoDateString(raw)) {
        setSegments(isoToSegments(latestIsoRef.current));
        return;
      }
      setCommitted(raw, opts);
    },
    [setCommitted],
  );

  const hiddenValue = React.useMemo(() => {
    const empty =
      !segments.d.trim() &&
      !segments.m.trim() &&
      !segments.y.trim();
    if (empty) return "";
    const pivot = new Date().getFullYear();
    const raw = segmentsToIso(segments, { pivotYear: pivot });
    if (!raw || !isIsoDateString(raw)) return "";
    return clampIsoToMinMax(raw, minIso, maxIso);
  }, [segments, minIso, maxIso]);

  const outOfRange =
    hiddenValue &&
    ((minIso && isIsoDateString(minIso) && hiddenValue < minIso) ||
      (maxIso && isIsoDateString(maxIso) && hiddenValue > maxIso));

  function setSeg(key: SegmentKey, v: string) {
    const digits = v.replace(/\D/g, "");
    const cap = MAX_LEN[key];
    const next = digits.slice(0, cap);
    setSegments((prev) => {
      const merged = { ...prev, [key]: next };
      const pivot = new Date().getFullYear();
      const iso = segmentsToIso(merged, { pivotYear: pivot });
      if (
        merged.d.length === 2 &&
        merged.m.length === 2 &&
        merged.y.length === 4 &&
        iso &&
        isIsoDateString(iso)
      ) {
        const clamped = clampIsoToMinMax(iso, minIso, maxIso);
        if (isIsoDateString(clamped)) {
          queueMicrotask(() => {
            if (!isControlled) setInnerIso(clamped);
            onChange?.(clamped);
            onCommit?.(clamped);
          });
          return isoToSegments(clamped);
        }
      }
      return merged;
    });
  }

  function focusSeg(key: SegmentKey) {
    segRefs[key].current?.focus();
  }

  function segAt(idx: number): SegmentKey {
    return order[idx]!;
  }

  function focusNeighbor(cur: SegmentKey, delta: number) {
    const idx = order.indexOf(cur);
    const n = order[idx + delta];
    if (n) focusSeg(n);
  }

  function onSegKeyDown(key: SegmentKey, e: React.KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    if (e.key === "ArrowLeft" && el.selectionStart === 0) {
      e.preventDefault();
      focusNeighbor(key, -1);
    } else if (e.key === "ArrowRight" && el.selectionStart === el.value.length) {
      e.preventDefault();
      focusNeighbor(key, 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const r = segmentSpinRange(key, segments);
      if (!r) return;
      const cur = Number(segments[key]) || r.min;
      const next =
        e.key === "ArrowUp"
          ? Math.min(r.max, cur + 1)
          : Math.max(r.min, cur - 1);
      setSeg(key, String(next));
    } else if (e.key === "Backspace" && el.value === "") {
      e.preventDefault();
      focusNeighbor(key, -1);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const t = e.clipboardData.getData("text");
    const parsed = parsePastedText(t, locale);
    if (parsed) {
      e.preventDefault();
      setSegments(parsed);
      tryParseAndCommit(parsed, { commit: true });
    }
  }

  function onBlurWrap() {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (wrapRef.current?.contains(active)) return;
      tryParseAndCommit(segments, { commit: true });
    }, 0);
  }

  const spinFor = (key: SegmentKey) => {
    const r = segmentSpinRange(key, segments);
    const v = segments[key];
    const n = v === "" ? null : Number(v);
    return {
      role: "spinbutton" as const,
      "aria-valuemin": r?.min,
      "aria-valuemax": r?.max,
      "aria-valuenow": n !== null && Number.isFinite(n) ? n : undefined,
    };
  };

  const segmentInput = (key: SegmentKey) => (
    <input
      key={key}
      ref={segRefs[key]}
      id={key === order[0] ? id : undefined}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      aria-required={required}
      aria-label={key === "d" ? "Day" : key === "m" ? "Month" : "Year"}
      placeholder={placeholder[key]}
      value={segments[key]}
      onChange={(e) => setSeg(key, e.target.value)}
      onKeyDown={(e) => onSegKeyDown(key, e)}
      onBlur={onBlurWrap}
      {...spinFor(key)}
      className={cn(
        "w-0 min-w-0 flex-1 bg-transparent text-center text-sm tabular-nums text-[var(--foreground)] outline-none",
        "placeholder:text-[var(--muted-foreground)]",
        outOfRange && "text-[var(--destructive)]",
      )}
    />
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={hiddenValue}
          readOnly
          required={required}
        />
      ) : null}
      <div
        ref={anchorRef}
        className={cn(
          "flex min-w-0 items-center gap-0.5 border border-[var(--border)] bg-[var(--control)] px-2 text-sm transition-all duration-150",
          size === "compact"
            ? "h-9 rounded-full"
            : "h-11 rounded-[var(--radius-md)]",
          "hover:border-[var(--border-strong)]",
          "focus-within:border-[var(--triaz)]/50 focus-within:ring-2 focus-within:ring-[var(--ring)] focus-within:ring-offset-1 focus-within:ring-offset-[var(--background)]",
          disabled && "pointer-events-none opacity-50",
          outOfRange && "border-[var(--destructive)]/40",
        )}
        onPaste={onPaste}
      >
        {order.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 ? (
              <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
            ) : null}
            <div className="flex min-w-[2.25rem] max-w-[4.5rem] flex-1 justify-center">
              {segmentInput(k)}
            </div>
          </React.Fragment>
        ))}
        {!hideCalendarButton && (
          <button
            type="button"
            disabled={disabled}
            aria-label="Open calendar"
            onClick={() => setPopoverOpen((o) => !o)}
            className={cn(
              "ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            )}
          >
            <CalendarIcon className="size-4" />
          </button>
        )}
      </div>
      <DatePickerPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        anchorEl={anchorRef.current}
        locale={locale}
        mode={mode}
        valueIso={
          hiddenValue && isIsoDateString(hiddenValue) ? hiddenValue : ""
        }
        minIso={minIso}
        maxIso={maxIso}
        onPick={(iso) => {
          setCommitted(iso, { commit: true });
          setPopoverOpen(false);
        }}
      />
    </div>
  );
}

export interface DateRangeFieldProps {
  startName?: string;
  endName?: string;
  startValue?: string;
  endValue?: string;
  startDefaultValue?: string;
  endDefaultValue?: string;
  onChange?: (range: { start: string; end: string }) => void;
  mode?: DatePickerMode;
  min?: string;
  max?: string;
  locale?: string;
  className?: string;
  startLabel?: string;
  endLabel?: string;
  startId?: string;
  endId?: string;
  disabled?: boolean;
  required?: boolean;
}

export function DateRangeField({
  startName,
  endName,
  startValue,
  endValue,
  startDefaultValue = "",
  endDefaultValue = "",
  onChange,
  mode = "any",
  min,
  max,
  locale = "en-NL",
  className,
  startLabel = "Start",
  endLabel = "End",
  startId,
  endId,
  disabled,
  required,
}: DateRangeFieldProps) {
  const isControlled =
    startValue !== undefined && endValue !== undefined;
  const [inner, setInner] = React.useState({
    start: startDefaultValue,
    end: endDefaultValue,
  });
  const start = isControlled ? (startValue ?? "") : inner.start;
  const end = isControlled ? (endValue ?? "") : inner.end;

  const rangeError =
    start &&
    end &&
    isIsoDateString(start) &&
    isIsoDateString(end) &&
    end < start;

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div className="space-y-1.5">
        <label
          htmlFor={startId}
          className="text-xs text-[var(--muted-foreground)]"
        >
          {startLabel}
          {required ? " *" : ""}
        </label>
        <DateField
          id={startId}
          name={startName}
          value={isControlled ? start : undefined}
          defaultValue={!isControlled ? startDefaultValue : undefined}
          onChange={(iso) => {
            if (isControlled) onChange?.({ start: iso, end });
            else
              setInner((r) => {
                const next = { ...r, start: iso };
                onChange?.(next);
                return next;
              });
          }}
          mode={mode}
          min={min}
          max={max}
          locale={locale}
          disabled={disabled}
          required={required}
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor={endId}
          className="text-xs text-[var(--muted-foreground)]"
        >
          {endLabel}
          {required ? " *" : ""}
        </label>
        <DateField
          id={endId}
          name={endName}
          value={isControlled ? end : undefined}
          defaultValue={!isControlled ? endDefaultValue : undefined}
          onChange={(iso) => {
            if (isControlled) onChange?.({ start, end: iso });
            else
              setInner((r) => {
                const next = { ...r, end: iso };
                onChange?.(next);
                return next;
              });
          }}
          mode={mode}
          min={start || min}
          max={max}
          locale={locale}
          disabled={disabled}
          required={required}
        />
      </div>
      {rangeError && (
        <p className="text-sm text-[var(--destructive)] sm:col-span-2">
          End date must be on or after the start date.
        </p>
      )}
    </div>
  );
}
