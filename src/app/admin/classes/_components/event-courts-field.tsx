"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/components/tenant/terms-provider";

export type CourtOption = {
  id: string;
  name: string;
  clubId: string;
  isBookable?: boolean;
};

export function EventCourtsField({
  venueClubId,
  courts,
  assignedCourtIds,
  onAssignedCourtIdsChange,
  courtBlockStartTime,
  courtBlockEndTime,
  onCourtBlockStartTimeChange,
  onCourtBlockEndTimeChange,
  acknowledgeCourtConflicts,
  onAcknowledgeCourtConflictsChange,
  eventStartTime,
  eventEndTime,
}: {
  venueClubId: string | null;
  courts: CourtOption[];
  assignedCourtIds: string[];
  onAssignedCourtIdsChange: (ids: string[]) => void;
  courtBlockStartTime: string;
  courtBlockEndTime: string;
  onCourtBlockStartTimeChange: (value: string) => void;
  onCourtBlockEndTimeChange: (value: string) => void;
  acknowledgeCourtConflicts: boolean;
  onAcknowledgeCourtConflictsChange: (value: boolean) => void;
  eventStartTime: string;
  eventEndTime: string;
}) {
  const t = useTerms();
  const courtOptions = venueClubId
    ? courts.filter(
        (court) => court.clubId === venueClubId && court.isBookable !== false,
      )
    : [];

  function toggleCourt(id: string) {
    onAssignedCourtIdsChange(
      assignedCourtIds.includes(id)
        ? assignedCourtIds.filter((c) => c !== id)
        : [...assignedCourtIds, id],
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <input
        type="hidden"
        name="defaultCourtId"
        value={assignedCourtIds[0] ?? ""}
      />
      <input
        type="hidden"
        name="assignedCourtIdsJson"
        value={JSON.stringify(assignedCourtIds)}
      />
      <input
        type="hidden"
        name="acknowledgeCourtConflicts"
        value={acknowledgeCourtConflicts ? "true" : "false"}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{t.court.plural}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {venueClubId
                ? `Select every ${t.court.singular.toLowerCase()} this event uses.`
                : `Pick a ${t.club.singular.toLowerCase()} venue first.`}
            </p>
          </div>
          {venueClubId && courtOptions.length > 0 ? (
            <button
              type="button"
              className="shrink-0 text-[11px] text-[var(--muted-foreground)] underline-offset-2 hover:underline"
              onClick={() =>
                onAssignedCourtIdsChange(
                  assignedCourtIds.length === courtOptions.length
                    ? []
                    : courtOptions.map((c) => c.id),
                )
              }
            >
              {assignedCourtIds.length === courtOptions.length
                ? "Clear all"
                : "Select all"}
            </button>
          ) : null}
        </div>

        {!venueClubId ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            No {t.court.plural.toLowerCase()} to pick yet.
          </p>
        ) : courtOptions.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            No bookable {t.court.plural.toLowerCase()} at this{" "}
            {t.club.singular.toLowerCase()}.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {courtOptions.map((court) => {
              const checked = assignedCourtIds.includes(court.id);
              return (
                <label
                  key={court.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm",
                    checked
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border)] hover:bg-[var(--muted)]/30",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = assignedCourtIds.includes(court.id)
                        ? assignedCourtIds.filter((c) => c !== court.id)
                        : [...assignedCourtIds, court.id];
                      onAssignedCourtIdsChange(next);
                      if (
                        next.length > 0 &&
                        !courtBlockStartTime &&
                        eventStartTime
                      ) {
                        onCourtBlockStartTimeChange(eventStartTime);
                        onCourtBlockEndTimeChange(eventEndTime);
                      }
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <span>{court.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {assignedCourtIds.length > 0 ? (
        <>
          <input
            type="hidden"
            name="courtBlockStartTime"
            value={courtBlockStartTime}
          />
          <input
            type="hidden"
            name="courtBlockEndTime"
            value={courtBlockEndTime}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t.court.singular} block start
              </label>
              <Input
                type="time"
                value={courtBlockStartTime}
                onChange={(e) => onCourtBlockStartTimeChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t.court.singular} block end
              </label>
              <Input
                type="time"
                value={courtBlockEndTime}
                onChange={(e) => onCourtBlockEndTimeChange(e.target.value)}
                required
              />
            </div>
          </div>
          <label className="inline-flex items-start gap-2 text-xs text-[var(--muted-foreground)]">
            <input
              type="checkbox"
              checked={acknowledgeCourtConflicts}
              onChange={(e) =>
                onAcknowledgeCourtConflictsChange(e.currentTarget.checked)
              }
              className="mt-0.5 h-3.5 w-3.5"
            />
            If orange dates overlap existing bookings/classes, allow save and skip
            only conflicting dates.
          </label>
        </>
      ) : (
        <>
          <input type="hidden" name="courtBlockStartTime" value="" />
          <input type="hidden" name="courtBlockEndTime" value="" />
        </>
      )}
    </div>
  );
}
