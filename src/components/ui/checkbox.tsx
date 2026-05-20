import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Checkbox — styled native checkbox aligned with the rest of the
 * portal's form primitives. We rely on the browser's native check
 * glyph via `accent-color` (instead of an inline SVG data URL) so
 * the style survives Turbopack's strict CSS parser.
 */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Checkbox({ className, style, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="checkbox"
      style={{ accentColor: "var(--triaz)", ...style }}
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded-[4px]",
        "border border-[var(--border-strong)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--triaz)]/40 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
