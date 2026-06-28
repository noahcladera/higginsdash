"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { useGlassSegmentPill } from "@/components/ui/use-glass-segment-pill";

export interface LinkSegmentedOption {
  value: string;
  label: string;
}

export interface LinkSegmentedControlProps {
  options: LinkSegmentedOption[];
  value: string;
  hrefFor: (value: string) => string;
  className?: string;
  "aria-label"?: string;
}

/** Segmented control where each segment is a native `<Link>` — reliable on iOS Safari. */
export function LinkSegmentedControl({
  options,
  value,
  hrefFor,
  className,
  "aria-label": ariaLabel,
}: LinkSegmentedControlProps) {
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
          <Link
            key={opt.value}
            href={hrefFor(opt.value)}
            role="tab"
            data-segment
            aria-selected={active}
            prefetch
            className={cn(
              "relative z-10 flex min-h-11 flex-1 touch-manipulation items-center justify-center rounded-full px-3 text-sm transition-colors",
              active
                ? "font-semibold text-[var(--foreground)]"
                : "font-medium text-[var(--muted-foreground)]",
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
