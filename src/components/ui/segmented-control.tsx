"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useGlassSegmentPill } from "@/components/ui/use-glass-segment-pill";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const activeIndex = options.findIndex((o) => o.value === value);

  const pillStyle = useGlassSegmentPill(
    containerRef,
    "[data-segment]",
    activeIndex,
    [options, value],
  );

  const showPill = pillStyle.width > 0;

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "glass-clear relative inline-flex w-full rounded-full p-1",
        "shadow-[var(--glass-regular-shadow)]",
        className,
      )}
    >
      {showPill && (
        <span
          aria-hidden
          className="glass-segment-pill pointer-events-none absolute top-1 bottom-1 rounded-full transition-[left,width] duration-[var(--duration-base)] ease-[var(--glass-spring)] motion-reduce:transition-none"
          style={{ left: pillStyle.left, width: pillStyle.width }}
        />
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            data-segment
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 min-h-11 flex-1 touch-manipulation rounded-full px-3 text-sm transition-colors",
              active
                ? "font-semibold text-[var(--foreground)]"
                : "font-medium text-[var(--muted-foreground)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
