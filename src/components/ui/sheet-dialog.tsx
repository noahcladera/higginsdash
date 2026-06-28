"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";

/**
 * Drop-in, Sheet-backed replacement for the Radix `Dialog` compound API.
 *
 * Member/coach mobile flows import these instead of `@/components/ui/dialog`
 * so every overlay routes through the one reliable native `Sheet` primitive
 * (bottom sheet on mobile, centered modal on desktop) — no Radix portal,
 * which was unreliable on iPhone WebKit. The API mirrors the Radix one
 * (`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`,
 * `DialogDescription`, `DialogFooter`, `DialogClose`) so call sites only
 * swap their import. Admin/desktop-only surfaces keep using Radix.
 */

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext(component: string): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <Dialog>`);
  }
  return ctx;
}

export function Dialog({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolled;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const value = React.useMemo(() => ({ open, setOpen }), [open, setOpen]);
  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}

export function DialogTrigger({
  asChild,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = useDialogContext("DialogTrigger");
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      {...props}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);
        if (!e.defaultPrevented) setOpen(true);
      }}
    >
      {children}
    </Comp>
  );
}

export function DialogClose({
  asChild,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = useDialogContext("DialogClose");
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      {...props}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);
        if (!e.defaultPrevented) setOpen(false);
      }}
    >
      {children}
    </Comp>
  );
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  className?: string;
  children: React.ReactNode;
  /** Kept for API parity with the Radix variant prop; always adaptive here. */
  variant?: "dialog" | "sheet";
  showCloseButton?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  const { open, setOpen } = useDialogContext("DialogContent");
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      variant="adaptive"
      showCloseButton={showCloseButton}
      ariaLabel={ariaLabel}
      data-testid={testId}
      className={className}
    >
      {children}
    </Sheet>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mb-4 flex flex-col gap-1.5 pr-8", className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-display text-xl font-medium leading-tight tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-sm text-[var(--muted-foreground)]", className)}
      {...props}
    />
  );
}
