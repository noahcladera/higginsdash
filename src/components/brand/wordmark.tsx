import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Brand wordmark — display serif name with an accent dot on a chosen
 * letter, plus an Inter caps subline. Renders as plain text so it scales
 * crisply at any size and inherits the current text color.
 *
 * The component is purely presentational: callers (typically the
 * `BrandWordmark` server wrapper) feed it a `title` and `subline`
 * sourced from the active tenant's branding row. There are no built-in
 * defaults — passing nothing renders an empty wordmark.
 *
 * Example rendering for `title="Higgins"` / `accentLetter="i"`:
 *
 *   "Higg" + <i with ball dot> + "ns"
 *   "Tennis Nederland"
 */
export interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  withSubline?: boolean;
  className?: string;
  /** Full display name. Always passed by callers via the tenant brand. */
  title: string;
  /** Letter to render with the accent dot. Defaults to the first
   *  recognisable vowel-ish letter (`"i"`) — callers can override with
   *  the first letter of their own brand. */
  accentLetter?: string;
  /** Caps subline under the title. Optional; when absent the second
   *  line is omitted entirely. */
  subline?: string;
  /**
   * Optional tenant-uploaded logo URL. When provided, renders an image
   * wordmark instead of the text + accent-dot version. The text title /
   * subline are still used for `alt` text and as a fallback if the
   * image fails to load.
   */
  logoUrl?: string;
}

export function Wordmark({
  size = "md",
  withSubline = true,
  className,
  title,
  accentLetter = "i",
  subline,
  logoUrl,
}: WordmarkProps) {
  const titleSize =
    size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-2xl";
  const sublineSize =
    size === "sm" ? "text-[8px]" : size === "lg" ? "text-[10px]" : "text-[9px]";
  const logoHeight =
    size === "sm" ? "h-6" : size === "lg" ? "h-12" : "h-9";

  if (logoUrl) {
    const altText = subline ? `${title} — ${subline}` : title;
    return (
      <div className={cn("flex flex-col leading-none", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={altText}
          className={cn("w-auto object-contain", logoHeight)}
        />
      </div>
    );
  }

  // Split the title at the first occurrence of `accentLetter` so we can
  // render the decorative ball on top of it. Falls back to no-accent
  // rendering when the letter isn't found.
  const idx = title.indexOf(accentLetter);
  const head = idx >= 0 ? title.slice(0, idx) : title;
  const letter = idx >= 0 ? title.slice(idx, idx + 1) : "";
  const tail = idx >= 0 ? title.slice(idx + 1) : "";

  return (
    <div className={cn("flex flex-col leading-none", className)}>
      <span
        className={cn(
          "font-display font-semibold tracking-[-0.02em] text-[var(--foreground)]",
          titleSize,
        )}
      >
        {head}
        {letter && (
          <span className="relative">
            {letter}
            <span
              aria-hidden
              className={cn(
                "absolute left-1/2 -translate-x-1/2 rounded-full bg-[var(--triaz)]",
                size === "sm"
                  ? "-top-1 h-1.5 w-1.5"
                  : size === "lg"
                    ? "-top-2 h-2.5 w-2.5"
                    : "-top-1.5 h-2 w-2",
              )}
            />
          </span>
        )}
        {tail}
      </span>
      {withSubline && subline && (
        <span
          className={cn(
            "mt-1 font-sans font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]",
            sublineSize,
          )}
        >
          {subline}
        </span>
      )}
    </div>
  );
}
