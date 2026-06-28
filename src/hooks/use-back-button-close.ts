"use client";

import * as React from "react";

/**
 * Make the hardware / browser back button close an open overlay (sheet,
 * dialog) instead of navigating away.
 *
 * On open we push a *same-URL* history entry; a back press pops it and we
 * fire `onClose`. A programmatic close pops the entry we pushed so the
 * back stack stays balanced. Pushing the same URL does NOT trigger a
 * Next.js navigation / RSC refetch.
 *
 * Each overlay instance manages its own entry, so stacked sheets close in
 * LIFO order (e.g. a nested dialog closes before its parent sheet).
 */
export function useBackButtonClose(open: boolean, onClose: () => void) {
  const pushedRef = React.useRef(false);
  const openRef = React.useRef(open);
  openRef.current = open;
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (open) {
      if (!pushedRef.current) {
        pushedRef.current = true;
        window.history.pushState(
          { ...(window.history.state ?? {}), __sheetDismiss: true },
          "",
        );
      }
    } else if (pushedRef.current) {
      // Programmatic close — remove the entry we added.
      pushedRef.current = false;
      window.history.back();
    }
  }, [open]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      if (pushedRef.current && openRef.current) {
        pushedRef.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}
