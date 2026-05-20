/**
 * Class timing — pure helpers for computing and formatting the timing
 * anchors that show up on the coach portal, parent calendar, and admin
 * class pages.
 *
 * The anchors are:
 *   - `coachArriveAt` — pickup-mode only; when the coach leaves Triaz
 *                      with the gocab/stint to head to the school.
 *   - `pickupAt`      — pickup-mode only; when kids come out of school.
 *   - `classStartAt`  — when the class itself begins.
 *   - `classEndAt`    — when the class ends.
 *
 * For `at_club` and `onsite` classes there is no separate "coach arrive"
 * concept: the coach is expected at the venue at `classStartAt`, and
 * paid hours start from class start. Pickup is the only mode that
 * carries an earlier anchor, because the coach has to travel to the
 * school first.
 *
 * Pickup timing is driven by the *school* `coachArriveAtHubMinutes`,
 * which is the travel time from the Triaz hub to that school.
 */
import { format } from "@/lib/format";

export type ClassDeliveryMode = "at_club" | "onsite" | "pickup";

export interface ClassTiming {
  /** Pickup-mode only: when the coach leaves Triaz with the gocab. */
  coachArriveAt?: Date;
  /** Pickup-mode only: when kids are out of school. */
  pickupAt?: Date;
  classStartAt: Date;
  classEndAt: Date;
}

export interface ComputeClassTimingArgs {
  session: { startsAt: Date; endsAt: Date };
  series: {
    deliveryMode: ClassDeliveryMode;
    /** HH:MM stored as a JS Date whose time-of-day portion we care about. */
    pickupAt: Date | null;
  };
  /** Required for `deliveryMode = "pickup"`. Ignored otherwise. */
  school?: { coachArriveAtHubMinutes: number } | null;
  /**
   * Per-coach overlay used when computing a coach's calendar block.
   *   - `participatesInPickup = false` (pickup mode only): drop the
   *     leave-Triaz anchor — the coach joins on court at class start.
   *   - `groupEndTimes`: when non-empty, the coach's `classEndAt`
   *     becomes the latest of these instead of the session-wide
   *     `endsAt`. Used to scope a coach to e.g. only the early
   *     sub-group, so their personal calendar block ends there.
   */
  coach?: {
    participatesInPickup?: boolean;
    groupEndTimes?: Date[];
  };
}

/**
 * Produce the timing anchors for a single class occurrence.
 *
 * - `session.startsAt` / `endsAt` are absolute UTC instants (`TIMESTAMPTZ`).
 * - `series.pickupAt` is a local time-of-day (`TIME`); we lift it onto
 *   the session's date by taking HH:MM and anchoring to session day in
 *   UTC. That matches how Prisma returns `TIME` values.
 */
export function computeClassTiming(args: ComputeClassTimingArgs): ClassTiming {
  const { session, series, school, coach } = args;

  // Coach group scope shortens the personal end-of-block. We always
  // pick the LATEST assigned group's end so a coach scoped to two
  // groups stays for both.
  const classEndAt =
    coach?.groupEndTimes && coach.groupEndTimes.length > 0
      ? new Date(
          Math.max(...coach.groupEndTimes.map((d) => d.getTime())),
        )
      : session.endsAt;

  if (series.deliveryMode === "pickup") {
    const pickupAt = liftTimeOntoDate(session.startsAt, series.pickupAt);
    const travelMinutes = school?.coachArriveAtHubMinutes ?? 30;
    const baseCoachArriveAt = pickupAt
      ? addMinutes(pickupAt, -travelMinutes)
      : addMinutes(session.startsAt, -travelMinutes);
    const includeLeaveAnchor = coach?.participatesInPickup !== false;
    return {
      coachArriveAt: includeLeaveAnchor ? baseCoachArriveAt : undefined,
      pickupAt: includeLeaveAnchor ? pickupAt ?? undefined : undefined,
      classStartAt: session.startsAt,
      classEndAt,
    };
  }

  return {
    classStartAt: session.startsAt,
    classEndAt,
  };
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/**
 * Take the HH:MM portion of `time` and anchor it onto the calendar day
 * of `onDate` (both in Europe/Amsterdam). Returns `null` if `time` is
 * `null`.
 *
 * Prisma's `@db.Time(6)` values come back as a JS Date anchored to
 * 1970-01-01 UTC. We pull HH:MM from the UTC portion and rebuild the
 * date at that wall-clock time on the session's day.
 */
function liftTimeOntoDate(onDate: Date, time: Date | null): Date | null {
  if (!time) return null;
  const hh = time.getUTCHours();
  const mm = time.getUTCMinutes();
  // Use Europe/Amsterdam calendar day from onDate, then rebuild the UTC
  // instant at hh:mm Amsterdam local time. Close enough for our single
  // timezone — when we go multi-tz we revisit this.
  const amsterdamParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(onDate);
  const y = Number(amsterdamParts.find((p) => p.type === "year")!.value);
  const mo = Number(amsterdamParts.find((p) => p.type === "month")!.value);
  const d = Number(amsterdamParts.find((p) => p.type === "day")!.value);
  // Build a UTC instant at hh:mm Amsterdam time for that day. DST-safe
  // enough: we approximate by computing the UTC offset at `onDate`.
  const approx = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  const offsetMinutes = amsterdamOffsetMinutes(approx);
  return new Date(approx.getTime() - offsetMinutes * 60_000);
}

function amsterdamOffsetMinutes(at: Date): number {
  const str = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    timeZoneName: "shortOffset",
  })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  if (!str) return 60;
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(str);
  if (!match) return 60;
  const hours = Number(match[1]);
  const mins = Number(match[2] ?? 0);
  return hours * 60 + (hours < 0 ? -mins : mins);
}

/**
 * Render a timing line. Two shapes:
 *
 *   - Pickup:           "12:40 leave · 13:00 pickup · 13:30–15:00"
 *   - At-club / onsite: "10:00–11:00"
 *
 * For pickup we spell out the earlier "leave" anchor because that's when
 * the coach actually starts their day (the gocab leaves Triaz). For
 * at-club / onsite the coach is simply expected at `classStartAt`, so
 * there is nothing earlier to show.
 */
export function formatTimingLine(
  t: ClassTiming,
  mode: ClassDeliveryMode = "at_club",
): string {
  const parts: string[] = [];
  if (mode === "pickup" && t.coachArriveAt) {
    parts.push(`${format.time(t.coachArriveAt)} leave`);
  }
  if (t.pickupAt) {
    parts.push(`${format.time(t.pickupAt)} pickup`);
  }
  parts.push(`${format.time(t.classStartAt)}–${format.time(t.classEndAt)}`);
  return parts.join(" · ");
}

/**
 * Human label for a delivery mode. Used by Badge tones and free text.
 */
export function deliveryModeLabel(mode: ClassDeliveryMode): string {
  switch (mode) {
    case "pickup":
      return "Pickup";
    case "onsite":
      return "Onsite";
    case "at_club":
      return "At club";
  }
}
