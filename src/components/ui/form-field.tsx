import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Bordered panel for grouped form fields (Liquid Paper: page → panel → control).
 */
export function FormPanel({
  className,
  children,
  variant = "default",
}: {
  className?: string;
  children: React.ReactNode;
  /** iOS grouped inset on mobile; classic panel on desktop. */
  variant?: "default" | "grouped";
}) {
  return (
    <div
      className={cn(
        variant === "grouped"
          ? "grouped-section divide-y divide-[var(--content-separator)] p-0 md:elev-panel md:grid md:gap-4 md:p-5 md:sm:grid-cols-2 md:sm:p-6"
          : "elev-panel grid gap-4 p-5 sm:grid-cols-2 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Standard label + control slot. Normal-case labels for readable hierarchy.
 */
export function FormField({
  label,
  name,
  required,
  wide,
  hint,
  className,
  children,
}: {
  label: string;
  name?: string;
  required?: boolean;
  wide?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5 px-4 py-3 md:px-0 md:py-0", wide && "sm:col-span-2", className)}>
      <Label
        htmlFor={name}
        className="text-sm font-medium text-[var(--foreground)]/80"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--destructive)]">*</span>
        )}
      </Label>
      {children}
      {hint && (
        <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}

/**
 * Two-column form section: display heading left, FormPanel right.
 */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <header className="space-y-1.5 px-1 md:px-0">
        <h2 className="font-display text-xl font-medium tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {description}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}
