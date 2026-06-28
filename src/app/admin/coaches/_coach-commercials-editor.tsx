"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  updateCoachCommercials,
  updateZzpCoachCommercials,
} from "./actions";
import type { CoachEmploymentType } from "@prisma/client";

export interface StaffCommercials {
  defaultHourlyRate: number | null;
  courtRentalRate: number | null;
  knltbQualification: string | null;
  employmentType: CoachEmploymentType;
  isActive: boolean;
}

export interface ZzpCommercials {
  defaultCourtRentalRate: number | null;
  isActive: boolean;
}

/**
 * Inline editor for a staff `Coach` row. Collapsed by default — admins
 * see a single readout line, then click "Edit" to expand into a small
 * form. We deliberately don't auto-save; coaches are paid from these
 * numbers and a stray keystroke shouldn't drop hourly rates.
 */
export function StaffCommercialsEditor({
  coachPersonId,
  initial,
}: {
  coachPersonId: string;
  initial: StaffCommercials;
}) {
  const [open, setOpen] = useState(false);
  const [hourly, setHourly] = useState(formatRate(initial.defaultHourlyRate));
  const [court, setCourt] = useState(formatRate(initial.courtRentalRate));
  const [knltb, setKnltb] = useState(initial.knltbQualification ?? "");
  const [empType, setEmpType] = useState<CoachEmploymentType>(initial.employmentType);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okFlash, setOkFlash] = useState(false);

  return (
    <div className="elev-panel mt-2 p-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
          <span>
            Hourly:{" "}
            <span className="text-[var(--foreground)] font-medium">
              {formatEuro(initial.defaultHourlyRate)}
            </span>
          </span>
          <span>
            Court:{" "}
            <span className="text-[var(--foreground)] font-medium">
              {formatEuro(initial.courtRentalRate)}
            </span>
          </span>
          <span>
            KNLTB:{" "}
            <span className="text-[var(--foreground)]">
              {initial.knltbQualification || "—"}
            </span>
          </span>
          <span className="capitalize">
            {initial.employmentType === "employee" ? "Employee" : "Freelance"}
          </span>
          {!initial.isActive && (
            <Badge tone="warning" className="px-1.5 py-px text-[10px] leading-4 shadow-none">
              Inactive
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancel" : "Edit"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`hourly-${coachPersonId}`}>
              Default hourly rate (€/h)
            </Label>
            <Input
              id={`hourly-${coachPersonId}`}
              inputMode="decimal"
              placeholder="leave blank for default"
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`court-${coachPersonId}`}>
              Court rental rate (€/h)
            </Label>
            <Input
              id={`court-${coachPersonId}`}
              inputMode="decimal"
              placeholder="leave blank for default"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`knltb-${coachPersonId}`}>
              KNLTB qualification
            </Label>
            <Input
              id={`knltb-${coachPersonId}`}
              placeholder="e.g. Tennisleraar A"
              value={knltb}
              onChange={(e) => setKnltb(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`emp-${coachPersonId}`}>Employment</Label>
            <select
              id={`emp-${coachPersonId}`}
              value={empType}
              onChange={(e) =>
                setEmpType(e.target.value as CoachEmploymentType)
              }
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
            >
              <option value="employee">Employee</option>
              <option value="freelancer">Freelance</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            {error && (
              <span className="self-center text-xs text-[var(--destructive)]">
                {error}
              </span>
            )}
            {okFlash && (
              <span className="self-center text-xs text-[var(--triaz-ink)]">
                Saved
              </span>
            )}
            <Button
              size="sm"
              tone="triaz"
              loading={pending}
              onClick={() => {
                setError(null);
                setOkFlash(false);
                startTransition(async () => {
                  const res = await updateCoachCommercials({
                    coachPersonId,
                    defaultHourlyRate: hourly.trim() === "" ? null : hourly,
                    courtRentalRate: court.trim() === "" ? null : court,
                    knltbQualification:
                      knltb.trim() === "" ? null : knltb.trim(),
                    employmentType: empType,
                    isActive,
                  });
                  if (!res.ok) {
                    setError(res.error);
                  } else {
                    setOkFlash(true);
                    setOpen(false);
                  }
                });
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Slimmer variant for ZZP coaches. ZZPs only have a court-rental
 * override and an active flag — pricing per session is invoiced by
 * the freelancer themselves, so there's no employer hourly rate.
 */
export function ZzpCommercialsEditor({
  zzpPersonId,
  initial,
}: {
  zzpPersonId: string;
  initial: ZzpCommercials;
}) {
  const [open, setOpen] = useState(false);
  const [court, setCourt] = useState(formatRate(initial.defaultCourtRentalRate));
  const [isActive, setIsActive] = useState(initial.isActive);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okFlash, setOkFlash] = useState(false);

  return (
    <div className="elev-panel mt-2 p-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
          <span>
            Court rental:{" "}
            <span className="text-[var(--foreground)] font-medium">
              {formatEuro(initial.defaultCourtRentalRate)}
            </span>
          </span>
          {!initial.isActive && (
            <Badge tone="warning" className="px-1.5 py-px text-[10px] leading-4 shadow-none">
              Inactive
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancel" : "Edit"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`zzp-court-${zzpPersonId}`}>
              Default court rental rate (€/h)
            </Label>
            <Input
              id={`zzp-court-${zzpPersonId}`}
              inputMode="decimal"
              placeholder="leave blank for global"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            {error && (
              <span className="self-center text-xs text-[var(--destructive)]">
                {error}
              </span>
            )}
            {okFlash && (
              <span className="self-center text-xs text-[var(--triaz-ink)]">
                Saved
              </span>
            )}
            <Button
              size="sm"
              tone="triaz"
              loading={pending}
              onClick={() => {
                setError(null);
                setOkFlash(false);
                startTransition(async () => {
                  const res = await updateZzpCoachCommercials({
                    zzpPersonId,
                    defaultCourtRentalRate:
                      court.trim() === "" ? null : court,
                    isActive,
                  });
                  if (!res.ok) {
                    setError(res.error);
                  } else {
                    setOkFlash(true);
                    setOpen(false);
                  }
                });
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRate(n: number | null): string {
  return n == null ? "" : n.toFixed(2);
}

function formatEuro(n: number | null): string {
  return n == null ? "—" : `€${n.toFixed(2)}`;
}
