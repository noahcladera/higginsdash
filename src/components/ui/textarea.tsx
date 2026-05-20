import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-[var(--radius-md)] bg-[var(--surface)] px-3.5 py-2.5 text-sm",
        "border border-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]",
        "transition-all duration-150 ease-out resize-y",
        "hover:bg-[var(--surface-strong)]",
        "focus:bg-[var(--card)] focus:border-[var(--triaz)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
