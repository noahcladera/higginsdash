"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";
import { useGlassSegmentPill } from "@/components/ui/use-glass-segment-pill";

export interface MobileTabItem {
  id: string;
  href?: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  opensSheet?: boolean;
}

export interface MobileTabBarProps {
  tabs: MobileTabItem[];
  activeHref?: string;
  moreActive?: boolean;
  sheetOpen?: boolean;
  minimized?: boolean;
  onMoreClick?: () => void;
}

export function MobileTabBar({
  tabs,
  activeHref,
  moreActive = false,
  sheetOpen = false,
  minimized = false,
  onMoreClick,
}: MobileTabBarProps) {
  const rowRef = React.useRef<HTMLDivElement>(null);

  const activeIndex = React.useMemo(() => {
    return tabs.findIndex((t) => {
      if (t.opensSheet) return sheetOpen || moreActive;
      return t.href === activeHref;
    });
  }, [tabs, activeHref, moreActive, sheetOpen]);

  const pillStyle = useGlassSegmentPill(
    rowRef,
    "[data-tab-item]",
    activeIndex,
    [minimized, tabs],
  );

  const showPill = pillStyle.width > 0;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-4 z-40 mx-auto max-w-lg lg:hidden",
        "bottom-[var(--mobile-tab-bar-float-bottom)]",
        "glass-clear rounded-[var(--radius-glass-outer)]",
        "shadow-[var(--glass-regular-shadow)]",
        "transition-[height] duration-[var(--duration-base)] ease-[var(--glass-spring)] motion-reduce:transition-none",
        minimized ? "h-[var(--mobile-tab-bar-minimized)]" : "h-[var(--mobile-tab-bar-height)]",
      )}
    >
      <div ref={rowRef} className="relative flex h-full items-stretch px-1">
        {showPill && (
          <span
            aria-hidden
            className="glass-segment-pill pointer-events-none absolute top-1 bottom-1 rounded-full transition-[left,width] duration-[var(--duration-base)] ease-[var(--glass-spring)] motion-reduce:transition-none"
            style={{ left: pillStyle.left, width: pillStyle.width }}
          />
        )}
        {tabs.map((tab, i) => {
          const active = i === activeIndex;
          const inner = (
            <>
              <span
                className={cn(
                  "relative flex h-5 w-5 items-center justify-center",
                  active
                    ? "text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                {tab.icon}
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--triaz)] px-1 text-[9px] font-semibold text-white"
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </span>
              {!minimized && (
                <span
                  className={cn(
                    "truncate text-[10px] font-medium leading-none",
                    active && "font-semibold",
                  )}
                >
                  {tab.label}
                </span>
              )}
            </>
          );

          const cls = cn(
            "glass-interactive relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1",
            active
              ? "text-[var(--foreground)]"
              : "text-[var(--muted-foreground)]",
          );

          if (tab.opensSheet) {
            return (
              <button
                key={tab.id}
                type="button"
                data-tab-item
                aria-label={tab.label}
                aria-expanded={sheetOpen}
                onClick={() => onMoreClick?.()}
                className={cls}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={tab.id}
              href={tab.href!}
              data-tab-item
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={cls}
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  navigator.vibrate(10);
                }
              }}
            >
              {inner}
              <TabPendingIndicator />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Tiny progress indicator shown while the parent tab Link's RSC payload is
 * still loading. `useLinkStatus` only works inside a `<Link>` subtree, so
 * this lives as a child of each route tab. Gives instant tactile feedback
 * on tap even when the destination takes a beat to stream.
 */
function TabPendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-1 flex justify-center"
    >
      <span className="size-1.5 animate-ping rounded-full bg-[var(--triaz)]" />
    </span>
  );
}
