"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateField } from "@/components/ui/date-field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScheduleCalendar } from "./_components/schedule-calendar";
import {
  CoachAssignmentField,
  type CoachOption,
} from "./_components/coach-assignment-field";
import { EventStaffField } from "./_components/event-staff-field";
import { EventPricingField } from "./_components/event-pricing-field";
import { CampOptionsField } from "./_components/camp-options-field";
import { AgeAndLevelField } from "./_components/age-and-level-field";
import { GroupsField, type GroupRow } from "./_components/groups-field";
import { deriveSeriesName as buildAutoName } from "@/lib/classes/series-name";
import type { SkillLevelValue } from "@/lib/skill-levels";
import { useTerms } from "@/components/tenant/terms-provider";

/**
 * Create form for a ClassSeries, as a progressive cascade:
 *
 *   1. Audience          (Adult | Youth)
 *   2. Format            (At club | Afterschool)          — youth only
 *   3. Mode              (Pickup | On-site)               — youth afterschool only
 *   4. Location          (school + venue, or just venue)
 *   5. Schedule          (day / time / start-end + interactive excluded-dates calendar)
 *   6. Naming            (series name + optional season + optional program)
 *   7. Coaches           (lead + assistants)
 *   8. Roster            (max / min students + internal notes)
 *
 * `classType`, `deliveryMode`, and `excludedDates` are *derived* and
 * submitted as hidden inputs — the server never sees the cascade state
 * directly. For `pickup`, the Program dropdown is hidden entirely; the
 * server auto-resolves the canonical "kids-group" program.
 */

type Audience = "adult" | "youth";
type Format = "at_club" | "afterschool";
type AfterschoolMode = "pickup" | "onsite";
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type ProgramOption = {
  id: string;
  name: string;
  targetAudience: "kids" | "adults" | "mixed";
};
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
  /** ISO `YYYY-MM-DD` when the season has a date window. */
  startsOn: string;
  endsOn: string;
  /** ISO `YYYY-MM-DD`s the season recommends excluding (holidays etc.).
   * Merged into the form's excluded set when the season is picked. */
  defaultExcludedDates: string[];
};

export type { CoachOption };

export function ClassSeriesForm({
  action,
  submitLabel,
  programs,
  seasons,
  venues,
  schools,
  courts,
  coaches,
  kind = "class",
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  programs: ProgramOption[];
  seasons: SeasonOption[];
  venues: VenueOption[];
  schools: SchoolOption[];
  courts: CourtOption[];
  coaches: CoachOption[];
  /**
   * Optional discriminator. `event` mode preselects the at-club /
   * adult cascade and forces `classType=event` so the same form can
   * power `/admin/events/new` without rebuilding the wizard.
   */
  kind?: "class" | "event" | "camp";
}) {
  const t = useTerms();
  const [audience, setAudience] = useState<Audience>(
    kind === "event" ? "adult" : "youth",
  );
  const [format, setFormat] = useState<Format>("at_club");
  const [afterschoolMode, setAfterschoolMode] =
    useState<AfterschoolMode>("pickup");

  const [venueId, setVenueId] = useState<string>("");
  const [schoolId, setSchoolId] = useState<string>("");
  const [pickupAt, setPickupAt] = useState<string>("");
  const [dayOfWeek, setDayOfWeek] = useState<DayKey>("mon");
  const [startTime, setStartTime] = useState<string>("16:00");
  const [endTime, setEndTime] = useState<string>("17:00");
  const [defaultCourtId, setDefaultCourtId] = useState<string>("");
  const [courtBlockStartTime, setCourtBlockStartTime] =
    useState<string>("16:00");
  const [courtBlockEndTime, setCourtBlockEndTime] = useState<string>("17:00");
  const [acknowledgeCourtConflicts, setAcknowledgeCourtConflicts] =
    useState(false);
  const [startsOn, setStartsOn] = useState<string>("");
  const [endsOn, setEndsOn] = useState<string>("");
  const [excludedDates, setExcludedDates] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [seasonId, setSeasonId] = useState<string>("");

  // Lifted from <AgeAndLevelField> + <GroupsField> so the live
  // "Series name" preview can carry the `age 5-12` suffix (or the
  // joined `age 7-9 & 10-12` shape when groups are split). The
  // server re-derives the same value at write-time — these states
  // never get submitted directly.
  const [seriesAges, setSeriesAges] = useState<{
    minAge: number | null;
    maxAge: number | null;
  }>({ minAge: null, maxAge: null });
  const [seriesLevels, setSeriesLevels] = useState<SkillLevelValue[]>([]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);

  // Manual-name escape hatch — mirrors the edit-page Naming card. When
  // `useOverride` is on the form submits `useOverride=true` plus a
  // `nameOverride` text input which the server stores verbatim.
  const [useOverride, setUseOverride] = useState(false);
  const [nameOverride, setNameOverride] = useState("");
  const [eventMaxStudents, setEventMaxStudents] = useState(20);

  const handleAgeChange = useCallback(
    (band: { minAge: number | null; maxAge: number | null }) => {
      setSeriesAges((prev) =>
        prev.minAge === band.minAge && prev.maxAge === band.maxAge
          ? prev
          : band,
      );
    },
    [],
  );

  const handleLevelsChange = useCallback((levels: SkillLevelValue[]) => {
    setSeriesLevels((prev) => {
      if (
        prev.length === levels.length &&
        prev.every((p, i) => p === levels[i])
      ) {
        return prev;
      }
      return levels;
    });
  }, []);

  const handleGroupsChange = useCallback((rows: GroupRow[]) => {
    setGroupRows((prev) => {
      if (prev.length === rows.length) {
        const same = prev.every((p, i) => {
          const r = rows[i];
          return (
            p.minAge === r.minAge &&
            p.maxAge === r.maxAge &&
            p.localKey === r.localKey &&
            p.eligibleSkillLevels.length === r.eligibleSkillLevels.length &&
            p.eligibleSkillLevels.every(
              (l, j) => l === r.eligibleSkillLevels[j],
            )
          );
        });
        if (same) return prev;
      }
      return rows;
    });
  }, []);

  // Roster of coaches the admin has chosen so far. The Groups step
  // needs this to populate each row's "Group coach" dropdown — that
  // dropdown is required when 2+ groups are submitted (HTML5
  // validation blocks submit), so the Coaches step is laid out
  // *before* Groups in the cascade below.
  const [coachRoster, setCoachRoster] = useState<
    Array<{ personId: string; name: string }>
  >([]);

  // Memoised so its identity is stable across renders — otherwise
  // the effect inside CoachAssignmentField that calls back to us
  // re-fires on every render and we get an infinite update loop. The
  // setter does its own equality check (below) to avoid pushing a
  // brand-new array reference when nothing actually changed.
  const handleRosterChange = useCallback(
    ({
      leadPersonId,
      assistantPersonIds,
    }: {
      leadPersonId: string | null;
      assistantPersonIds: string[];
    }) => {
      const ids = [
        ...(leadPersonId ? [leadPersonId] : []),
        ...assistantPersonIds,
      ];
      const next = ids.map((id) => {
        const opt = coaches.find((c) => c.personId === id);
        return { personId: id, name: opt?.name ?? "—" };
      });
      setCoachRoster((prev) => {
        if (
          prev.length === next.length &&
          prev.every((p, i) => p.personId === next[i].personId)
        ) {
          return prev;
        }
        return next;
      });
    },
    [coaches],
  );

  // Derive what goes into the hidden fields on submit.
  const { deliveryMode, classType } = deriveDerivatives(
    audience,
    format,
    afterschoolMode,
  );

  // Which venues are eligible at this point in the tree.
  const clubVenues = useMemo(
    () => venues.filter((v) => v.kind === "club"),
    [venues],
  );
  const onsiteVenues = useMemo(
    () => venues.filter((v) => v.kind !== "club"),
    [venues],
  );

  // Filter program list by audience. Mixed programs show up everywhere.
  // Not used for pickup — canonical `kids-group` is resolved on the server.
  const programOptions = useMemo(() => {
    const wanted = audience === "adult" ? "adults" : "kids";
    return programs.filter(
      (p) => p.targetAudience === wanted || p.targetAudience === "mixed",
    );
  }, [programs, audience]);

  const seasonOptions = useMemo(() => {
    return seasons.filter((s) => s.audience === audience);
  }, [seasons, audience]);
  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === venueId) ?? null,
    [venues, venueId],
  );
  const venueClubId =
    selectedVenue?.kind === "club" ? (selectedVenue.clubId ?? null) : null;
  const courtOptions = useMemo(() => {
    if (!venueClubId) return [];
    return courts.filter((c) => c.clubId === venueClubId);
  }, [courts, venueClubId]);

  // Live preview of what the server will write into `class_series.name`.
  // The form does NOT submit a `name` field — the server re-derives the
  // same value from the persisted parameters. See `deriveSeriesName`.
  const derivedName = useMemo(() => {
    const season = seasons.find((s) => s.id === seasonId) ?? null;
    const startYear = parseStartYear(startsOn);
    return deriveSeriesNameFromCascade({
      audience,
      format,
      afterschoolMode,
      venue: venues.find((v) => v.id === venueId) ?? null,
      school: schools.find((s) => s.id === schoolId) ?? null,
      dayOfWeek,
      startTime,
      seasonName: season?.name ?? null,
      startYear,
      seriesMinAge: seriesAges.minAge,
      seriesMaxAge: seriesAges.maxAge,
      seriesEligibleSkillLevels: seriesLevels,
      groups: groupRows.map((r) => ({
        minAge: parseAgeInput(r.minAge),
        maxAge: parseAgeInput(r.maxAge),
        eligibleSkillLevels: r.eligibleSkillLevels,
      })),
    });
  }, [
    audience,
    format,
    afterschoolMode,
    venues,
    venueId,
    schools,
    schoolId,
    dayOfWeek,
    startTime,
    seasons,
    seasonId,
    startsOn,
    seriesAges,
    seriesLevels,
    groupRows,
  ]);

  // Prune excluded dates that fall outside the current [startsOn, endsOn]
  // range OR no longer land on the chosen weekday. Runs whenever the
  // schedule shape changes.
  useEffect(() => {
    if (!startsOn || !endsOn) return;
    const target = DAY_INDEX[dayOfWeek];
    const start = parseIso(startsOn);
    const end = parseIso(endsOn);
    if (!start || !end) return;

    setExcludedDates((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const iso of prev) {
        const d = parseIso(iso);
        if (!d) {
          changed = true;
          continue;
        }
        if (d < start || d > end || d.getUTCDay() !== target) {
          changed = true;
          continue;
        }
        next.add(iso);
      }
      return changed ? next : prev;
    });
  }, [startsOn, endsOn, dayOfWeek]);

  useEffect(() => {
    if (!defaultCourtId) return;
    if (courtOptions.some((court) => court.id === defaultCourtId)) return;
    setDefaultCourtId("");
  }, [defaultCourtId, courtOptions]);

  // When branch selections change, reset the venue/school state so
  // stale hidden values can't leak through validation.
  function pickAudience(next: Audience) {
    if (next === audience) return;
    setAudience(next);
    setVenueId("");
    setSchoolId("");
    if (kind === "event") {
      setSeriesLevels([]);
    }
    if (next === "adult") {
      setFormat("at_club");
    }
  }

  const step = (
    slot:
      | "location"
      | "schedule"
      | "age"
      | "groups"
      | "naming"
      | "coach"
      | "roster"
      | "pricing",
  ) =>
    kind === "event" || kind === "camp"
      ? eventStepNumber(slot)
      : stepNumber({ audience, format, afterschoolMode }, slot);
  function pickFormat(next: Format) {
    if (next === format) return;
    setFormat(next);
    setVenueId("");
    setSchoolId("");
    if (next === "at_club") {
      setPickupAt("");
      setSchoolId("");
    }
  }
  function pickAfterschoolMode(next: AfterschoolMode) {
    if (next === afterschoolMode) return;
    setAfterschoolMode(next);
    setVenueId("");
    setSchoolId("");
    if (next === "onsite") {
      setPickupAt("");
      setSchoolId("");
    }
  }

  function toggleExcluded(iso: string) {
    setExcludedDates((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  // Picking a season seeds the schedule's date window with the
  // season's range and merges in any season-recommended exclusions
  // (school holidays etc.). Manual exclusions made before the swap
  // survive the merge. Clearing the season leaves the dates alone so
  // a free-form camp/event keeps whatever the admin already typed.
  function applySeason(nextId: string) {
    setSeasonId(nextId);
    if (!nextId) return;
    const s = seasons.find((x) => x.id === nextId);
    if (!s) return;
    if (s.startsOn && s.endsOn) {
      setStartsOn(s.startsOn);
      setEndsOn(s.endsOn);
    }
    setExcludedDates((prev) => {
      const merged = new Set(prev);
      for (const d of s.defaultExcludedDates) merged.add(d);
      return merged;
    });
  }

  const excludedCsv = useMemo(
    () => [...excludedDates].sort().join(","),
    [excludedDates],
  );

  // In event mode we override the derived classType so the cascade
  // doesn't accidentally write `group_lesson` for what is clearly an
  // event row.
  const submittedClassType =
    kind === "event" ? "event" : kind === "camp" ? "camp" : classType;

  return (
    <form action={action} className="space-y-6">
      {/* Derived hidden values — server never sees the cascade state directly. */}
      <input type="hidden" name="classType" value={submittedClassType} />
      <input type="hidden" name="deliveryMode" value={deliveryMode} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="excludedDates" value={excludedCsv} />
      <input type="hidden" name="defaultCourtId" value={defaultCourtId} />
      <input
        type="hidden"
        name="courtBlockStartTime"
        value={defaultCourtId ? courtBlockStartTime : ""}
      />
      <input
        type="hidden"
        name="courtBlockEndTime"
        value={defaultCourtId ? courtBlockEndTime : ""}
      />
      <input
        type="hidden"
        name="acknowledgeCourtConflicts"
        value={acknowledgeCourtConflicts ? "true" : "false"}
      />
      {deliveryMode !== "pickup" && (
        <input type="hidden" name="pickupAt" value="" />
      )}
      {deliveryMode === "pickup" && (
        // Server auto-resolves to canonical `kids-group` program.
        <input type="hidden" name="programId" value="" />
      )}

      {/* STEP 1 — Audience ---------------------------------------------- */}
      {kind === "event" ? (
        <Step
          n={1}
          title="Audience"
          hint="Who is this event for? Level options below will match this choice."
        >
          <Pills
            value={audience}
            onChange={(v) => pickAudience(v as Audience)}
            options={[
              { value: "youth", label: "Youth" },
              { value: "adult", label: "Adult" },
            ]}
          />
        </Step>
      ) : (
        <Step
          n={1}
          title="Who's this class for?"
          hint="Adult classes always run at Triaz or Randwijck. Youth classes can be at-club or afterschool."
        >
          <Pills
            value={audience}
            onChange={(v) => pickAudience(v as Audience)}
            options={[
              { value: "adult", label: "Adult" },
              { value: "youth", label: "Youth" },
            ]}
          />
        </Step>
      )}

      {/* STEP 2 — Format (youth only) ----------------------------------- */}
      {kind === "class" && audience === "youth" && (
        <Step
          n={2}
          title="At-club or afterschool?"
          hint={`At-club = ${t.parent.plural} bring ${t.student.plural.toLowerCase()} to your ${t.club.singular.toLowerCase()} venue(s). Afterschool = collection at ${t.school.singular.toLowerCase()} (pickup) or teaching on-site.`}
        >
          <Pills
            value={format}
            onChange={(v) => pickFormat(v as Format)}
            options={[
              { value: "at_club", label: "At club" },
              { value: "afterschool", label: "Afterschool" },
            ]}
          />
        </Step>
      )}

      {/* STEP 3 — Afterschool mode (youth + afterschool only) ----------- */}
      {kind === "class" && audience === "youth" && format === "afterschool" && (
        <Step
          n={3}
          title="Pickup or on-site?"
          hint={`Pickup = ${t.coach.singular} travels from the hub to collect ${t.student.plural.toLowerCase()}. On-site = the ${t.class.singular.toLowerCase()} runs at the partner ${t.school.singular.toLowerCase()}.`}
        >
          <Pills
            value={afterschoolMode}
            onChange={(v) => pickAfterschoolMode(v as AfterschoolMode)}
            options={[
              { value: "pickup", label: "Pickup" },
              { value: "onsite", label: "On-site" },
            ]}
          />
        </Step>
      )}

      {/* STEP 4 — Location ---------------------------------------------- */}
      <Step
        n={step("location")}
        title={locationTitle(deliveryMode)}
        hint={locationHint(deliveryMode)}
      >
        {deliveryMode === "pickup" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="School">
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
            </Field>
            <Field label="Played at">
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
            </Field>
            <Field label="Pickup time" hint="When kids are out of school.">
              <Input
                name="pickupAt"
                type="time"
                value={pickupAt}
                onChange={(e) => setPickupAt(e.target.value)}
                required
              />
            </Field>
          </div>
        ) : deliveryMode === "onsite" ? (
          <Field label="On-site venue">
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
          </Field>
        ) : (
          <Field label="Club">
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
          </Field>
        )}
      </Step>

      {/* STEP 5 — Schedule + interactive calendar ----------------------- */}
      <Step
        n={step("schedule")}
        title="Schedule"
        hint={`Pick the weekday and time. The calendar previews every session — click any green date to mark it as a no-lesson day.`}
      >
        <input
          type="hidden"
          name="seasonId"
          value={kind === "event" ? "" : seasonId}
        />
        {kind === "class" && (
          <Field
            label="Season"
            optional
            hint="Optional label for grouping and naming. If the season has dates, picking it fills the window below."
          >
            <select
              value={seasonId}
              onChange={(e) => applySeason(e.target.value)}
              className={selectClass}
            >
              <option value="">No season</option>
              {seasonOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Day">
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
          </Field>
          <Field label="Start time">
            <Input
              name="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </Field>
          <Field label="End time">
            <Input
              name="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </Field>
        </div>
        <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <Field
            label={`${t.court.singular} (optional)`}
            hint={
              venueClubId
                ? `Select a ${t.court.singular.toLowerCase()} to block it for this ${t.class.singular.toLowerCase()}. Leave empty to avoid blocking any ${t.court.plural.toLowerCase()}.`
                : `Pick a ${t.club.singular.toLowerCase()} venue first to choose a ${t.court.singular.toLowerCase()}.`
            }
            optional
          >
            <select
              value={defaultCourtId}
              onChange={(e) => {
                const next = e.target.value;
                setDefaultCourtId(next);
                if (next) {
                  setCourtBlockStartTime(startTime);
                  setCourtBlockEndTime(endTime);
                }
              }}
              className={selectClass}
              disabled={!venueClubId}
            >
              <option value="">No {t.court.singular.toLowerCase()} selected</option>
              {courtOptions.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </Field>
          {defaultCourtId && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={`${t.court.singular} block start`}
                  hint={`When this ${t.court.singular.toLowerCase()} starts being reserved.`}
                >
                  <Input
                    type="time"
                    value={courtBlockStartTime}
                    onChange={(e) => setCourtBlockStartTime(e.target.value)}
                    required
                  />
                </Field>
                <Field
                  label={`${t.court.singular} block end`}
                  hint={`When this ${t.court.singular.toLowerCase()} becomes available again.`}
                >
                  <Input
                    type="time"
                    value={courtBlockEndTime}
                    onChange={(e) => setCourtBlockEndTime(e.target.value)}
                    required
                  />
                </Field>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts on">
            <DateField
              name="startsOn"
              value={startsOn}
              onChange={setStartsOn}
              mode="any"
              locale="en-NL"
              required
            />
          </Field>
          <Field label="Ends on">
            <DateField
              name="endsOn"
              value={endsOn}
              onChange={setEndsOn}
              mode="any"
              locale="en-NL"
              min={startsOn}
              required
            />
          </Field>
        </div>

        <ScheduleCalendar
          mode="edit"
          startsOn={startsOn}
          endsOn={endsOn}
          dayOfWeek={dayOfWeek}
          excluded={excludedDates}
          onToggle={toggleExcluded}
        />
      </Step>

      {/* STEP — Age & level -------------------------------------------- */}
      <Step
        n={step("age")}
        title={kind === "event" ? "Level" : "Who can sign up?"}
        hint={
          kind === "event"
            ? "Optional — sets the age band and skill levels parents see when signing up."
            : "Optional but helpful — sets the age band and level bracket parents see on the portal. Leave blank to allow anyone."
        }
      >
        <AgeAndLevelField
          audience={audience === "adult" ? "adults" : "kids"}
          onChange={handleAgeChange}
          onLevelsChange={handleLevelsChange}
        />
      </Step>

      {/* STEP — Naming ------------------------------------------------- */}
      <Step
        n={step("naming")}
        title="Naming"
        hint={
          kind === "event"
            ? "How this event appears to parents on the portal."
            : `Shown to ${t.parent.plural.toLowerCase()} and ${t.coach.plural.toLowerCase()}. The series name is derived from the cascade above — change Day, Time, Venue, Program, Season, Ages, or Levels to update it. Tick 'Use custom name' for a manual override.`
        }
      >
        {kind === "event" ? (
          <>
            <Field label="Event name" hint="Short title parents will see in the list.">
              <Input
                name="eventName"
                maxLength={160}
                placeholder="e.g. Summer social"
                required
              />
            </Field>
            <Field
              label="Description"
              hint="Tell parents what to expect — format, what to bring, skill level, etc."
            >
              <Textarea
                name="publicNotes"
                rows={4}
                placeholder="A friendly round-robin social for all levels…"
                required
              />
            </Field>
          </>
        ) : (
          <>
        <input
          type="hidden"
          name="useOverride"
          value={useOverride ? "true" : "false"}
        />
        <Field
          label="Series name"
          hint="Auto-derived from the class parameters above. Tick 'Use custom name' to override."
        >
          {useOverride ? (
            <div className="space-y-1">
              <Input
                name="nameOverride"
                value={nameOverride}
                onChange={(e) => setNameOverride(e.target.value)}
                placeholder={derivedName || "Custom series name"}
                maxLength={160}
                required
              />
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Stored verbatim, skips auto-derivation. Untick the box to revert.
              </p>
            </div>
          ) : (
            <DerivedNameTile name={derivedName} />
          )}
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={useOverride}
              onChange={(e) => {
                const next = e.currentTarget.checked;
                setUseOverride(next);
                if (next && nameOverride === "") setNameOverride(derivedName);
              }}
              className="h-3.5 w-3.5"
            />
            Use custom name
          </label>
        </Field>
        {deliveryMode !== "pickup" ? (
          <Field
            label="Program"
            hint={
              audience === "adult"
                ? "Only adult programs are listed."
                : "Only youth / mixed programs are listed."
            }
          >
            <select
              name="programId"
              defaultValue=""
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
          </Field>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">
            Pickup lessons are always the Kids group lesson program — no need to pick one.
          </p>
        )}
          </>
        )}
      </Step>

      {/* STEP — Coaches ------------------------------------------------ */}
      <Step
        n={step("coach")}
        title={kind === "event" ? "Who is running the event?" : t.coach.plural}
        hint={
          kind === "event"
            ? "Select staff running this event. You can add more once the first person is chosen."
            : `Pick the lead and any assistants. Leave lead as "No ${t.coach.singular.toLowerCase()} yet" to staff later.`
        }
      >
        {kind === "event" ? (
          <EventStaffField coaches={coaches} />
        ) : (
          <CoachAssignmentField
            coaches={coaches}
            isPickup={deliveryMode === "pickup"}
            onRosterChange={handleRosterChange}
          />
        )}
      </Step>

      {/* STEP — Groups -------------------------------------------------- */}
      {kind === "class" && (
      <Step
        n={step("groups")}
        title="Groups"
        hint={`A ${t.class.singular.toLowerCase()} is one group by default. Add a second when the same ${t.court.singular.toLowerCase()} block has two age bands or two end times (e.g. AICS Wednesday with the small kids leaving earlier). Each group keeps its own age window, roster cap, and assigned ${t.coach.singular.toLowerCase()} (required once you have 2+ groups). The series end time tracks the latest group end.`}
      >
        <GroupsField
          audience={audience === "adult" ? "adults" : "kids"}
          seriesEndTime={endTime}
          coachOptions={coachRoster}
          onChange={handleGroupsChange}
        />
      </Step>
      )}

      {/* STEP 8 — Roster limits ----------------------------------------- */}
      <Step
        n={step("roster")}
        title="Roster limits"
        hint={
          kind === "event"
            ? "How many people can sign up for this event."
            : "The total max comes from the sum of your group capacities above. Set per-group caps in the Groups step."
        }
      >
        {/*
         * `maxStudents` on ClassSeries is now derived: it's the sum of
         * each group's `maxStudents`. We submit it via a hidden input so
         * the server schema stays the same, but the admin no longer
         * types it — they edit per-group caps in the Groups step
         * (single source of truth). Falls back to 1 when groups haven't
         * been filled in yet so the field is never empty on submit.
         */}
        <input
          type="hidden"
          name="maxStudents"
          value={
            kind === "event"
              ? eventMaxStudents
              : Math.max(
                  1,
                  groupRows.reduce(
                    (sum, r) => sum + (Number(r.maxStudents) || 0),
                    0,
                  ),
                )
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {kind === "event" ? (
            <Field label="Max participants" hint="Total spots available.">
              <Input
                type="number"
                min={1}
                max={200}
                value={eventMaxStudents}
                onChange={(e) =>
                  setEventMaxStudents(
                    Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                  )
                }
                required
              />
            </Field>
          ) : (
          <div className="space-y-1.5">
            <Label>Max students (derived)</Label>
            <div className="flex h-9 items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--muted-foreground)] tabular-nums">
              {groupRows.reduce(
                (sum, r) => sum + (Number(r.maxStudents) || 0),
                0,
              )}
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Sum of {groupRows.length} group{groupRows.length === 1 ? "" : "s"}.
              Edit per-group caps above to change this.
            </p>
          </div>
          )}
          <Field label="Min students" hint="Leave blank if no minimum." optional>
            <Input
              name="minStudents"
              type="number"
              min={1}
              max={200}
              defaultValue=""
            />
          </Field>
        </div>
        <Field label="Internal notes" hint="Not shown to students." optional>
          <Textarea name="internalNotes" rows={3} defaultValue="" />
        </Field>
        <ImageUpload
          name="coverImageUrl"
          kind="cover"
          aspect="16/9"
          label="Cover image (optional)"
          helpText="Shown at the top of the class page parents see when deciding whether to sign up. Leave blank and we'll fall back to the program's cover image."
        />
        <Field
          label="WhatsApp group invite link"
          hint="Optional — paste the chat.whatsapp.com link and we'll show it to enrolled students and include it in the confirmation email."
          optional
        >
          <Input
            name="whatsappUrl"
            type="url"
            placeholder="https://chat.whatsapp.com/..."
            defaultValue=""
          />
        </Field>
      </Step>

      {/* STEP 9 — Pricing ----------------------------------------------- */}
      <Step
        n={step("pricing")}
        title="Pricing"
        hint={
          kind === "event"
            ? "Set the event price. Add a member price if members pay less — it is applied automatically at checkout."
            : kind === "camp"
              ? "Set week and optional drop-in prices. Member prices are applied automatically when a student already has active membership."
            : "Defaults to EUR 35 per session — the catalog total members see is this number times the live session count. Leave blank to bill manually (the portal then shows 'Contact the office for pricing' and skips checkout)."
        }
      >
        {kind === "event" ? (
          <EventPricingField />
        ) : kind === "camp" ? (
          <CampOptionsField />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Per-session price (EUR)" optional>
              <Input
                name="pricePerSessionEur"
                type="number"
                min={0}
                step={0.5}
                max={10000}
                defaultValue={35}
                placeholder="35"
              />
            </Field>
          </div>
        )}
      </Step>

      <div className="flex items-center justify-end gap-2">
        <Button tone="triaz" type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Derivations + helpers
// ---------------------------------------------------------------------------

function deriveDerivatives(
  audience: Audience,
  format: Format,
  afterschoolMode: AfterschoolMode,
): { deliveryMode: "at_club" | "onsite" | "pickup"; classType: string } {
  if (audience === "adult") {
    return { deliveryMode: "at_club", classType: "group_lesson" };
  }
  if (format === "at_club") {
    return { deliveryMode: "at_club", classType: "group_lesson" };
  }
  if (afterschoolMode === "pickup") {
    return { deliveryMode: "pickup", classType: "school_pickup" };
  }
  return { deliveryMode: "onsite", classType: "school_onsite" };
}

function stepNumber(
  state: { audience: Audience; format: Format; afterschoolMode: AfterschoolMode },
  slot:
    | "location"
    | "schedule"
    | "age"
    | "groups"
    | "naming"
    | "coach"
    | "roster"
    | "pricing",
): number {
  // Count how many branch questions preceded the given slot.
  let n = 1; // step 1 is audience
  if (state.audience === "youth") n += 1; // format
  if (state.audience === "youth" && state.format === "afterschool") n += 1; // mode
  const offsets = {
    location: 1,
    schedule: 2,
    age: 3,
    naming: 4,
    coach: 5,
    groups: 6,
    roster: 7,
    pricing: 8,
  } as const;
  return n + offsets[slot];
}

/** Step numbers for the event create wizard (no format/mode/groups). */
function eventStepNumber(
  slot:
    | "location"
    | "schedule"
    | "age"
    | "groups"
    | "naming"
    | "coach"
    | "roster"
    | "pricing",
): number {
  const offsets = {
    location: 2,
    schedule: 3,
    age: 4,
    naming: 5,
    coach: 6,
    groups: 6,
    roster: 7,
    pricing: 8,
  } as const;
  return offsets[slot];
}

function locationTitle(mode: "at_club" | "onsite" | "pickup"): string {
  if (mode === "pickup") return "Pickup details";
  if (mode === "onsite") return "On-site venue";
  return "Which club?";
}
function locationHint(mode: "at_club" | "onsite" | "pickup"): string {
  if (mode === "pickup") {
    return "Pick the school we collect from and the club the kids ride back to. Staff-at-hub lead time is set per school automatically.";
  }
  if (mode === "onsite") return "Only venues that host on-site lessons are listed.";
  return "Kids show up directly at this club.";
}

function deriveSeriesNameFromCascade(args: {
  audience: Audience;
  format: Format;
  afterschoolMode: AfterschoolMode;
  venue: VenueOption | null;
  school: SchoolOption | null;
  dayOfWeek: DayKey;
  startTime: string;
  seasonName?: string | null;
  startYear?: number | null;
  seriesMinAge?: number | null;
  seriesMaxAge?: number | null;
  seriesEligibleSkillLevels?: SkillLevelValue[];
  groups?: Array<{
    minAge: number | null;
    maxAge: number | null;
    eligibleSkillLevels: SkillLevelValue[];
  }>;
}): string {
  const { audience, format, afterschoolMode, venue, school } = args;
  const deliveryMode: "at_club" | "onsite" | "pickup" =
    audience === "adult" || format === "at_club"
      ? "at_club"
      : afterschoolMode === "pickup"
        ? "pickup"
        : "onsite";
  return buildAutoName({
    audience: audience === "adult" ? "adults" : "kids",
    deliveryMode,
    venueName: venue?.name ?? null,
    schoolName: school?.name ?? null,
    dayOfWeek: args.dayOfWeek,
    startTimeHHMM: args.startTime || null,
    seasonName: args.seasonName ?? null,
    startYear: args.startYear ?? null,
    seriesMinAge: args.seriesMinAge ?? null,
    seriesMaxAge: args.seriesMaxAge ?? null,
    seriesEligibleSkillLevels: args.seriesEligibleSkillLevels ?? [],
    groups: args.groups ?? [],
  });
}

function parseAgeInput(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function DerivedNameTile({ name }: { name: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
      {name ? (
        <span className="font-medium text-[var(--foreground)]">{name}</span>
      ) : (
        <span className="text-[var(--muted-foreground)]">
          Pick a venue, day, and time above to see the auto-derived name.
        </span>
      )}
    </div>
  );
}

function parseStartYear(startsOn: string): number | null {
  if (!startsOn) return null;
  const m = /^(\d{4})-/.exec(startsOn);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
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

// ---------------------------------------------------------------------------
// Presentational bits
// ---------------------------------------------------------------------------

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[var(--radius-md)] bg-[var(--surface)] p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--triaz-soft)] text-[11px] font-semibold text-[var(--triaz-ink)]">
            {n}
          </span>
          {title}
        </h3>
      </header>
      {hint && (
        <p className="-mt-2 text-xs text-[var(--muted-foreground)]">{hint}</p>
      )}
      {children}
    </section>
  );
}

function Field({
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

function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-strong)] p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full px-4 py-1.5 transition-colors ${
            value === o.value
              ? "bg-[var(--triaz-soft)] font-medium text-[var(--triaz-ink)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
