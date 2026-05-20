/**
 * WizardTile — the big, opinionated tile used by every step of the
 * Browse-classes wizard.
 *
 * Why it exists: the previous filter UX was a row of cramped pills
 * with low contrast. A wizard with one big choice per step is way
 * easier to scan, especially on mobile where the user has been
 * swimming through a sea of pickers.
 *
 * Three variants:
 *   - default  → clickable card linking to `href`
 *   - primary  → same, with a subtle accent border to highlight the
 *                "expected" path (e.g. recommended)
 *   - locked   → renders as a non-clickable div, dimmed, with a lock
 *                icon and an inline `lockedNote` (typically a CTA
 *                that DOES point somewhere actionable, e.g.
 *                "Add a child to unlock").
 *
 * Animation lives at the parent level — the wizard fades the whole
 * step in via the global `.fade-in` keyframe so the tiles themselves
 * stay free of layout-shift trickery.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface WizardTileProps {
  /** Where the tile leads. Ignored when `locked` is true. */
  href: string;
  title: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  /** Optional small chip on the bottom-right (e.g. "8 classes available"). */
  meta?: React.ReactNode;
  tone?: "default" | "primary";
  locked?: boolean;
  /**
   * Inline message rendered below the description when `locked` is
   * true. Should contain its own actionable Link so the user has a
   * real way out.
   */
  lockedNote?: React.ReactNode;
}

export function WizardTile({
  href,
  title,
  description,
  icon,
  meta,
  tone = "default",
  locked = false,
  lockedNote,
}: WizardTileProps) {
  const baseShell = cn(
    // Layout
    "group relative flex h-full flex-col gap-4 p-6 text-left",
    "min-h-[11rem] rounded-[var(--radius-lg)]",
    // Surface
    "border bg-[var(--card)] text-[var(--foreground)]",
    "shadow-[var(--shadow-sm)]",
    // Border tone
    tone === "primary"
      ? "border-[var(--triaz)]/30"
      : "border-[var(--border)]",
  );

  const interactiveShell = cn(
    "transition-all duration-200",
    "hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
    "hover:border-[var(--triaz)]/50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--triaz)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
  );

  const lockedShell = "opacity-60 cursor-not-allowed select-none";

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]",
            "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]",
          )}
          aria-hidden
        >
          {icon}
        </span>
        {locked ? (
          <LockGlyph className="text-[var(--muted-foreground)]" />
        ) : (
          <ArrowGlyph className="text-[var(--muted-foreground)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--triaz-ink)]" />
        )}
      </div>

      <div className="space-y-1.5">
        <h3 className="font-display text-xl font-medium tracking-tight text-[var(--foreground)]">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          {description}
        </p>
      </div>

      {(meta || (locked && lockedNote)) && (
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          {locked && lockedNote ? (
            <div className="text-xs leading-relaxed text-[var(--foreground)]">
              {lockedNote}
            </div>
          ) : (
            <span />
          )}
          {meta && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {meta}
            </span>
          )}
        </div>
      )}
    </>
  );

  if (locked) {
    return (
      <div
        className={cn(baseShell, lockedShell)}
        aria-disabled
        data-state="locked"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      className={cn(baseShell, interactiveShell)}
    >
      {inner}
    </Link>
  );
}

// Tiny inline glyphs so we don't have to plumb new icons through the
// shared icon set just for this primitive.

function LockGlyph({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function ArrowGlyph({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}
