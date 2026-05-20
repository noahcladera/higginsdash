"use client";

import * as React from "react";

/*
 * CalendarPagerTransition — a tiny client-side wrapper that re-mounts
 * its children whenever `pagerKey` changes and plays a directional
 * slide based on the new vs previous key.
 *
 * Why this lives in client land
 * -----------------------------
 * The week / day calendars are server-rendered: every prev/next click
 * is a `<Link>` that triggers an RSC navigation, replacing the grid
 * with the new week's HTML. To wrap that swap in motion without
 * pulling in a router-level transition library, we:
 *
 *   1. Take the current `pagerKey` (typically the ISO week string or
 *      day param) and `key` the rendered child by it. React unmounts
 *      the old subtree and mounts the new one.
 *   2. Compare current vs previous key with the consumer-supplied
 *      `compare(prev, next)` (returns "forward" | "back" | "same").
 *      This avoids assumptions about the key format — ISO weeks sort
 *      lexicographically, dates likewise.
 *   3. Apply `slide-from-right` for forward, `slide-from-left` for
 *      back, nothing for same — both keyframes are defined in
 *      globals.css with `--ease-out-soft` / `--duration-base`, and
 *      collapse to no-op under prefers-reduced-motion.
 *
 * The transition is intentionally subtle (16px, 240ms): enough to
 * telegraph "you went forward in time", short enough that it never
 * becomes the user's bottleneck.
 */
/**
 * `lex` — straight lexicographic compare. Works for ISO-week strings
 * ("2026-W17") and ISO-date strings ("2026-04-21") because both sort
 * chronologically as plain strings.
 *
 * `dateThenSlug` — keys shaped as `"<slug>:<YYYY-MM-DD>"`. Date is
 * the dominant axis (animation should reflect time travel first); the
 * slug is the tiebreaker so club swaps still slide.
 */
export type PagerCompareKind = "lex" | "dateThenSlug";

function compareKeys(
  prev: string,
  next: string,
  kind: PagerCompareKind,
): "forward" | "back" | "same" {
  if (prev === next) return "same";
  if (kind === "dateThenSlug") {
    const [prevSlug, prevDate] = prev.split(":");
    const [nextSlug, nextDate] = next.split(":");
    if (prevDate !== nextDate) return prevDate < nextDate ? "forward" : "back";
    return prevSlug < nextSlug ? "forward" : "back";
  }
  return prev < next ? "forward" : "back";
}

export function CalendarPagerTransition({
  pagerKey,
  compareKind,
  children,
}: {
  /** Stable string key — when it changes, the slide plays. */
  pagerKey: string;
  /**
   * Which direction comparator to use. See {@link PagerCompareKind} for
   * the available shapes. We take a string variant rather than a
   * function reference so this client component can be used from
   * Server Components without crossing the RSC serialization boundary
   * with a function prop.
   */
  compareKind: PagerCompareKind;
  children: React.ReactNode;
}) {
  // Track the last key we rendered so we can compute direction. Using
  // a ref avoids re-render churn — we only need the value at commit
  // time to set the className for the upcoming mount.
  const prevKeyRef = React.useRef<string>(pagerKey);
  const direction =
    prevKeyRef.current === pagerKey
      ? "same"
      : compareKeys(prevKeyRef.current, pagerKey, compareKind);

  React.useEffect(() => {
    prevKeyRef.current = pagerKey;
  }, [pagerKey]);

  const animClass =
    direction === "forward"
      ? "slide-from-right"
      : direction === "back"
        ? "slide-from-left"
        : "";

  return (
    <div key={pagerKey} className={animClass} data-pager-direction={direction}>
      {children}
    </div>
  );
}
