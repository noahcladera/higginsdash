/**
 * Run: npx tsx src/lib/classes/session-dates.test.ts
 */
import assert from "node:assert/strict";
import {
  campWeekdayDateKeys,
  generateCampSessionDates,
  generateSessionsForSeries,
  toDateKey,
} from "./session-dates";

function dateUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function timeUtc(hh: number, mm: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hh, mm));
}

// One Mon–Fri week (2026-07-13 Mon .. 2026-07-17 Fri)
{
  const sessions = generateCampSessionDates({
    startsOn: dateUtc("2026-07-13"),
    endsOn: dateUtc("2026-07-17"),
    startTime: timeUtc(9, 0),
    endTime: timeUtc(15, 0),
    excluded: new Set(),
  });
  assert.equal(sessions.length, 5);
  assert.equal(toDateKey(sessions[0].startsAt), "2026-07-13");
  assert.equal(toDateKey(sessions[4].startsAt), "2026-07-17");
}

// Exclude Wednesday
{
  const sessions = generateCampSessionDates({
    startsOn: dateUtc("2026-07-13"),
    endsOn: dateUtc("2026-07-17"),
    startTime: timeUtc(9, 0),
    endTime: timeUtc(15, 0),
    excluded: new Set(["2026-07-15"]),
  });
  assert.equal(sessions.length, 4);
  assert.ok(!sessions.some((s) => toDateKey(s.startsAt) === "2026-07-15"));
}

// Two weeks → 10 weekdays (Sat/Sun in range ignored)
{
  const sessions = generateCampSessionDates({
    startsOn: dateUtc("2026-07-13"),
    endsOn: dateUtc("2026-07-24"),
    startTime: timeUtc(9, 0),
    endTime: timeUtc(15, 0),
    excluded: new Set(),
  });
  assert.equal(sessions.length, 10);
}

// Wrapper uses camp generator for classType camp
{
  const camp = generateSessionsForSeries("camp", {
    startsOn: dateUtc("2026-07-13"),
    endsOn: dateUtc("2026-07-17"),
    dayOfWeek: "mon",
    startTime: timeUtc(9, 0),
    endTime: timeUtc(15, 0),
    excluded: new Set(),
  });
  assert.equal(camp.length, 5);

  const weekly = generateSessionsForSeries("group_lesson", {
    startsOn: dateUtc("2026-07-13"),
    endsOn: dateUtc("2026-07-17"),
    dayOfWeek: "mon",
    startTime: timeUtc(9, 0),
    endTime: timeUtc(15, 0),
    excluded: new Set(),
  });
  assert.equal(weekly.length, 1);
}

assert.deepEqual(campWeekdayDateKeys("2026-07-13", "2026-07-17"), [
  "2026-07-13",
  "2026-07-14",
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
]);

console.log("session-dates: ok");
