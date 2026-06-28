"use client";

import * as React from "react";

const SCROLL_THRESHOLD = 8;

/**
 * iOS-style tab bar minimize on scroll down, expand on scroll up.
 * Listens on `window` by default; pass `scrollRef` for a custom container.
 */
export function useTabBarMinimize(scrollRef?: React.RefObject<HTMLElement | null>) {
  const [minimized, setMinimized] = React.useState(false);
  const lastScrollY = React.useRef(0);

  React.useEffect(() => {
    const el = scrollRef?.current;
    const getY = () => (el ? el.scrollTop : window.scrollY);

    const onScroll = () => {
      const y = getY();
      const delta = y - lastScrollY.current;
      if (Math.abs(delta) < SCROLL_THRESHOLD) return;
      if (y <= 0) {
        setMinimized(false);
      } else if (delta > 0) {
        setMinimized(true);
      } else {
        setMinimized(false);
      }
      lastScrollY.current = y;
    };

    const target: HTMLElement | Window = el ?? window;
    target.addEventListener("scroll", onScroll as EventListener, { passive: true });
    return () => target.removeEventListener("scroll", onScroll as EventListener);
  }, [scrollRef]);

  return { minimized };
}
