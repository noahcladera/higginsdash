/**
 * WizardTile — the big, opinionated tile used by every step of the
 * Browse-classes wizard.
 */

import * as React from "react";

import { MaterialTile } from "@/components/ui/material-tile";
import { cn } from "@/lib/utils";

interface WizardTileProps {
  href: string;
  title: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  meta?: React.ReactNode;
  tone?: "default" | "primary";
  locked?: boolean;
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
  return (
    <MaterialTile
      href={href}
      locked={locked}
      tone={tone === "primary" ? "primary" : "neutral"}
      className="min-h-[11rem]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]",
              "border border-[var(--glass-border-subtle)] bg-[var(--triaz-soft)]/80 text-[var(--triaz-ink)] shadow-[var(--highlight-inset-subtle)]",
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
      </div>
    </MaterialTile>
  );
}

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
