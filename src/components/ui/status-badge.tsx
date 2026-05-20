import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { StatusTone } from "@/lib/ui/status-tone";

/**
 * Small status pill — wraps Badge with consistent soft styling.
 */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge tone={tone} variant="soft" className={className}>
      {children}
    </Badge>
  );
}
