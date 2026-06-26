import { cn } from "@/lib/utils";

/** Shared shell for text inputs, native selects, and date fields. */
export const formControlClasses = cn(
  "control-well flex w-full rounded-[var(--radius-md)] px-3.5 text-sm",
  "text-[var(--foreground)]",
  "placeholder:text-[var(--muted-foreground)]",
  "transition-all duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]",
  "hover:border-[var(--border-strong)]",
  "focus-visible:border-[var(--triaz)]/50 focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
  "focus-visible:ring-offset-[var(--background)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const formControlHeightClasses = "h-11 py-2";

export function selectClassName(className?: string) {
  return cn(formControlClasses, formControlHeightClasses, className);
}
