import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * PageHeader — the visual signature on top of every portal/coach page.
 *
 *   <PageHeader
 *     kicker="Membership"
 *     title="Your memberships"
 *     description="Active coverage and the clubs it includes."
 *     actions={<Button>New booking</Button>}
 *   />
 *
 * The kicker is a small uppercase tracker label that orients the user;
 * the title is set in the display serif at h1 size; description sits
 * beneath in the muted body color. Actions float to the right on wide
 * viewports and stack underneath on mobile.
 */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
  align = "left",
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        align === "center" && "sm:items-center sm:justify-center sm:text-center",
        className,
      )}
    >
      <div className="space-y-2">
        {kicker && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--triaz-ink)]">
            {kicker}
          </div>
        )}
        <h1 className="font-display text-[2.25rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]">
          {title}
        </h1>
        {description && (
          <p className="max-w-prose text-base text-[var(--muted-foreground)]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}
