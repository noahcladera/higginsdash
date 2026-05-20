"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminCalendarSession } from "@/lib/admin/classes-queries";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/components/tenant/terms-provider";
import type { Terms } from "@/lib/tenant/terms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClassSummaryCard } from "./class-summary-card";

type ChipTone = "triaz" | "randwijck" | "joint";

function audienceTone(audience: AdminCalendarSession["programTargetAudience"]): ChipTone {
  if (audience === "kids") return "triaz";
  if (audience === "adults") return "randwijck";
  return "joint";
}

const TONE_BORDER: Record<ChipTone, string> = {
  triaz: "border-[var(--triaz-ink)]/30 bg-[var(--triaz-soft)]",
  randwijck: "border-[var(--randwijck-ink)]/30 bg-[var(--randwijck-soft)]",
  joint: "border-[var(--joint-ink)]/40 bg-[var(--joint-soft)]",
};

function blockTooltip(s: AdminCalendarSession, t: Terms): string {
  const lines: string[] = [];
  lines.push(`${s.programName} · ${s.seriesName}`);
  if (s.deliveryMode === "pickup" && s.leaveAt && s.pickupAt) {
    lines.push(`Leave ${t.club.singular}: ${format.time(s.leaveAt)}`);
    lines.push(
      `Pickup ${s.schoolName ?? t.school.singular.toLowerCase()}: ${format.time(s.pickupAt)}`,
    );
  }
  lines.push(
    `${t.class.singular}: ${format.time(s.classStartAt)}–${format.time(s.classEndAt)}`,
  );
  lines.push(`${t.venue.singular}: ${s.venueName}`);
  if (s.clubName) lines.push(`${t.club.singular}: ${s.clubName}`);
  const groups = s.summary.subGroups ?? [];
  if (groups.length > 1) {
    lines.push("");
    lines.push(`${t.classGroup.plural}:`);
    for (const g of groups) {
      const ageStr =
        g.minAge == null && g.maxAge == null
          ? ""
          : g.minAge != null && g.maxAge != null
            ? ` (${g.minAge}–${g.maxAge}y)`
            : g.minAge != null
              ? ` (${g.minAge}+y)`
              : ` (≤${g.maxAge}y)`;
      lines.push(`  • ${g.name} → ${g.endTimeHHMM}${ageStr}`);
    }
  }
  return lines.join("\n");
}

function PickupSegments({
  session,
  height,
  terms,
}: {
  session: AdminCalendarSession;
  height: number;
  terms: Terms;
}) {
  const leaveAt = session.leaveAt!;
  const pickupAt = session.pickupAt!;
  const total = session.classEndAt.getTime() - leaveAt.getTime();
  const seg1 = ((pickupAt.getTime() - leaveAt.getTime()) / total) * height;
  const seg2 =
    ((session.classStartAt.getTime() - pickupAt.getTime()) / total) * height;
  const seg3 = height - seg1 - seg2;

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-start gap-1 overflow-hidden border-b border-[var(--joint-ink)]/20 px-1.5 py-1 text-[var(--joint-ink)]"
        style={{ height: seg1 }}
      >
        <span className="tabular shrink-0 whitespace-nowrap font-semibold">
          {format.time(leaveAt)}
        </span>
        <span className="truncate opacity-80">
          leave {terms.club.singular.toLowerCase()}
        </span>
      </div>
      <div
        className="flex items-start gap-1 overflow-hidden border-b border-[var(--joint-ink)]/20 bg-[var(--joint-soft)]/60 px-1.5 py-1 text-[var(--joint-ink)]"
        style={{ height: seg2 }}
      >
        <span className="tabular shrink-0 whitespace-nowrap font-semibold">
          {format.time(pickupAt)}
        </span>
        <span className="truncate opacity-80">
          pickup {session.schoolName ?? ""}
        </span>
      </div>
      <div
        className="flex flex-col items-start gap-0 px-1.5 py-1"
        style={{ height: seg3 }}
      >
        <div className="tabular truncate whitespace-nowrap font-semibold text-[var(--foreground)]">
          {format.time(session.classStartAt)}–
          {format.time(session.classEndAt)}
        </div>
        <div className="truncate text-[10px] text-[var(--muted-foreground)]">
          {session.seriesName}
        </div>
      </div>
    </div>
  );
}

function SingleSegment({ session }: { session: AdminCalendarSession }) {
  return (
    <div className="flex h-full flex-col gap-0.5 px-1.5 py-1">
      <div className="tabular truncate whitespace-nowrap font-semibold text-[var(--foreground)]">
        {format.time(session.classStartAt)}–{format.time(session.classEndAt)}
      </div>
      <div className="truncate text-[10px] text-[var(--muted-foreground)]">
        {session.seriesName}
      </div>
      <div className="mt-auto flex items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[10px] text-[var(--muted-foreground)]">
          {session.venueName}
        </span>
        {session.clubName && (
          <span
            className="shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
            title={session.clubName}
          >
            {session.clubName.slice(0, 3)}
          </span>
        )}
      </div>
    </div>
  );
}

export function AdminSessionGridBlock({
  session,
  top,
  height,
}: {
  session: AdminCalendarSession;
  top: number;
  height: number;
}) {
  const [open, setOpen] = useState(false);
  const terms = useTerms();
  const tone = audienceTone(session.programTargetAudience);
  const isPickup =
    session.deliveryMode === "pickup" && session.leaveAt && session.pickupAt;

  return (
    <>
      <button
        type="button"
        title={blockTooltip(session, terms)}
        onClick={() => setOpen(true)}
        className={cn(
          "absolute inset-x-1 overflow-hidden rounded-md border text-left text-[11px] shadow-[var(--shadow-sm)] transition-colors hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          TONE_BORDER[tone],
        )}
        style={{ top, height }}
      >
        {isPickup ? (
          <PickupSegments session={session} height={height} terms={terms} />
        ) : (
          <SingleSegment session={session} />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="sr-only">{session.seriesName}</DialogTitle>
          </DialogHeader>
          <ClassSummaryCard {...session.summary} />
          <div className="flex justify-end gap-2 pt-2">
            <Button asChild tone="triaz" size="sm">
              <Link href={`/admin/classes/${session.classSeriesId}`}>
                Open full edit
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Compact row for mobile stacked layout. */
export function AdminSessionRow({ session }: { session: AdminCalendarSession }) {
  const [open, setOpen] = useState(false);
  const tone = audienceTone(session.programTargetAudience);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm shadow-[var(--shadow-sm)] transition-colors hover:brightness-105",
          TONE_BORDER[tone],
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="tabular font-semibold">
            {format.time(session.classStartAt)}–{format.time(session.classEndAt)}
          </span>
          {session.clubName && (
            <span className="shrink-0 text-[10px] font-medium uppercase text-[var(--muted-foreground)]">
              {session.clubName}
            </span>
          )}
        </div>
        <span className="font-medium leading-tight">{session.seriesName}</span>
        <span className="text-xs text-[var(--muted-foreground)]">
          {session.programName} · {session.venueName}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="sr-only">{session.seriesName}</DialogTitle>
          </DialogHeader>
          <ClassSummaryCard {...session.summary} />
          <div className="flex justify-end gap-2 pt-2">
            <Button asChild tone="triaz" size="sm">
              <Link href={`/admin/classes/${session.classSeriesId}`}>
                Open full edit
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
