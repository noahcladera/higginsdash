import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { GroupedSection, GroupedRow } from "@/components/ui/grouped-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface CoachScheduleItem {
  id: string;
  kind: "booking" | "class";
  startsAt: Date;
  endsAt: Date;
  href: string;
  title: string;
  subtitle: string;
  badge?: { label: string; tone: "triaz" | "joint" | "warning" | "neutral" };
  warning?: string;
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Chronological today schedule — classes + court bookings in one grouped list.
 */
export function CoachTodaySchedule({
  items,
  bookLabel,
  courtSingular,
}: {
  items: CoachScheduleItem[];
  bookLabel: string;
  courtSingular: string;
}) {
  if (items.length === 0) {
    return (
      <div className="lg:hidden">
        <GroupedSection header="Today">
          <GroupedRow className="p-0">
            <EmptyState
              icon={<CalendarIcon size={20} />}
              title="Quiet day"
              description="Nothing on the books for today."
              action={
                <Button asChild tone="triaz" size="sm">
                  <Link href="/coach/book">
                    {bookLabel} a {courtSingular}
                  </Link>
                </Button>
              }
            />
          </GroupedRow>
        </GroupedSection>
      </div>
    );
  }

  return (
    <div className="lg:hidden">
      <GroupedSection header="Today">
        {items.map((item) => (
          <GroupedRow key={item.id} className="p-0">
            <Link
              href={item.href}
              className="flex min-h-[3rem] w-full items-center gap-3 px-4 py-2.5 no-underline active:bg-[var(--muted)]/40"
            >
              <div className="w-[4.5rem] shrink-0 text-center">
                <div className="tabular font-display text-lg font-medium leading-tight">
                  {formatTime(item.startsAt)}
                </div>
                <div className="tabular text-[10px] text-[var(--muted-foreground)]">
                  {formatTime(item.endsAt)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">
                  {item.title}
                </div>
                <div className="truncate text-xs text-[var(--muted-foreground)]">
                  {item.subtitle}
                </div>
                {item.warning && (
                  <div className="text-xs text-[var(--warning-ink)]">
                    {item.warning}
                  </div>
                )}
              </div>
              {item.badge && (
                <Badge tone={item.badge.tone} variant="soft" className="shrink-0 capitalize">
                  {item.badge.label}
                </Badge>
              )}
            </Link>
          </GroupedRow>
        ))}
      </GroupedSection>
    </div>
  );
}

/** Desktop timeline — preserves the dotted-line visual. */
export function CoachTodayTimelineDesktop({
  bookings,
  privateLessonSingular,
}: {
  bookings: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    clubName: string;
    courtName: string;
    purpose: string;
    status: string;
  }[];
  privateLessonSingular: string;
}) {
  if (bookings.length === 0) return null;

  return (
    <ol className="relative hidden space-y-1 border-l-2 border-dashed border-[var(--border)] pl-6 lg:block">
      {bookings.map((b) => (
        <li key={b.id} className="relative">
          <span
            className={cn(
              "absolute -left-[31px] top-3 h-3.5 w-3.5 rounded-full ring-4 ring-[var(--background)]",
              b.purpose === "coaching"
                ? "bg-[var(--joint)]"
                : "bg-[var(--triaz)]",
            )}
            aria-hidden
          />
          <div className="flex items-center gap-4 rounded-[var(--radius-md)] px-3 py-3 transition-colors hover:bg-[var(--surface)]">
            <div className="w-20 shrink-0">
              <div className="tabular font-display text-xl font-medium tracking-tight">
                {formatTime(b.startsAt)}
              </div>
              <div className="tabular text-xs text-[var(--muted-foreground)]">
                → {formatTime(b.endsAt)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {b.clubName} · {b.courtName}
              </div>
              {b.status === "cancellation_requested" && (
                <div className="text-xs text-[var(--warning-ink)]">
                  Deletion pending
                </div>
              )}
            </div>
            <Badge
              tone={b.purpose === "coaching" ? "joint" : "triaz"}
              variant="soft"
              className="shrink-0 capitalize"
            >
              {b.purpose === "coaching" ? privateLessonSingular : "Personal"}
            </Badge>
          </div>
        </li>
      ))}
    </ol>
  );
}
