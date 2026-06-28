import * as React from "react";

import { cn } from "@/lib/utils";

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "regular" | "clear";
  interactive?: boolean;
  scrolled?: boolean;
}

export function GlassSurface({
  variant = "regular",
  interactive = false,
  scrolled = false,
  className,
  ...props
}: GlassSurfaceProps) {
  return (
    <div
      className={cn(
        variant === "clear" ? "glass-clear" : "glass-regular",
        scrolled && variant === "regular" && "glass-regular-scrolled",
        interactive && "glass-interactive",
        className,
      )}
      {...props}
    />
  );
}
