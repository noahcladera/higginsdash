import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[var(--radius-md)] bg-[var(--surface)] px-3.5 py-2 text-sm",
          "border border-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]",
          "transition-all duration-150 ease-out",
          "hover:bg-[var(--surface-strong)]",
          "focus:bg-[var(--card)] focus:border-[var(--triaz)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
