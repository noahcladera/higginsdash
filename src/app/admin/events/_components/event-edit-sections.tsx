"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EventScheduleStep,
} from "../../classes/_components/event-schedule-step";
import type { CourtOption } from "../../classes/_components/event-courts-field";
import { dayKeyFromIso } from "../../classes/_components/use-event-schedule-conflicts";
import { useMemo, useState } from "react";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export function EventLocationSectionEditor({
  classSeriesId,
  defaultVenueId,
  venues,
}: {
  classSeriesId: string;
  defaultVenueId: string;
  venues: Array<{ id: string; name: string }>;
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <input type="hidden" name="deliveryMode" value="at_club" />
      <input type="hidden" name="schoolId" value="" />
      <input type="hidden" name="pickupAt" value="" />
      <div className="space-y-1.5">
        <Label>Venue</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Select the location where this event takes place.
        </p>
        <select name="venueId" className={selectClass} defaultValue={defaultVenueId} required>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export function EventScheduleSectionEditor({
  classSeriesId,
  defaultDate,
  defaultEndDate,
  defaultStartTime,
  defaultEndTime,
  defaultAssignedCourtIds,
  defaultCourtBlockStartTime,
  defaultCourtBlockEndTime,
  defaultExcludedDates,
  venueKind,
  venueClubId,
  courts,
}: {
  classSeriesId: string;
  defaultDate: string;
  defaultEndDate: string;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultAssignedCourtIds: string[];
  defaultCourtBlockStartTime: string | null;
  defaultCourtBlockEndTime: string | null;
  defaultExcludedDates: string[];
  venueKind: "club" | "school" | "rented_court";
  venueClubId: string | null;
  courts: CourtOption[];
}) {
  const repeatWeeklyInitially = defaultEndDate !== defaultDate;
  const [startsOn, setStartsOn] = useState(defaultDate);
  const [endsOn, setEndsOn] = useState(defaultEndDate);
  const [repeatWeekly, setRepeatWeekly] = useState(repeatWeeklyInitially);
  const [dayOfWeek, setDayOfWeek] = useState<DayKey>(
    defaultDate ? dayKeyFromIso(defaultDate) : "fri",
  );
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [assignedCourtIds, setAssignedCourtIds] = useState(
    defaultAssignedCourtIds,
  );
  const [courtBlockStartTime, setCourtBlockStartTime] = useState(
    defaultCourtBlockStartTime ?? defaultStartTime,
  );
  const [courtBlockEndTime, setCourtBlockEndTime] = useState(
    defaultCourtBlockEndTime ?? defaultEndTime,
  );
  const [acknowledgeCourtConflicts, setAcknowledgeCourtConflicts] =
    useState(false);
  const [excludedDates, setExcludedDates] = useState<Set<string>>(
    () => new Set(defaultExcludedDates),
  );

  const effectiveVenueClubId = useMemo(
    () => (venueKind === "club" ? venueClubId : null),
    [venueKind, venueClubId],
  );

  function toggleExcluded(iso: string) {
    setExcludedDates((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  return (
    <EventScheduleStep
      classSeriesId={classSeriesId}
      startsOn={startsOn}
      onStartsOnChange={setStartsOn}
      endsOn={endsOn}
      onEndsOnChange={setEndsOn}
      repeatWeekly={repeatWeekly}
      onRepeatWeeklyChange={setRepeatWeekly}
      dayOfWeek={dayOfWeek}
      onDayOfWeekChange={setDayOfWeek}
      startTime={startTime}
      onStartTimeChange={setStartTime}
      endTime={endTime}
      onEndTimeChange={setEndTime}
      assignedCourtIds={assignedCourtIds}
      onAssignedCourtIdsChange={setAssignedCourtIds}
      courtBlockStartTime={courtBlockStartTime}
      onCourtBlockStartTimeChange={setCourtBlockStartTime}
      courtBlockEndTime={courtBlockEndTime}
      onCourtBlockEndTimeChange={setCourtBlockEndTime}
      acknowledgeCourtConflicts={acknowledgeCourtConflicts}
      onAcknowledgeCourtConflictsChange={setAcknowledgeCourtConflicts}
      excludedDates={excludedDates}
      onToggleExcluded={toggleExcluded}
      venueClubId={effectiveVenueClubId}
      courts={courts}
    />
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
