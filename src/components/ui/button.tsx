import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Button — Liquid Paper material controls.
 *
 * `variant` controls structure (filled / outline / ghost / link).
 * `tone` swaps the color family (neutral default, brand greens/terracotta,
 * status colors). Combine freely: `<Button variant="outline" tone="randwijck" />`.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium",
    "transition-all duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "active:scale-[0.98]",
  ].join(" "),
  {
    variants: {
      variant: {
        solid:
          "shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] [box-shadow:var(--shadow-sm),var(--highlight-inset)] hover:[box-shadow:var(--shadow-md),var(--highlight-inset)]",
        default:
          "shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] [box-shadow:var(--shadow-sm),var(--highlight-inset)] hover:[box-shadow:var(--shadow-md),var(--highlight-inset)]",
        secondary:
          "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-80",
        destructive:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)] shadow-[var(--shadow-sm)] hover:brightness-110",
        outline: "border bg-transparent",
        ghost: "bg-transparent",
        link: "underline-offset-4 hover:underline px-0 h-auto rounded-none active:scale-100",
      },
      tone: {
        neutral: "",
        triaz: "",
        randwijck: "",
        joint: "",
        success: "",
        danger: "",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-5",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    compoundVariants: [
      // Solid + tones
      {
        variant: "solid",
        tone: "neutral",
        class:
          "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90",
      },
      // Default alias = solid + neutral default (so old call sites keep working).
      {
        variant: "default",
        tone: "neutral",
        class:
          "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90",
      },
      {
        variant: "solid",
        tone: "triaz",
        class:
          "bg-gradient-to-b from-[oklch(0.48_0.13_155)] to-[var(--triaz)] text-white hover:brightness-110 shadow-[var(--shadow-triaz)]",
      },
      {
        variant: "solid",
        tone: "randwijck",
        class:
          "bg-gradient-to-b from-[oklch(0.58_0.16_40)] to-[var(--randwijck)] text-white hover:brightness-110 shadow-[var(--shadow-randwijck)]",
      },
      {
        variant: "solid",
        tone: "joint",
        class:
          "bg-gradient-to-b from-[oklch(0.46_0.13_260)] to-[var(--joint)] text-white hover:brightness-110 shadow-[var(--shadow-joint)]",
      },
      {
        variant: "solid",
        tone: "success",
        class: "bg-[var(--success)] text-white hover:brightness-110",
      },
      {
        variant: "solid",
        tone: "danger",
        class:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:brightness-110",
      },
      // Outline + tones
      {
        variant: "outline",
        tone: "neutral",
        class:
          "border-[var(--border-strong)] text-[var(--foreground)] hover:bg-[var(--surface)]",
      },
      {
        variant: "outline",
        tone: "triaz",
        class:
          "border-[var(--triaz)]/40 text-[var(--triaz-ink)] hover:bg-[var(--triaz-soft)]",
      },
      {
        variant: "outline",
        tone: "randwijck",
        class:
          "border-[var(--randwijck)]/40 text-[var(--randwijck-ink)] hover:bg-[var(--randwijck-soft)]",
      },
      {
        variant: "outline",
        tone: "joint",
        class:
          "border-[var(--joint)]/40 text-[var(--joint-ink)] hover:bg-[var(--joint-soft)]",
      },
      {
        variant: "outline",
        tone: "danger",
        class:
          "border-[var(--destructive)]/40 text-[var(--destructive)] hover:bg-[var(--danger-soft)]",
      },
      // Ghost + tones
      {
        variant: "ghost",
        tone: "neutral",
        class:
          "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]",
      },
      {
        variant: "ghost",
        tone: "triaz",
        class: "text-[var(--triaz-ink)] hover:bg-[var(--triaz-soft)]",
      },
      {
        variant: "ghost",
        tone: "randwijck",
        class:
          "text-[var(--randwijck-ink)] hover:bg-[var(--randwijck-soft)]",
      },
      {
        variant: "ghost",
        tone: "danger",
        class: "text-[var(--destructive)] hover:bg-[var(--danger-soft)]",
      },
      // Link + tones
      {
        variant: "link",
        tone: "neutral",
        class: "text-[var(--foreground)]",
      },
      {
        variant: "link",
        tone: "triaz",
        class: "text-[var(--triaz-ink)]",
      },
    ],
    defaultVariants: {
      variant: "solid",
      tone: "neutral",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, tone, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, tone, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
