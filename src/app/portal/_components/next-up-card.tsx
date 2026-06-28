import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { GroupedSection, GroupedRow } from "@/components/ui/grouped-list";
import { format } from "@/lib/format";

export interface NextUpItem {
  kind: "session" | "booking";
  startsAt: Date;
  endsAt: Date;
  title: string;
  subtitle: string;
  href: string;
}

function dayShort(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Single "next on your schedule" card for the mobile home dashboard.
 */
export function NextUpCard({ item }: { item: NextUpItem }) {
  const isToday = dayKey(item.startsAt) === dayKey(new Date());

  return (
    <div className="lg:hidden">
      <GroupedSection>
        <GroupedRow className="p-0">
          <Link
            href={item.href}
            className="group flex w-full items-center gap-4 px-4 py-3 no-underline"
          >
      <div className="w-[4.5rem] shrink-0 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {isToday ? "Today" : dayShort(item.startsAt)}
        </div>
        <div className="tabular font-display text-xl font-medium leading-tight">
          {format.time(item.startsAt)}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--triaz-ink)]">
          Next up
        </div>
        <div className="truncate font-medium">{item.title}</div>
        <div className="truncate text-xs text-[var(--muted-foreground)]">
          {item.subtitle}
        </div>
        <div className="tabular mt-0.5 text-xs text-[var(--muted-foreground)]">
          {format.time(item.startsAt)}–{format.time(item.endsAt)}
        </div>
      </div>
      <ArrowRightIcon
        size={16}
        className="shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5"
      />
          </Link>
        </GroupedRow>
      </GroupedSection>
    </div>
  );
}
