import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { GroupedSection } from "@/components/ui/grouped-list";
import { cn } from "@/lib/utils";

export interface MobileQuickAction {
  href: string;
  label: string;
  icon: React.ReactNode;
  emphasis?: boolean;
}

/**
 * Tappable action rows in a grouped inset list (member + non-member home).
 */
export function MobileQuickActions({
  items,
  alwaysVisible = false,
  header = "Quick actions",
}: {
  items: MobileQuickAction[];
  /** When true, show on desktop too (non-member home). */
  alwaysVisible?: boolean;
  /** Pass `false` to hide the section header. */
  header?: React.ReactNode | false;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn(!alwaysVisible && "lg:hidden")}>
      <GroupedSection header={header === false ? undefined : header}>
        {items.map((item) => (
          <li key={item.href} className="grouped-row p-0">
            <Link
              href={item.href}
              prefetch
              className="group flex min-h-[3rem] w-full items-center gap-3 px-4 py-2.5 no-underline active:bg-[var(--muted)]/40"
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                  item.emphasis
                    ? "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
                    : "bg-[var(--secondary)] text-[var(--muted-foreground)]",
                )}
              >
                {item.icon}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-[15px] leading-tight text-[var(--foreground)]",
                  item.emphasis ? "font-semibold" : "font-medium",
                )}
              >
                {item.label}
              </span>
              <ArrowRightIcon
                size={14}
                className="shrink-0 text-[var(--muted-foreground)]/70 transition-transform group-active:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </GroupedSection>
    </div>
  );
}
