"use client";

import { useMemo, useState } from "react";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function dayKeyFromIso(isoDate: string): DayKey {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return DAY_KEYS[utc.getUTCDay()];
}

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
  defaultStartTime,
  defaultEndTime,
}: {
  classSeriesId: string;
  defaultDate: string;
  defaultStartTime: string;
  defaultEndTime: string;
}) {
  const [eventDate, setEventDate] = useState(defaultDate);
  const dayOfWeek = useMemo(
    () => (eventDate ? dayKeyFromIso(eventDate) : "fri"),
    [eventDate],
  );

  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
      <input type="hidden" name="startsOn" value={eventDate} />
      <input type="hidden" name="endsOn" value={eventDate} />
      <input type="hidden" name="excludedDates" value="" />
      <input type="hidden" name="seasonId" value="" />
      <input type="hidden" name="defaultCourtId" value="" />
      <input type="hidden" name="courtBlockStartTime" value="" />
      <input type="hidden" name="courtBlockEndTime" value="" />
      <input type="hidden" name="acknowledgeCourtConflicts" value="false" />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Event date</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            Events use one date. Create a new event for the next week.
          </p>
          <DateField
            name="eventDate"
            value={eventDate}
            onChange={setEventDate}
            mode="any"
            locale="en-NL"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Start time</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            When check-in or play starts.
          </p>
          <Input name="startTime" type="time" defaultValue={defaultStartTime} required />
        </div>
        <div className="space-y-1.5">
          <Label>End time</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            When the event should finish.
          </p>
          <Input name="endTime" type="time" defaultValue={defaultEndTime} required />
        </div>
      </div>
    </>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
