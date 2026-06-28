"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useBackButtonClose } from "@/hooks/use-back-button-close";

/**
 * Sheet — the single mobile-first overlay primitive for the app.
 *
 * Why not Radix Dialog? On iPhone WebKit, Radix's portal + focus-scope
 * behavior produced invisible / un-tappable dialogs in this app. Sheet
 * renders through a plain `createPortal(document.body)` (which sidesteps
 * ancestor `transform`/`filter` containing-block bugs) and does its own
 * lightweight focus trap, scroll lock, Escape, and back-button dismissal.
 *
 * Layout: a bottom sheet on mobile (`< md`), a centered modal on desktop.
 * Pass `variant="sheet"` to force the bottom sheet at all sizes.
 */

let scrollLockCount = 0;
let savedBodyOverflow = "";

function lockBodyScroll() {
  if (typeof document === "undefined") return;
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
  }
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible label when no visible title is rendered. */
  ariaLabel?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** `adaptive` (default): sheet on mobile, modal on desktop. */
  variant?: "adaptive" | "sheet" | "dialog";
  showCloseButton?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function Sheet({
  open,
  onOpenChange,
  ariaLabel,
  title,
  description,
  children,
  footer,
  variant = "adaptive",
  showCloseButton = true,
  className,
  "data-testid": testId,
}: SheetProps) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const asSheet = variant === "sheet" || (variant === "adaptive" && !isDesktop);

  React.useEffect(() => setMounted(true), []);

  const close = React.useCallback(
    () => onOpenChange(false),
    [onOpenChange],
  );
  useBackButtonClose(open, close);

  // Scroll lock + initial focus + focus restoration.
  React.useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    lastFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    const panel = panelRef.current;
    const focusTarget =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    // Defer so the element exists + iOS keyboard doesn't fight the open.
    const id = window.setTimeout(() => focusTarget?.focus?.(), 0);
    return () => {
      window.clearTimeout(id);
      unlockBodyScroll();
      lastFocusedRef.current?.focus?.();
    };
  }, [open]);

  // Escape to close + Tab focus trap.
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60] bg-[var(--foreground)]/25 backdrop-blur-sm fade-in"
        aria-hidden
        data-testid={testId ? `${testId}-overlay` : undefined}
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid={testId}
        tabIndex={-1}
        className={cn(
          "glass-regular fixed z-[60] overflow-y-auto outline-none",
          asSheet
            ? "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[var(--radius-glass-inner)] border-b-0 p-6 pb-safe animate-sheet-in"
            : "left-1/2 top-1/2 max-h-[min(88dvh,720px)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-xl)] p-6 animate-modal-in",
          className,
        )}
      >
        {asSheet && (
          <div className="mb-3 flex justify-center" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-[var(--muted-foreground)]/30" />
          </div>
        )}

        {(title || description) && (
          <div className="mb-4 flex flex-col gap-1 pr-8">
            {title && (
              <h2 className="font-display text-xl font-medium leading-tight tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-[var(--muted-foreground)]">
                {description}
              </p>
            )}
          </div>
        )}

        {children}

        {footer && (
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}

        {showCloseButton && (
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full text-[var(--muted-foreground)] outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
