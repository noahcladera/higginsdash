"use client";

import * as React from "react";

/**
 * Positions a sliding pill behind the active item in glass segmented controls
 * (tab bar, court picker, club picker). Uses getBoundingClientRect + ResizeObserver.
 */
export function useGlassSegmentPill(
  containerRef: React.RefObject<HTMLElement | null>,
  targetSelector: string,
  activeIndex: number,
  deps: React.DependencyList = [],
) {
  const [pillStyle, setPillStyle] = React.useState({ left: 0, width: 0 });

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || activeIndex < 0) {
      setPillStyle({ left: 0, width: 0 });
      return;
    }

    const measure = () => {
      const items = container.querySelectorAll<HTMLElement>(targetSelector);
      const active = items[activeIndex];
      if (!active) {
        setPillStyle({ left: 0, width: 0 });
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      setPillStyle({
        left: activeRect.left - containerRect.left,
        width: activeRect.width,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    window.addEventListener("resize", measure);
    // iOS Safari: layout/fonts can settle after first paint — remeasure.
    const t1 = window.setTimeout(measure, 50);
    const t2 = window.setTimeout(measure, 300);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, targetSelector, ...deps]);

  return pillStyle;
}
