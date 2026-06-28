"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/*
 * NavigationProgress — a thin, app-wide top progress bar.
 *
 * App Router navigations are async Server Component fetches: when a user
 * taps a link to a heavy page (e.g. the program/series enroll page), the
 * old page stays painted until the new RSC payload is ready. Without a
 * cue the tap feels dead. This bar acknowledges every navigation in one
 * frame and completes when the new route commits.
 *
 * Start is detected two ways:
 *   1. A capture-phase click on any internal same-origin `<a>` (covers all
 *      `next/link` taps without wiring each link).
 *   2. `startNavProgress()` for programmatic `router.push/replace` (the few
 *      spots that navigate without an anchor — enroll success redirect,
 *      booking date jumps, checkout).
 *
 * Completion is keyed off `usePathname()` + `useSearchParams()` changing,
 * which also covers back/forward (popstate).
 */

const NAV_START_EVENT = "higgins:nav-start";

/**
 * Trigger the global navigation progress bar for a programmatic navigation.
 * Call immediately before `router.push` / `router.replace`. Safe anywhere
 * on the client (no-op on the server / before mount).
 */
export function startNavProgress() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NAV_START_EVENT));
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [visible, setVisible] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const activeRef = React.useRef(false);
  const trickleRef = React.useRef<number | null>(null);
  const hideRef = React.useRef<number | null>(null);
  const safetyRef = React.useRef<number | null>(null);

  const clearTimer = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current != null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const finish = React.useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimer(trickleRef);
    clearTimer(safetyRef);
    setProgress(100);
    setDone(true);
    clearTimer(hideRef);
    hideRef.current = window.setTimeout(() => {
      setVisible(false);
      setDone(false);
      setProgress(0);
    }, 240);
  }, []);

  const start = React.useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    clearTimer(hideRef);
    setDone(false);
    setVisible(true);
    setProgress(8);

    const trickle = () => {
      setProgress((p) => {
        if (p >= 90) return p;
        // Ease toward 90%: larger steps early, smaller as it nears the cap.
        const next = p + Math.max(0.6, (90 - p) * 0.12);
        return Math.min(90, next);
      });
      trickleRef.current = window.setTimeout(trickle, 180);
    };
    trickleRef.current = window.setTimeout(trickle, 180);

    // Safety net: never leave the bar stuck if a navigation never commits
    // (mis-detected anchor, a download that slipped through, etc).
    safetyRef.current = window.setTimeout(() => finish(), 10_000);
  }, [finish]);

  // Programmatic starts.
  React.useEffect(() => {
    const onStart = () => start();
    window.addEventListener(NAV_START_EVENT, onStart);
    return () => window.removeEventListener(NAV_START_EVENT, onStart);
  }, [start]);

  // Internal anchor clicks (capture phase so we run before navigation).
  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;

      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.getAttribute("rel")?.includes("external")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let dest: URL;
      try {
        dest = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (dest.origin !== window.location.origin) return;

      // Same path + search → not a navigation (e.g. hash/replace no-op).
      if (
        dest.pathname === window.location.pathname &&
        dest.search === window.location.search
      ) {
        return;
      }

      start();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // Completion — the new route (path or query) committed. Skip first mount.
  const navKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const firstRef = React.useRef(true);
  React.useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    finish();
  }, [navKey, finish]);

  React.useEffect(
    () => () => {
      clearTimer(trickleRef);
      clearTimer(hideRef);
      clearTimer(safetyRef);
    },
    [],
  );

  if (!visible) return null;

  return (
    <div className="nav-progress" data-state={done ? "done" : "loading"} aria-hidden>
      <span
        className="nav-progress-bar"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
