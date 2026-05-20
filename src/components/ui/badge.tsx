import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/*
 * Pill-shaped tonal badge. `tone` selects the color family; `variant`
 * picks soft (tinted bg + ink) vs solid (filled).
 *
 * `default` / `secondary` / `outline` are kept as legacy aliases so the
 * existing admin pages don't need to change.
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap",
    "rounded-full px-2.5 py-0.5 text-xs font-medium",
    "transition-colors",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral: "bg-[var(--surface-strong)] text-[var(--foreground)]",
        triaz: "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]",
        randwijck: "bg-[var(--randwijck-soft)] text-[var(--randwijck-ink)]",
        joint: "bg-[var(--joint-soft)] text-[var(--joint-ink)]",
        success: "bg-[var(--success-soft)] text-[var(--triaz-ink)]",
        warning: "bg-[var(--warning-soft)] text-[oklch(0.42_0.13_75)]",
        danger: "bg-[var(--danger-soft)] text-[var(--destructive)]",
      },
      variant: {
        soft: "",
        solid: "",
        outline:
          "bg-transparent text-[var(--muted-foreground)] border border-[var(--border-strong)]",
        // Legacy aliases — map to common cases.
        default: "bg-[var(--foreground)] text-[var(--background)]",
        secondary: "bg-[var(--surface-strong)] text-[var(--foreground)]",
        destructive:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)]",
        ghost: "bg-transparent text-[var(--muted-foreground)]",
        link: "bg-transparent text-[var(--foreground)] underline-offset-4 hover:underline",
      },
    },
    compoundVariants: [
      {
        variant: "solid",
        tone: "triaz",
        class: "bg-[var(--triaz)] text-white",
      },
      {
        variant: "solid",
        tone: "randwijck",
        class: "bg-[var(--randwijck)] text-white",
      },
      {
        variant: "solid",
        tone: "joint",
        class: "bg-[var(--joint)] text-white",
      },
      {
        variant: "solid",
        tone: "success",
        class: "bg-[var(--success)] text-white",
      },
      {
        variant: "solid",
        tone: "danger",
        class:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)]",
      },
      {
        variant: "solid",
        tone: "neutral",
        class: "bg-[var(--foreground)] text-[var(--background)]",
      },
    ],
    defaultVariants: {
      variant: "soft",
      tone: "neutral",
    },
  },
);

function Badge({
  className,
  variant,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-tone={tone}
      className={cn(badgeVariants({ variant, tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
