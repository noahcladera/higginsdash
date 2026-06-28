"use client";

import * as React from "react";

function subscribeToMediaQuery(query: string, onChange: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMediaQuerySnapshot(query: string): boolean {
  return window.matchMedia(query).matches;
}

function getMediaQueryServerSnapshot(): boolean {
  return false;
}

/** `(min-width: 768px)` — Tailwind `md` breakpoint. */
export function useMediaQuery(query: string): boolean {
  return React.useSyncExternalStore(
    (onChange) => subscribeToMediaQuery(query, onChange),
    () => getMediaQuerySnapshot(query),
    getMediaQueryServerSnapshot,
  );
}
