import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Card — Liquid Paper elevation primitive.
 *
 *   <Card>                    elevated card (default)
 *   <Card variant="glass">    frosted glass panel
 *   <Card variant="elevated"> explicit elevated card
 *   <Card variant="panel">    tinted panel (elev-1)
 *   <Card variant="solid">    bordered control well
 *   <Card variant="ghost">    transparent structure only
 */
function Card({
  className,
  variant = "default",
  padded = true,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "elevated" | "glass" | "panel" | "solid" | "ghost";
  padded?: boolean;
}) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        "rounded-[var(--radius-lg)] text-[var(--card-foreground)]",
        (variant === "default" || variant === "elevated") && "elev-card",
        variant === "glass" && "glass-panel",
        variant === "panel" && "elev-panel",
        variant === "solid" &&
          "bg-[var(--card)] border border-[var(--glass-border-subtle)] shadow-[var(--shadow-elevated)]",
        variant === "ghost" && "bg-transparent",
        padded && "p-6",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function CardTitle({
  className,
  ...props
}: React.ComponentProps<"h3"> & React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "font-display text-xl font-semibold leading-tight tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-[var(--muted-foreground)]", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("ml-auto flex items-center gap-2", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("text-sm text-[var(--foreground)]", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-4",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
