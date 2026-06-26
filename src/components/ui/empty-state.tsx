import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * EmptyState — friendly placeholder for "you don't have anything yet"
 * surfaces. Replaces the dashed-border empty cards across the portal.
 *
 *   <EmptyState
 *     icon={<CalendarIcon />}
 *     title="No bookings yet"
 *     description="Reserve a court when you're ready to play."
 *     action={<Link href="/portal/book">Book a court</Link>}
 *   />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "elev-card flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--glass-border-subtle)] bg-[var(--surface-strong)] text-[var(--muted-foreground)] shadow-[var(--highlight-inset-subtle)]">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-medium tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
