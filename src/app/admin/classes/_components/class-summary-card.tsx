"use client";

import { Badge } from "@/components/ui/badge";
import { deliveryModeLabel } from "@/lib/classes/timing";
import { useTerms } from "@/components/tenant/terms-provider";

/**
 * Dense one-tile summary of a ClassSeries, used both as the header of
 * the locked edit page and inside the in-list peek row. It's purely
 * presentational — the caller massages data into the `SummaryProps`
 * shape below.
 */
export type ClassSummaryProps = {
  name: string;
  programName: string;
  seasonName?: string | null;
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueName: string;
  schoolName?: string | null;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null;
  startTimeHHMM: string | null;
  endTimeHHMM: string | null;
  pickupAtHHMM?: string | null;
  startsOnISO: string;
  endsOnISO: string;
  leadCoachName: string;
  assistantCoachNames: string[];
  enrolled: number;
  maxStudents: number;
  minStudents: number | null;
  sessionsTotal: number;
  sessionsExcluded: number;
  /** Label for the staff roster row (defaults to "Coaches"). */
  coachesSectionLabel?: string;
  /** When provided and contains >1 row, the summary surfaces the
   * sub-group breakdown (name + age band + end time + roster). */
  subGroups?: Array<{
    name: string;
    endTimeHHMM: string;
    minAge: number | null;
    maxAge: number | null;
    enrolled: number;
    maxStudents: number;
  }>;
};

export function ClassSummaryCard(props: ClassSummaryProps) {
  const t = useTerms();
  const modeTone =
    props.deliveryMode === "pickup"
      ? "joint"
      : props.deliveryMode === "onsite"
        ? "warning"
        : "triaz";

  return (
    <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={modeTone} variant="soft">
              {deliveryModeLabel(props.deliveryMode)}
            </Badge>
            {props.seasonName && (
              <Badge variant="soft" tone="neutral">
                {props.seasonName}
              </Badge>
            )}
            <Badge variant="soft" tone="neutral">
              {props.programName}
            </Badge>
          </div>
          <h2 className="text-lg font-semibold">{props.name}</h2>
        </div>
        <div className="text-right text-xs text-[var(--muted-foreground)]">
          <div className="tabular text-sm font-medium text-[var(--foreground)]">
            {props.enrolled}/{props.maxStudents} enrolled
          </div>
          {props.minStudents != null && (
            <div>min {props.minStudents}</div>
          )}
          <div className="tabular">
            {props.sessionsTotal} sessions
            {props.sessionsExcluded > 0 && ` · ${props.sessionsExcluded} excluded`}
          </div>
        </div>
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <SummaryField label="When">
          <div className="font-medium text-[var(--foreground)]">
            {props.dayOfWeek ? DAY_LONG[props.dayOfWeek] : "—"}
          </div>
          <div className="text-xs text-[var(--muted-foreground)] tabular">
            {props.startTimeHHMM ?? "—"}
            {props.endTimeHHMM ? ` – ${props.endTimeHHMM}` : ""}
            {props.pickupAtHHMM && (
              <span> · pickup {props.pickupAtHHMM}</span>
            )}
          </div>
        </SummaryField>
        <SummaryField label="Where">
          <div className="font-medium text-[var(--foreground)]">
            {props.deliveryMode === "pickup" && props.schoolName
              ? `${props.schoolName} → ${props.venueName}`
              : props.venueName}
          </div>
        </SummaryField>
        <SummaryField label="Runs">
          <div className="tabular text-xs">
            {formatDateRange(props.startsOnISO, props.endsOnISO)}
          </div>
        </SummaryField>
        <SummaryField label={props.coachesSectionLabel ?? t.coach.plural}>
          <div className="font-medium text-[var(--foreground)]">
            {props.leadCoachName}
          </div>
          {props.assistantCoachNames.length > 0 && (
            <div className="text-xs text-[var(--muted-foreground)]">
              +{" "}
              {props.assistantCoachNames.join(", ")}
            </div>
          )}
        </SummaryField>
      </div>

      {props.subGroups && props.subGroups.length > 1 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            {t.classGroup.plural}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {props.subGroups.map((g) => {
              const ageStr =
                g.minAge == null && g.maxAge == null
                  ? null
                  : g.minAge != null && g.maxAge != null
                    ? `${g.minAge}–${g.maxAge}y`
                    : g.minAge != null
                      ? `${g.minAge}+y`
                      : `≤${g.maxAge}y`;
              return (
                <div
                  key={g.name}
                  className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[var(--foreground)]">
                      {g.name}
                    </div>
                    <div className="tabular text-[var(--muted-foreground)]">
                      ends {g.endTimeHHMM}
                      {ageStr && ` · ${ageStr}`}
                    </div>
                  </div>
                  <span className="tabular text-[var(--muted-foreground)]">
                    {g.enrolled}/{g.maxStudents}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {label}
      </div>
      {children}
    </div>
  );
}

const DAY_LONG: Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  string
> = {
  mon: "Mondays",
  tue: "Tuesdays",
  wed: "Wednesdays",
  thu: "Thursdays",
  fri: "Fridays",
  sat: "Saturdays",
  sun: "Sundays",
};

function formatDateRange(startIso: string, endIso: string): string {
  const format = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  return `${format.format(start)} – ${format.format(end)}`;
}
