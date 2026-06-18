"use client";

import { useEffect, useMemo, useState } from "react";
import { DateField } from "@/components/ui/date-field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScheduleCalendar } from "./schedule-calendar";
import {
  CoachAssignmentField,
  type CoachOption,
} from "./coach-assignment-field";
import { AgeAndLevelField } from "./age-and-level-field";
import { GroupsField, type GroupRow } from "./groups-field";
import { EventStaffField } from "./event-staff-field";
import { EventPricingField } from "./event-pricing-field";
import { CampOptionsField } from "./camp-options-field";
import type { PricingTier } from "@/lib/classes/pricing-tiers";
import type { CampOptionsConfig } from "@/lib/classes/camp-options";
import {
  campWeekdayDateKeys,
  toDateKey,
} from "@/lib/classes/session-dates";
import type { SkillLevelValue } from "@/lib/skill-levels";

/**
 * Editable bodies for every locked section on the class-detail page.
 * Each component renders only the editor — the surrounding card,
 * Save/Cancel footer and server-action plumbing live in SectionCard.
 *
 * Every form submits a hidden `classSeriesId` so the server actions
 * stay dumb.
 */

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type DeliveryMode = "at_club" | "onsite" | "pickup";

type VenueOption = {
  id: string;
  name: string;
  kind: "club" | "school" | "rented_court";
  clubId?: string | null;
};
type SchoolOption = { id: string; name: string };
type CourtOption = { id: string; name: string; clubId: string };
type SeasonOption = {
  id: string;
  name: string;
  audience: "youth" | "adult";
  startsOn: string;
  endsOn: string;
  /** ISO `YYYY-MM-DD`s the season recommends excluding (holidays etc.).
   * Merged into the class's excluded set when the season is picked. */
  defaultExcludedDates: string[];
};
type ProgramOption = {
  id: string;
  name: string;
  targetAudience: "kids" | "adults" | "mixed";
};

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export function LocationSectionEditor({
  classSeriesId,
  defaultDeliveryMode,
  defaultVenueId,
  defaultSchoolId,
  defaultPickupAt,
  venues,
  schools,
}: {
  classSeriesId: string;
  defaultDeliveryMode: DeliveryMode;
  defaultVenueId: string;
  defaultSchoolId: string | null;
  defaultPickupAt: string | null;
  venues: VenueOption[];
  schools: SchoolOption[];
}) {
  const [mode, setMode] = useState<DeliveryMode>(defaultDeliveryMode);
  const [venueId, setVenueId] = useState<string>(
    mode === defaultDeliveryMode ? defaultVenueId : "",
  );
  const [schoolId, setSchoolId] = useState<string>(defaultSchoolId ?? "");
  const [pickupAt, setPickupAt] = useState<string>(defaultPickupAt ?? "");

  const clubVenues = useMemo(
    () => venues.filter((v) => v.kind === "club"),
    [venues],
  );
  const onsiteVenues = useMemo(
    () => venues.filter((v) => v.kind !== "club"),
    [venues],
  );

  function onModeChange(next: DeliveryMode) {
    if (next === mode) return;
    setMode(next);
    // Venue constraints change — wipe selections so stale values
    // can't slip through server validation.
    setVenueId("");
    if (next !== "pickup") {
      setSchoolId("");
      setPickupAt("");
    }
  }

  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <input type="hidden" name="deliveryMode" value={mode} />
      <input type="hidden" name="schoolId" value={schoolId} />
      {mode !== "pickup" && <input type="hidden" name="pickupAt" value="" />}

      <div className="space-y-1.5">
        <Label>Mode</Label>
        <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-strong)] p-0.5 text-sm">
          {(
            [
              { v: "at_club", l: "At club" },
              { v: "onsite", l: "On-site" },
              { v: "pickup", l: "Pickup" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => onModeChange(o.v)}
              className={`rounded-full px-4 py-1.5 transition-colors ${
                mode === o.v
                  ? "bg-[var(--triaz-soft)] font-medium text-[var(--triaz-ink)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {mode === "pickup" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldBlock label="School">
            <select
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              className={selectClass}
              required
            >
              <option value="" disabled>
                Pick a school…
              </option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Played at">
            <select
              name="venueId"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className={selectClass}
              required
            >
              <option value="" disabled>
                Pick a venue…
              </option>
              {clubVenues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Pickup time">
            <Input
              name="pickupAt"
              type="time"
              value={pickupAt}
              onChange={(e) => setPickupAt(e.target.value)}
              required
            />
          </FieldBlock>
        </div>
      ) : mode === "onsite" ? (
        <FieldBlock label="On-site venue">
          <select
            name="venueId"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className={selectClass}
            required
          >
            <option value="" disabled>
              Pick a venue…
            </option>
            {onsiteVenues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </FieldBlock>
      ) : (
        <FieldBlock label="Club">
          <select
            name="venueId"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className={selectClass}
            required
          >
            <option value="" disabled>
              Pick a club…
            </option>
            {clubVenues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </FieldBlock>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export function ScheduleSectionEditor({
  classSeriesId,
  defaultDayOfWeek,
  defaultStartTime,
  defaultEndTime,
  defaultStartsOn,
  defaultEndsOn,
  defaultExcludedDates,
  defaultSeasonId,
  defaultCourtId,
  defaultCourtBlockStartTime,
  defaultCourtBlockEndTime,
  venueKind,
  venueClubId,
  courts,
  audience,
  seasons,
  showSeason = true,
  isCamp = false,
}: {
  classSeriesId: string;
  defaultDayOfWeek: DayKey;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultStartsOn: string;
  defaultEndsOn: string;
  defaultExcludedDates: string[];
  defaultSeasonId: string | null;
  defaultCourtId: string | null;
  defaultCourtBlockStartTime: string | null;
  defaultCourtBlockEndTime: string | null;
  venueKind: "club" | "school" | "rented_court";
  venueClubId: string | null;
  courts: CourtOption[];
  audience: "kids" | "adults" | "mixed";
  seasons: SeasonOption[];
  /** False for events — seasons are for regular classes only. */
  showSeason?: boolean;
  isCamp?: boolean;
}) {
  const [dayOfWeek, setDayOfWeek] = useState<DayKey>(defaultDayOfWeek);
  const [startTime, setStartTime] = useState<string>(defaultStartTime);
  const [endTime, setEndTime] = useState<string>(defaultEndTime);
  const [startsOn, setStartsOn] = useState<string>(defaultStartsOn);
  const [endsOn, setEndsOn] = useState<string>(defaultEndsOn);
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(defaultExcludedDates),
  );
  const [seasonId, setSeasonId] = useState<string>(defaultSeasonId ?? "");
  const [courtId, setCourtId] = useState<string>(defaultCourtId ?? "");
  const [courtBlockStartTime, setCourtBlockStartTime] = useState<string>(
    defaultCourtBlockStartTime ?? defaultStartTime,
  );
  const [courtBlockEndTime, setCourtBlockEndTime] = useState<string>(
    defaultCourtBlockEndTime ?? defaultEndTime,
  );
  const [acknowledgeCourtConflicts, setAcknowledgeCourtConflicts] =
    useState(false);
  const courtOptions = useMemo(() => {
    if (venueKind !== "club" || !venueClubId) return [];
    return courts.filter((court) => court.clubId === venueClubId);
  }, [courts, venueKind, venueClubId]);

  // Mirror the Naming editor's audience-fallback rule: filter to the
  // matching audience (plus any free-form / currently-pinned season) and
  // fall back to the full list when the filter would empty the dropdown.
  // Server-side `validateSeasonAudienceMatchesProgram` is the source of
  // truth — this is just so the admin always has something to pick.
  const filteredSeasons = useMemo(() => {
    const wantAudience = audience === "adults" ? "adult" : "youth";
    return seasons.filter(
      (s) => s.audience === wantAudience || s.id === defaultSeasonId,
    );
  }, [seasons, audience, defaultSeasonId]);
  const seasonsAreFiltered = filteredSeasons.length > 0;
  const displayedSeasons = seasonsAreFiltered ? filteredSeasons : seasons;

  // Picking a season replaces the date window with the season's range
  // and merges in any season-recommended excluded dates. Manual
  // exclusions from before the swap survive the merge.
  function applySeason(nextId: string) {
    setSeasonId(nextId);
    if (!nextId) return;
    const s = seasons.find((x) => x.id === nextId);
    if (!s) return;
    if (s.startsOn && s.endsOn) {
      setStartsOn(s.startsOn);
      setEndsOn(s.endsOn);
    }
    setExcluded((prev) => {
      const merged = new Set(prev);
      for (const d of s.defaultExcludedDates) merged.add(d);
      return merged;
    });
  }

  function applyCampWeekStart(iso: string) {
    setStartsOn(iso);
    if (!iso) return;
    const [y, m, d] = iso.split("-").map(Number);
    const monday = new Date(Date.UTC(y, m - 1, d));
    const friday = new Date(monday);
    friday.setUTCDate(friday.getUTCDate() + 4);
    const fridayIso = toDateKey(friday);
    if (!endsOn || endsOn < iso) setEndsOn(fridayIso);
  }

  // Prune stale excluded dates whenever the window / weekday changes.
  useEffect(() => {
    if (!startsOn || !endsOn) return;
    const start = parseIso(startsOn);
    const end = parseIso(endsOn);
    if (!start || !end) return;
    const target = isCamp ? null : DAY_INDEX[dayOfWeek];
    setExcluded((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const iso of prev) {
        const d = parseIso(iso);
        if (!d) {
          changed = true;
          continue;
        }
        const dow = d.getUTCDay();
        const outOfRange = d < start || d > end;
        const wrongDay = isCamp
          ? dow < 1 || dow > 5
          : dow !== target;
        if (outOfRange || wrongDay) {
          changed = true;
          continue;
        }
        next.add(iso);
      }
      return changed ? next : prev;
    });
  }, [startsOn, endsOn, dayOfWeek, isCamp]);

  useEffect(() => {
    if (!courtId) return;
    if (courtOptions.some((court) => court.id === courtId)) return;
    setCourtId("");
  }, [courtId, courtOptions]);

  function toggleExcluded(iso: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  const excludedCsv = useMemo(
    () => [...excluded].sort().join(","),
    [excluded],
  );

  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <input type="hidden" name="excludedDates" value={excludedCsv} />
      <input
        type="hidden"
        name="seasonId"
        value={showSeason ? seasonId : ""}
      />
      <input type="hidden" name="defaultCourtId" value={courtId} />
      <input
        type="hidden"
        name="courtBlockStartTime"
        value={courtId ? courtBlockStartTime : ""}
      />
      <input
        type="hidden"
        name="courtBlockEndTime"
        value={courtId ? courtBlockEndTime : ""}
      />
      <input
        type="hidden"
        name="acknowledgeCourtConflicts"
        value={acknowledgeCourtConflicts ? "true" : "false"}
      />

      {showSeason && (
        <FieldBlock
          label="Season"
          optional
          hint="Optional label for grouping and naming. If the season has dates, picking it fills the window below."
        >
          {!seasonsAreFiltered && seasons.length > 0 && (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              No {audience === "adults" ? "adult" : "youth"}-tagged seasons
              match this program. Showing every active season — the server
              will reject mismatched picks on save.
            </p>
          )}
          <select
            value={seasonId}
            onChange={(e) => applySeason(e.target.value)}
            className={selectClass}
          >
            <option value="">No season</option>
            {displayedSeasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {seasons.length === 0 && (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              No active seasons exist yet — create one in{" "}
              <a
                href="/admin/seasons"
                className="underline underline-offset-2"
              >
                /admin/seasons
              </a>{" "}
              first.
            </p>
          )}
        </FieldBlock>
      )}

      {isCamp && <input type="hidden" name="dayOfWeek" value="mon" />}
      {isCamp ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock label="Week starts" hint="Usually the Monday the camp begins.">
              <DateField
                name="startsOn"
                value={startsOn}
                onChange={applyCampWeekStart}
                mode="any"
                locale="en-NL"
                required
              />
            </FieldBlock>
            <FieldBlock label="Week ends" hint="Usually that Friday — extend for longer camps.">
              <DateField
                name="endsOn"
                value={endsOn}
                onChange={setEndsOn}
                mode="any"
                locale="en-NL"
                min={startsOn}
                required
              />
            </FieldBlock>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock label="Daily start time">
              <Input
                name="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </FieldBlock>
            <FieldBlock label="Daily end time">
              <Input
                name="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </FieldBlock>
          </div>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldBlock label="Day">
            <select
              name="dayOfWeek"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value as DayKey)}
              className={selectClass}
              required
            >
              <option value="mon">Monday</option>
              <option value="tue">Tuesday</option>
              <option value="wed">Wednesday</option>
              <option value="thu">Thursday</option>
              <option value="fri">Friday</option>
              <option value="sat">Saturday</option>
              <option value="sun">Sunday</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Start time">
            <Input
              name="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </FieldBlock>
          <FieldBlock label="End time">
            <Input
              name="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </FieldBlock>
        </div>
      )}
      <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
        <FieldBlock
          label="Court (optional)"
          optional
          hint={
            venueKind === "club"
              ? "Select a court to reserve it for this class. Leave empty to avoid blocking a court."
              : "Court selection is only available for club venues."
          }
        >
          <select
            value={courtId}
            onChange={(e) => {
              const next = e.target.value;
              setCourtId(next);
              if (next) {
                setCourtBlockStartTime(startTime);
                setCourtBlockEndTime(endTime);
              }
            }}
            className={selectClass}
            disabled={venueKind !== "club"}
          >
            <option value="">No court selected</option>
            {courtOptions.map((court) => (
              <option key={court.id} value={court.id}>
                {court.name}
              </option>
            ))}
          </select>
        </FieldBlock>
        {courtId && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBlock
                label="Court block start"
                hint="When this court starts being reserved."
              >
                <Input
                  type="time"
                  value={courtBlockStartTime}
                  onChange={(e) => setCourtBlockStartTime(e.target.value)}
                  required
                />
              </FieldBlock>
              <FieldBlock
                label="Court block end"
                hint="When this court becomes available again."
              >
                <Input
                  type="time"
                  value={courtBlockEndTime}
                  onChange={(e) => setCourtBlockEndTime(e.target.value)}
                  required
                />
              </FieldBlock>
            </div>
            <label className="inline-flex items-start gap-2 text-xs text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={acknowledgeCourtConflicts}
                onChange={(e) =>
                  setAcknowledgeCourtConflicts(e.currentTarget.checked)
                }
                className="mt-0.5 h-3.5 w-3.5"
              />
              If this overlaps existing bookings/classes, allow save and skip
              only conflicting dates.
            </label>
          </>
        )}
      </div>
      {!isCamp && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBlock label="Starts on">
            <DateField
              name="startsOn"
              value={startsOn}
              onChange={setStartsOn}
              mode="any"
              locale="en-NL"
              required
            />
          </FieldBlock>
          <FieldBlock label="Ends on">
            <DateField
              name="endsOn"
              value={endsOn}
              onChange={setEndsOn}
              mode="any"
              locale="en-NL"
              min={startsOn}
              required
            />
          </FieldBlock>
        </div>
      )}

      <ScheduleCalendar
        mode="edit"
        variant={isCamp ? "camp" : "weekly"}
        startsOn={startsOn}
        endsOn={endsOn}
        dayOfWeek={dayOfWeek}
        excluded={excluded}
        onToggle={toggleExcluded}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Coaches
// ---------------------------------------------------------------------------

export function CoachesSectionEditor({
  classSeriesId,
  coaches,
  leadDefault,
  assistantsDefault,
  assignmentsDefault,
  isPickup,
}: {
  classSeriesId: string;
  coaches: CoachOption[];
  leadDefault: string | null;
  assistantsDefault: string[];
  /** Rich payload (per-coach pickup state). When omitted the field
   * falls back to leadDefault/assistantsDefault. Per-sub-group
   * teaching is no longer carried here — see `GroupsSectionEditor`. */
  assignmentsDefault?: Array<{
    coachPersonId: string;
    role: "lead" | "assistant";
    participatesInPickup: boolean;
  }>;
  /** Toggles the per-coach "does pickup" tickbox. */
  isPickup?: boolean;
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <CoachAssignmentField
        coaches={coaches}
        leadDefault={leadDefault}
        assistantsDefault={assistantsDefault}
        assignmentsDefault={assignmentsDefault}
        isPickup={isPickup}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Age & level
// ---------------------------------------------------------------------------

export function AgeAndLevelSectionEditor({
  classSeriesId,
  audience,
  defaultMinAge,
  defaultMaxAge,
  defaultLevels,
  defaultMedalLevels = [],
}: {
  classSeriesId: string;
  audience: "kids" | "adults" | "mixed";
  defaultMinAge: number | null;
  defaultMaxAge: number | null;
  defaultLevels: SkillLevelValue[];
  defaultMedalLevels?: import("@/lib/medal-levels").MedalLevelValue[];
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <AgeAndLevelField
        audience={audience}
        minAgeDefault={defaultMinAge ?? ""}
        maxAgeDefault={defaultMaxAge ?? ""}
        levelsDefault={defaultLevels}
        medalLevelsDefault={defaultMedalLevels}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-groups
// ---------------------------------------------------------------------------

export function GroupsSectionEditor({
  classSeriesId,
  audience,
  seriesEndTime,
  defaultGroups,
  coachOptions,
}: {
  classSeriesId: string;
  audience: "kids" | "adults" | "mixed";
  seriesEndTime: string; // HH:MM
  defaultGroups: GroupRow[];
  /** Lead + assistant coaches currently on the series; presented as
   *  the dropdown options on each group row. */
  coachOptions: Array<{ personId: string; name: string }>;
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <GroupsField
        audience={audience}
        seriesEndTime={seriesEndTime}
        defaultGroups={defaultGroups}
        coachOptions={coachOptions}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

export function NamingSectionEditor({
  classSeriesId,
  defaultProgramId,
  defaultName,
  defaultNameOverride,
  deliveryMode,
  audience,
  programs,
}: {
  classSeriesId: string;
  defaultProgramId: string;
  /**
   * Current `class_series.name` — pre-fills the override input the
   * first time the admin ticks the checkbox so they don't have to
   * re-type the auto-generated string before editing it.
   */
  defaultName: string;
  /**
   * Current `class_series.name_override`. `null` → derivation is
   * active and the checkbox starts unchecked; non-null → the row is
   * pinned to a custom name and the checkbox starts checked.
   */
  defaultNameOverride: string | null;
  deliveryMode: DeliveryMode;
  audience: "kids" | "adults" | "mixed";
  programs: ProgramOption[];
}) {
  const programOptions = useMemo(() => {
    const wanted = audience === "adults" ? "adults" : "kids";
    return programs.filter(
      (p) => p.targetAudience === wanted || p.targetAudience === "mixed",
    );
  }, [programs, audience]);

  const [useOverride, setUseOverride] = useState(defaultNameOverride !== null);

  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <input
        type="hidden"
        name="useOverride"
        value={useOverride ? "true" : "false"}
      />
      {deliveryMode === "pickup" && (
        <input type="hidden" name="programId" value="" />
      )}

      <FieldBlock
        label="Series name"
        hint="Auto-derived from the class parameters (Day, Time, Venue, Program, Season, Ages, Sub-groups, Levels). Tick 'Use custom name' to override. Season is set in the Schedule card."
      >
        {useOverride ? (
          <div className="flex flex-col gap-1">
            <Input
              name="nameOverride"
              defaultValue={defaultNameOverride ?? defaultName}
              maxLength={160}
              required
              autoFocus
            />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Stored verbatim, skips auto-derivation. Untick the box to revert.
            </p>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            Saved automatically from this class's parameters. Save the section
            to apply.
          </p>
        )}
        <label className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={useOverride}
            onChange={(e) => setUseOverride(e.currentTarget.checked)}
            className="h-3.5 w-3.5"
          />
          Use custom name
        </label>
      </FieldBlock>

      {deliveryMode !== "pickup" ? (
        <FieldBlock label="Program">
          <select
            name="programId"
            defaultValue={defaultProgramId}
            className={selectClass}
            required
          >
            <option value="" disabled>
              Pick a program…
            </option>
            {programOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FieldBlock>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Pickup lessons always use the Kids group lesson program — no need to
          pick one.
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Roster limits
// ---------------------------------------------------------------------------

export function RosterLimitsSectionEditor({
  classSeriesId,
  defaultMax,
  defaultMin,
  defaultNotes,
  defaultWhatsappUrl,
  defaultCoverImageUrl,
}: {
  classSeriesId: string;
  defaultMax: number;
  defaultMin: number | null;
  defaultNotes: string | null;
  defaultWhatsappUrl: string | null;
  defaultCoverImageUrl: string | null;
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Max students">
          <Input
            name="maxStudents"
            type="number"
            min={1}
            max={200}
            defaultValue={defaultMax}
            required
          />
        </FieldBlock>
        <FieldBlock
          label="Min students"
          hint="Leave blank if no minimum."
          optional
        >
          <Input
            name="minStudents"
            type="number"
            min={1}
            max={200}
            defaultValue={defaultMin ?? ""}
          />
        </FieldBlock>
      </div>
      <FieldBlock label="Internal notes" hint="Not shown to students." optional>
        <Textarea
          name="internalNotes"
          rows={3}
          defaultValue={defaultNotes ?? ""}
        />
      </FieldBlock>
      <FieldBlock
        label="WhatsApp group invite link"
        hint="Optional — pasted to enrolled students and added to the confirmation email. chat.whatsapp.com / wa.me only."
        optional
      >
        <Input
          name="whatsappUrl"
          type="url"
          placeholder="https://chat.whatsapp.com/..."
          defaultValue={defaultWhatsappUrl ?? ""}
        />
      </FieldBlock>
      <ImageUpload
        name="coverImageUrl"
        defaultUrl={defaultCoverImageUrl ?? ""}
        kind="cover"
        aspect="16/9"
        label="Cover image"
        helpText="Shown at the top of the class page parents see when deciding whether to sign up. Leave blank to inherit the program's cover image."
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Event-specific editors
// ---------------------------------------------------------------------------

export function EventNamingSectionEditor({
  classSeriesId,
  defaultName,
  defaultPublicNotes,
}: {
  classSeriesId: string;
  defaultName: string;
  defaultPublicNotes: string | null;
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <FieldBlock label="Event name">
        <Input
          name="eventName"
          defaultValue={defaultName}
          maxLength={160}
          required
        />
      </FieldBlock>
      <FieldBlock label="Description">
        <Textarea
          name="publicNotes"
          rows={4}
          defaultValue={defaultPublicNotes ?? ""}
          required
        />
      </FieldBlock>
    </>
  );
}

export function EventCoachesSectionEditor({
  classSeriesId,
  coaches,
  defaultPersonIds,
  memberLabel,
  addAnotherLabel,
}: {
  classSeriesId: string;
  coaches: CoachOption[];
  defaultPersonIds: string[];
  memberLabel?: string;
  addAnotherLabel?: string;
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <EventStaffField
        coaches={coaches}
        defaultPersonIds={defaultPersonIds}
        memberLabel={memberLabel}
        addAnotherLabel={addAnotherLabel}
      />
    </>
  );
}

export function EventPricingSectionEditor({
  classSeriesId,
  defaultTiers,
}: {
  classSeriesId: string;
  defaultTiers: PricingTier[];
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <EventPricingField defaultTiers={defaultTiers} />
    </>
  );
}

export function CampPricingSectionEditor({
  classSeriesId,
  defaultOptions,
  scheduleDropInDates = [],
}: {
  classSeriesId: string;
  defaultOptions: CampOptionsConfig | null;
  scheduleDropInDates?: string[];
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <CampOptionsField
        defaultOptions={defaultOptions}
        scheduleDropInDates={scheduleDropInDates}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Single per-session EUR input. Server mirrors the value to
 * `pricePerSession` and pre-multiplies into `pricePerSeries` (=
 * perSession * non-cancelled session count) so the portal pricing
 * engine always has a current bundle total to quote. Clearing the
 * field flips the series back into "Contact the office" mode.
 */
export function PricingSectionEditor({
  classSeriesId,
  defaultPricePerSession,
}: {
  classSeriesId: string;
  defaultPricePerSession: number | null;
}) {
  return (
    <>
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock
          label="Per-session price (EUR)"
          hint="Members see this multiplied by the remaining sessions. Leave blank to bill manually."
          optional
        >
          <Input
            name="pricePerSessionEur"
            type="number"
            min={0}
            step={0.5}
            max={10000}
            defaultValue={defaultPricePerSession ?? ""}
            placeholder="35"
          />
        </FieldBlock>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

function FieldBlock({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {optional && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Optional
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  );
}

const DAY_INDEX: Record<DayKey, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseIso(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
