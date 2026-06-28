"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Client-side overlay state for sheets / menus / pickers.
 *
 * The previous mobile pass drove every overlay through the URL
 * (`router.replace(?more=1)` etc). Because portal/coach pages are async
 * Server Components that read `searchParams`, toggling a param re-ran the
 * page's DB queries — so opening a menu felt like a full page refresh.
 *
 * This provider keeps overlay state purely client-side, but still pushes a
 * *same-URL* History entry (`history.pushState(state, "", location.href)`)
 * so the hardware/browser back button closes the top overlay. Pushing the
 * same URL adds a back-stack entry WITHOUT changing the visible URL and
 * WITHOUT triggering a Next.js navigation / RSC refetch.
 *
 * Genuine deep links (cold-load `?slot=`, payment success) are unaffected:
 * they are resolved server-side on first paint by the page itself.
 */

interface OverlayContextValue {
  /** Ordered stack of currently-open overlay keys (last = top). */
  stack: string[];
  isOpen: (key: string) => boolean;
  open: (key: string) => void;
  close: (key: string) => void;
  toggle: (key: string) => void;
}

const OverlayContext = React.createContext<OverlayContextValue | null>(null);

interface OverlayHistoryState {
  __overlayStack?: string[];
}

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = React.useState<string[]>([]);
  const pathname = usePathname();
  const stackRef = React.useRef(stack);
  stackRef.current = stack;

  // Back button: a popstate that lands on a smaller (or absent) overlay
  // stack means the user dismissed the top overlay. We trust the state
  // object we stored on push; fall back to empty when missing.
  React.useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as OverlayHistoryState | null;
      const next = Array.isArray(state?.__overlayStack)
        ? state!.__overlayStack!
        : [];
      setStack(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // A real route change (Link / router navigation) should dismiss any open
  // overlays without leaving dangling history entries.
  const prevPathRef = React.useRef(pathname);
  React.useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      if (stackRef.current.length > 0) setStack([]);
    }
  }, [pathname]);

  const open = React.useCallback((key: string) => {
    const current = stackRef.current;
    if (current.includes(key)) return;
    const next = [...current, key];
    setStack(next);
    if (typeof window !== "undefined") {
      window.history.pushState(
        { ...(window.history.state ?? {}), __overlayStack: next },
        "",
        window.location.href,
      );
    }
  }, []);

  const close = React.useCallback((key: string) => {
    const current = stackRef.current;
    if (!current.includes(key)) return;
    // Closing the top overlay: pop the history entry so back-stack stays
    // consistent. popstate will sync `stack` to the previous value.
    if (current[current.length - 1] === key && typeof window !== "undefined") {
      window.history.back();
      return;
    }
    // Closing a non-top overlay (rare): just drop it from the set.
    setStack(current.filter((k) => k !== key));
  }, []);

  const toggle = React.useCallback(
    (key: string) => {
      if (stackRef.current.includes(key)) close(key);
      else open(key);
    },
    [open, close],
  );

  const isOpen = React.useCallback(
    (key: string) => stack.includes(key),
    [stack],
  );

  const value = React.useMemo<OverlayContextValue>(
    () => ({ stack, isOpen, open, close, toggle }),
    [stack, isOpen, open, close, toggle],
  );

  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
}

/**
 * Subscribe a single overlay to the shared provider.
 *
 * Returns `{ open, setOpen, openSheet, closeSheet, toggle }` where `open`
 * is the boolean state. Safe to call outside a provider (degrades to local
 * state) so isolated components don't crash in tests / storybook.
 */
export function useOverlay(key: string) {
  const ctx = React.useContext(OverlayContext);
  const [localOpen, setLocalOpen] = React.useState(false);

  const open = ctx ? ctx.isOpen(key) : localOpen;

  const openSheet = React.useCallback(() => {
    if (ctx) ctx.open(key);
    else setLocalOpen(true);
  }, [ctx, key]);

  const closeSheet = React.useCallback(() => {
    if (ctx) ctx.close(key);
    else setLocalOpen(false);
  }, [ctx, key]);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (next) openSheet();
      else closeSheet();
    },
    [openSheet, closeSheet],
  );

  const toggle = React.useCallback(() => {
    if (ctx) ctx.toggle(key);
    else setLocalOpen((v) => !v);
  }, [ctx, key]);

  return { open, setOpen, openSheet, closeSheet, toggle };
}
