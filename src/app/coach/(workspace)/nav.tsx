"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, pickActiveHref } from "@/lib/utils";

const items: { href: string; label: string }[] = [
  { href: "/coach", label: "Today" },
  { href: "/coach/calendar", label: "Calendar" },
  { href: "/coach/book", label: "Book privates & courts" },
  { href: "/coach/bookings", label: "My bookings" },
  { href: "/coach/hours", label: "My hours" },
];

export function CoachNav() {
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
