"use client";

import { LargeTitleHeader } from "@/components/ui/large-title-header";
import {
  useShellNavTitle,
  useRegisterShellNavTitle,
} from "@/components/portal/shell-nav-title-context";

/*
 * Portal home mobile header — uses the shared LargeTitleHeader (same scale
 * and collapse-into-the-top-bar behavior as every other mobile page) with
 * the "Members" kicker on top, instead of a one-off `<h1>`. This is why the
 * home greeting now folds into the sticky nav title on scroll like the rest
 * of the app.
 */
export function HomeMobileHeader({
  kicker,
  greeting,
  subtitle,
}: {
  kicker: string;
  greeting: string;
  subtitle: string;
}) {
  const { setTitleCollapsed } = useShellNavTitle();
  useRegisterShellNavTitle(greeting);

  return (
    <div>
      <div className="kicker-pill mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--triaz-ink)]">
        {kicker}
      </div>
      <LargeTitleHeader
        title={greeting}
        description={subtitle}
        onCollapsedChange={setTitleCollapsed}
        className="mb-0"
      />
    </div>
  );
}
