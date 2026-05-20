import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Card — borderless on a tinted surface by default.
 *
 *   <Card>            tinted, no border, soft elevation
 *   <Card variant="solid">   on `--card` background with hairline border
 *   <Card variant="ghost">   transparent, no shadow (just structure)
 *
 * `padded` toggles the standard 24px gutter; turn off to lay out content
 * edge-to-edge (e.g. tables that handle their own padding).
 */
function Card({
  className,
  variant = "default",
  padded = true,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "solid" | "ghost";
  padded?: boolean;
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-[var(--radius-lg)] text-[var(--card-foreground)]",
        variant === "default" &&
          "bg-[var(--surface)] shadow-[var(--shadow-sm)]",
        variant === "solid" &&
          "bg-[var(--card)] border border-[var(--border)] shadow-[var(--shadow-sm)]",
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
        "flex items-center gap-2 border-t border-[var(--border)] pt-4 mt-4",
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
