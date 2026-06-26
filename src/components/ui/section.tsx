import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Section — the standardized "title + description + content" wrapper used
 * across the portal. Lays a consistent rhythm so pages feel like they're
 * all part of the same publication.
 *
 *   <Section title="Your household" description="…" action={<Link …/>}>
 *     <SomeCardGrid />
 *   </Section>
 *
 * Set `surface` to "card" for a tinted background (the default) or "bare"
 * for headings sitting directly on the page background.
 */
export function Section({
  id,
  title,
  description,
  action,
  surface = "bare",
  padding = "default",
  snap = true,
  className,
  children,
}: {
  /** Optional anchor id, useful for `#buy` style deep links. */
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  surface?: "bare" | "card" | "ghost";
  padding?: "default" | "compact" | "none";
  /**
   * When the parent scroll container has `scroll-snap-type` enabled,
   * each Section becomes a "soft stop" by default. Set `snap={false}`
   * for sections that intentionally shouldn't act as a snap anchor —
   * e.g. extremely tall content where a snap mid-scroll would feel
   * wrong. Has no effect when no ancestor opts into snapping.
   */
  snap?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const padCls =
    padding === "none" ? "" : padding === "compact" ? "p-4 sm:p-5" : "p-5 sm:p-7";
  const surfaceCls =
    surface === "card"
      ? "elev-panel"
      : surface === "ghost"
        ? "rounded-[var(--radius-lg)] bg-transparent"
        : "";

  return (
    <section
      id={id}
      className={cn(
        "fade-in scroll-mt-24",
        snap && "snap-start",
        surfaceCls,
        surface === "card" || surface === "ghost" ? padCls : "",
        className,
      )}
    >
      {(title || description || action) && (
        <header
          className={cn(
            "mb-4 flex flex-wrap items-end justify-between gap-3",
            surface === "bare" && "mb-3",
          )}
        >
          <div className="space-y-1">
            {title && (
              <h2 className="font-display text-[1.4rem] font-medium leading-tight tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-[var(--muted-foreground)]">
                {description}
              </p>
            )}
          </div>
          {action && (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * SectionDivider — a thin horizontal separator with optional label,
 * used to break up long stacks of sections (e.g. on the dashboard).
 */
export function SectionDivider({ label }: { label?: React.ReactNode }) {
  if (!label) {
    return <hr className="my-8 border-t border-[var(--border)]" />;
  }
  return (
    <div className="my-8 flex items-center gap-4">
      <hr className="flex-1 border-t border-[var(--border)]" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {label}
      </span>
      <hr className="flex-1 border-t border-[var(--border)]" />
    </div>
  );
}
