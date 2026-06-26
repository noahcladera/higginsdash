"use client";

import { useEffect, useMemo, useState } from "react";
import { previewEventScheduleConflicts } from "../actions";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export function useEventScheduleConflicts(args: {
  assignedCourtIds: string[];
  dayOfWeek: DayKey;
  startsOn: string;
  endsOn: string;
  courtBlockStartTime: string;
  courtBlockEndTime: string;
  excludedDates: Set<string>;
  enabled: boolean;
}) {
  const [conflicts, setConflicts] = useState<Set<string>>(() => new Set());
  const excludedCsv = useMemo(
    () => [...args.excludedDates].sort().join(","),
    [args.excludedDates],
  );

  useEffect(() => {
    if (!args.enabled) {
      setConflicts(new Set());
      return;
    }
    if (
      args.assignedCourtIds.length === 0 ||
      !args.startsOn ||
      !args.endsOn ||
      !args.courtBlockStartTime ||
      !args.courtBlockEndTime
    ) {
      setConflicts(new Set());
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await previewEventScheduleConflicts({
        assignedCourtIdsJson: JSON.stringify(args.assignedCourtIds),
        dayOfWeek: args.dayOfWeek,
        startsOn: args.startsOn,
        endsOn: args.endsOn,
        courtBlockStartTime: args.courtBlockStartTime,
        courtBlockEndTime: args.courtBlockEndTime,
        excludedDates: excludedCsv,
      });
      if (cancelled) return;
      if (result.ok) {
        setConflicts(new Set(result.clashes.map((c) => c.date)));
      } else {
        setConflicts(new Set());
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    args.enabled,
    args.assignedCourtIds,
    args.dayOfWeek,
    args.startsOn,
    args.endsOn,
    args.courtBlockStartTime,
    args.courtBlockEndTime,
    excludedCsv,
  ]);

  return conflicts;
}

export function dayKeyFromIso(isoDate: string): DayKey {
  const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return DAY_KEYS[utc.getUTCDay()];
}
