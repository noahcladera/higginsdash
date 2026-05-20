"use server";

import { createClassSeries } from "../classes/actions";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type DayKey = (typeof DAY_KEYS)[number];

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayKeyFromIso(isoDate: string): DayKey {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return DAY_KEYS[utc.getUTCDay()];
}

/**
 * Event-first create action:
 * - accepts a single `eventDate`
 * - maps it onto the existing ClassSeries contract
 * - reuses `createClassSeries` for persistence/validation
 */
export async function createEventSeries(formData: FormData) {
  const eventDateRaw = String(formData.get("eventDate") ?? "").trim();
  if (!isIsoDate(eventDateRaw)) {
    throw new Error("Event date is required.");
  }

  const payload = new FormData();
  formData.forEach((value, key) => {
    payload.append(key, value);
  });
  payload.set("classType", "event");
  payload.set("deliveryMode", "at_club");
  payload.set("dayOfWeek", dayKeyFromIso(eventDateRaw));
  payload.set("startsOn", eventDateRaw);
  payload.set("endsOn", eventDateRaw);
  payload.set("excludedDates", "");
  payload.set("programId", "");
  payload.set("seasonId", "");
  payload.set("schoolId", "");
  payload.set("pickupAt", "");
  payload.set("coachAssignmentsJson", "");
  payload.set("groupsJson", "");
  payload.set("campOptionsJson", "");
  payload.set("defaultCourtId", "");
  payload.set("courtBlockStartTime", "");
  payload.set("courtBlockEndTime", "");
  payload.set("acknowledgeCourtConflicts", "false");
  payload.set("useOverride", "false");
  payload.set("nameOverride", "");
  payload.set("pricePerSessionEur", "");

  await createClassSeries(payload);
}
