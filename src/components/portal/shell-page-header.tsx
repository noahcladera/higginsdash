"use client";

import * as React from "react";

import { PageHeader } from "@/components/ui/page-header";
import { LargeTitleHeader } from "@/components/ui/large-title-header";
import {
  useShellNavTitle,
  useRegisterShellNavTitle,
} from "@/components/portal/shell-nav-title-context";
import { cn } from "@/lib/utils";

function MobilePageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const titleStr = typeof title === "string" ? title : null;
  const { setTitleCollapsed } = useShellNavTitle();
  useRegisterShellNavTitle(titleStr ?? "");

  return (
    <div className={cn("lg:hidden", className)}>
      <LargeTitleHeader
        title={title}
        description={description}
        onCollapsedChange={setTitleCollapsed}
      />
      {actions && (
        <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
      )}
    </div>
  );
}

/**
 * Workspace page chrome — large collapsing title on mobile (< lg),
 * classic PageHeader on desktop. Shared by member and coach portals.
 */
export function ShellPageHeader({
  title,
  description,
  kicker,
  actions,
  className,
  align = "left",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  kicker?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <>
      <MobilePageHeader
        title={title}
        description={description}
        actions={actions}
        className={className}
      />
      <div className="hidden lg:block">
        <PageHeader
          kicker={kicker}
          title={title}
          description={description}
          actions={actions}
          align={align}
        />
      </div>
    </>
  );
}

/** @deprecated Use {@link ShellPageHeader} */
export const PortalPageHeader = ShellPageHeader;
