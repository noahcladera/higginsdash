"use client";

import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScheduleCalendar } from "./schedule-calendar";
import {
  EventCourtsField,
  type CourtOption,
} from "./event-courts-field";
import {
  dayKeyFromIso,
  useEventScheduleConflicts,
} from "./use-event-schedule-conflicts";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_PILLS: { id: DayKey; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

function EventDayPill({ dayOfWeek }: { dayOfWeek: DayKey }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAY_PILLS.map((d) => {
        const active = d.id === dayOfWeek;
        return (
          <span
            key={d.id}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              active
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "border-[var(--border)] text-[var(--muted-foreground)]/50",
            )}
          >
            {d.label}
          </span>
        );
      })}
    </div>
  );
}

export function EventScheduleStep({
  startsOn,
  onStartsOnChange,
  endsOn,
  onEndsOnChange,
  repeatWeekly,
  onRepeatWeeklyChange,
  dayOfWeek,
  onDayOfWeekChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  assignedCourtIds,
  onAssignedCourtIdsChange,
  courtBlockStartTime,
  onCourtBlockStartTimeChange,
  courtBlockEndTime,
  onCourtBlockEndTimeChange,
  acknowledgeCourtConflicts,
  onAcknowledgeCourtConflictsChange,
  excludedDates,
  onToggleExcluded,
  venueClubId,
  courts,
  classSeriesId,
}: {
  startsOn: string;
  onStartsOnChange: (iso: string) => void;
  endsOn: string;
  onEndsOnChange: (iso: string) => void;
  repeatWeekly: boolean;
  onRepeatWeeklyChange: (value: boolean) => void;
  dayOfWeek: DayKey;
  onDayOfWeekChange: (day: DayKey) => void;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  assignedCourtIds: string[];
  onAssignedCourtIdsChange: (ids: string[]) => void;
  courtBlockStartTime: string;
  onCourtBlockStartTimeChange: (value: string) => void;
  courtBlockEndTime: string;
  onCourtBlockEndTimeChange: (value: string) => void;
  acknowledgeCourtConflicts: boolean;
  onAcknowledgeCourtConflictsChange: (value: boolean) => void;
  excludedDates: Set<string>;
  onToggleExcluded: (iso: string) => void;
  venueClubId: string | null;
  courts: CourtOption[];
  /** When set, included as hidden field for edit saves. */
  classSeriesId?: string;
}) {
  const conflicts = useEventScheduleConflicts({
    assignedCourtIds,
    dayOfWeek,
    startsOn,
    endsOn: repeatWeekly ? endsOn : startsOn,
    courtBlockStartTime,
    courtBlockEndTime,
    excludedDates,
    enabled: assignedCourtIds.length > 0 && !!startsOn,
  });

  const effectiveEndsOn = repeatWeekly ? endsOn : startsOn;

  function handleEventDate(iso: string) {
    onStartsOnChange(iso);
    if (!repeatWeekly) {
      onEndsOnChange(iso);
    }
    if (iso) {
      onDayOfWeekChange(dayKeyFromIso(iso));
    }
  }

  function handleRepeatWeekly(next: boolean) {
    onRepeatWeeklyChange(next);
    if (!next && startsOn) {
      onEndsOnChange(startsOn);
    }
  }

  return (
    <>
      {classSeriesId ? (
        <input type="hidden" name="classSeriesId" value={classSeriesId} />
      ) : null}
      <input type="hidden" name="seasonId" value="" />
      <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
      <input type="hidden" name="startsOn" value={startsOn} />
      <input type="hidden" name="endsOn" value={effectiveEndsOn} />
      <input
        type="hidden"
        name="excludedDates"
        value={[...excludedDates].sort().join(",")}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Event date" hint="One day per occurrence.">
          <DateField
            value={startsOn}
            onChange={handleEventDate}
            mode="any"
            locale="en-NL"
            required
          />
        </Field>
        <Field label="Start time">
          <Input
            name="startTime"
            type="time"
            value={startTime}
            onChange={(e) => {
              onStartTimeChange(e.target.value);
              if (assignedCourtIds.length > 0) {
                onCourtBlockStartTimeChange(e.target.value);
              }
            }}
            required
          />
        </Field>
        <Field label="End time">
          <Input
            name="endTime"
            type="time"
            value={endTime}
            onChange={(e) => {
              onEndTimeChange(e.target.value);
              if (assignedCourtIds.length > 0) {
                onCourtBlockEndTimeChange(e.target.value);
              }
            }}
            required
          />
        </Field>
      </div>

      <div className="space-y-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={repeatWeekly}
            onChange={(e) => handleRepeatWeekly(e.currentTarget.checked)}
            className="h-3.5 w-3.5"
          />
          Repeat every week
        </label>

        {startsOn ? (
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--muted-foreground)]">Weekday</p>
            <EventDayPill dayOfWeek={dayOfWeek} />
          </div>
        ) : null}

        {repeatWeekly ? (
          <Field
            label="Repeat until"
            hint="Last date this event runs on the weekday above."
          >
            <DateField
              value={endsOn}
              onChange={onEndsOnChange}
              mode="any"
              locale="en-NL"
              min={startsOn}
              required
            />
          </Field>
        ) : null}
      </div>

      <EventCourtsField
        venueClubId={venueClubId}
        courts={courts}
        assignedCourtIds={assignedCourtIds}
        onAssignedCourtIdsChange={onAssignedCourtIdsChange}
        courtBlockStartTime={courtBlockStartTime}
        courtBlockEndTime={courtBlockEndTime}
        onCourtBlockStartTimeChange={onCourtBlockStartTimeChange}
        onCourtBlockEndTimeChange={onCourtBlockEndTimeChange}
        acknowledgeCourtConflicts={acknowledgeCourtConflicts}
        onAcknowledgeCourtConflictsChange={onAcknowledgeCourtConflictsChange}
        eventStartTime={startTime}
        eventEndTime={endTime}
      />

      <ScheduleCalendar
        mode="edit"
        scheduledLabel="Event"
        startsOn={startsOn}
        endsOn={effectiveEndsOn}
        dayOfWeek={dayOfWeek}
        excluded={excludedDates}
        conflicts={conflicts}
        onToggle={onToggleExcluded}
      />
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {hint ? (
        <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}
