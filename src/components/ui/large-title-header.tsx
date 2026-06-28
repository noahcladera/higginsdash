"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function LargeTitleHeader({
  title,
  description,
  onCollapsedChange,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !onCollapsedChange) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        onCollapsedChange(!entry?.isIntersecting);
      },
      { rootMargin: "-1px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onCollapsedChange]);

  return (
    <header className={cn("mb-6 md:mb-8", className)}>
      <div ref={sentinelRef} className="h-px w-full" aria-hidden />
      <h1 className="font-display text-[2rem] font-medium leading-tight tracking-tight md:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)] md:text-base">
          {description}
        </p>
      )}
      {children}
    </header>
  );
}

/** Client wrapper that exposes collapsed state via render prop or context */
export function LargeTitleHeaderWithNav({
  title,
  description,
  renderNavTitle,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  renderNavTitle?: (title: React.ReactNode, collapsed: boolean) => React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <>
      {renderNavTitle?.(title, collapsed)}
      <LargeTitleHeader
        title={title}
        description={description}
        onCollapsedChange={setCollapsed}
        className={className}
      >
        {children}
      </LargeTitleHeader>
    </>
  );
}

export function useLargeTitleCollapse() {
  const [collapsed, setCollapsed] = React.useState(false);
  return { collapsed, setCollapsed };
}
