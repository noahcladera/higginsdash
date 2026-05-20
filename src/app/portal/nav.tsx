"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, pickActiveHref } from "@/lib/utils";
import type { PortalNavItem } from "@/lib/portal/nav-sections";

export interface MemberNavProps {
  items: PortalNavItem[];
}

export function MemberNav({ items }: MemberNavProps) {
  const pathname = usePathname();
  const activeHref = pickActiveHref(
    pathname,
    items.map((i) => i.href),
  );
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.hint}
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-medium"
                : "text-[var(--foreground)] hover:bg-[var(--muted)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
