import { Badge } from "@/components/ui/badge";
import { GroupedRow } from "@/components/ui/grouped-list";

const DAY_LABEL_FULL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export interface RecurringRequestRowProps {
  request: {
    id: string;
    purposeDescription: string;
    status: string;
    dayOfWeek: string | null;
    startTime: Date;
    endTime: Date;
    startsOn: Date;
    endsOn: Date;
    deniedReason: string | null;
    requestedAt: Date;
    excludedDates: Date[];
    court: { name: string };
    club: { name: string };
  };
}

export function RecurringRequestRow({ request: r }: RecurringRequestRowProps) {
  const startTime = `${pad(r.startTime.getUTCHours())}:${pad(r.startTime.getUTCMinutes())}`;
  const endTime = `${pad(r.endTime.getUTCHours())}:${pad(r.endTime.getUTCMinutes())}`;
  const startsOn = isoFromDate(r.startsOn);
  const endsOn = isoFromDate(r.endsOn);
  const isPending = r.status === "pending";

  return (
    <GroupedRow className="flex-col items-stretch gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {r.purposeDescription}
            <Badge
              tone={isPending ? "warning" : "danger"}
              variant="soft"
              className="ml-2"
            >
              {r.status}
            </Badge>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {r.club.name} · {r.court.name} · every{" "}
            {r.dayOfWeek ? DAY_LABEL_FULL[r.dayOfWeek] : "day"} ·{" "}
            <span className="font-mono">
              {startTime}–{endTime}
            </span>
          </div>
        </div>
        <div className="font-mono text-[11px] text-[var(--muted-foreground)]">
          {startsOn} → {endsOn}
        </div>
      </div>
      {r.excludedDates.length > 0 && (
        <div className="text-[11px] text-[var(--muted-foreground)]">
          Skipping {r.excludedDates.length} date(s) you marked as conflicts.
        </div>
      )}
      {r.status === "denied" && r.deniedReason && (
        <div className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--destructive)]">
          <span className="font-semibold">Admin note:</span> {r.deniedReason}
        </div>
      )}
      {isPending && (
        <div className="text-[11px] text-[var(--muted-foreground)]">
          Submitted {formatRequestedAt(r.requestedAt)}; admin will review.
        </div>
      )}
    </GroupedRow>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatRequestedAt(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
