import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RequestStatusBadge } from "@/components/workflow/request-status-badge";

/*
 * BookingRow — a single court booking, presented as an editorial row
 * (timestamp on the left, where + by + status on the right).
 *
 * Used on /portal/bookings, /coach/bookings, and the dashboard "up next"
 * cards. Click target is optional — pass `href` to make the whole row a link.
 */
export interface BookingRowProps {
  startsAt: Date;
  endsAt?: Date;
  club: string;
  court: string;
  bookedBy?: { name: string; isYou?: boolean };
  status: string;
  /**
   * When `status === "cancellation_requested"`, this caption is rendered as a
   * subline so members understand the slot is blocked pending review and
   * (optionally) why the coach asked. Without it, the badge alone is opaque.
   */
  cancellationNote?: {
    requestedByName?: string | null;
    reason?: string | null;
  };
  /** Optional purpose pill on the right (used by coach view). */
  purpose?: {
    label: string;
    tone?: "triaz" | "randwijck" | "joint" | "neutral";
  };
  href?: string;
  /** Compact inset-list styling for mobile grouped sections. */
  variant?: "default" | "grouped";
}

export function BookingRow({
  startsAt,
  endsAt,
  club,
  court,
  bookedBy,
  status,
  cancellationNote,
  purpose,
  href,
  variant = "default",
}: BookingRowProps) {
  const date = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  }).format(startsAt);
  const timeEnd = endsAt
    ? new Intl.DateTimeFormat("en-NL", {
        timeZone: "Europe/Amsterdam",
        hour: "2-digit",
        minute: "2-digit",
      }).format(endsAt)
    : null;

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    href ? (
      <Link
        href={href}
        className={cn(
          "block transition-colors",
          variant === "grouped"
            ? "active:bg-[var(--muted)]/40"
            : "rounded-[var(--radius-md)] hover:bg-[var(--surface-strong)]",
        )}
      >
        {children}
      </Link>
    ) : (
      <div>{children}</div>
    );

  if (variant === "grouped") {
    return (
      <Wrapper>
        <div className="flex min-h-[3rem] items-center gap-3 px-4 py-2.5">
          <div className="w-[4.5rem] shrink-0 text-center">
            <div className="tabular font-display text-lg font-medium leading-tight">
              {time}
            </div>
            {timeEnd && (
              <div className="tabular text-[10px] text-[var(--muted-foreground)]">
                {timeEnd}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium">
              {club} · {court}
            </div>
            <div className="truncate text-xs text-[var(--muted-foreground)]">
              {date}
              {bookedBy && ` · ${bookedBy.isYou ? "You" : bookedBy.name}`}
            </div>
            {status === "cancellation_requested" && cancellationNote?.reason && (
              <div className="truncate text-[11px] text-[var(--warning-ink)]">
                {cancellationNote.reason}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {purpose && (
              <Badge tone={purpose.tone ?? "neutral"} variant="soft" className="capitalize">
                {purpose.label}
              </Badge>
            )}
            <StatusBadge status={status} />
          </div>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-4 sm:w-24 sm:shrink-0 sm:flex-col sm:items-start">
          <div className="tabular text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            {date}
          </div>
          <div className="tabular font-display text-xl font-medium leading-tight tracking-tight">
            {time}
          </div>
          {timeEnd && (
            <div className="tabular text-[11px] text-[var(--muted-foreground)]">
              → {timeEnd}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {club} · {court}
          </div>
          {bookedBy && (
            <div className="truncate text-xs text-[var(--muted-foreground)]">
              Booked by {bookedBy.isYou ? "you" : bookedBy.name}
            </div>
          )}
          {status === "cancellation_requested" && cancellationNote && (
            <div className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
              {cancellationNote.requestedByName
                ? `${cancellationNote.requestedByName} asked the office to cancel.`
                : "Cancellation pending office review."}
              {cancellationNote.reason
                ? ` Reason: ${cancellationNote.reason}`
                : ""}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {purpose && (
            <Badge tone={purpose.tone ?? "neutral"} variant="soft">
              {purpose.label}
            </Badge>
          )}
          <StatusBadge status={status} />
        </div>
      </div>
    </Wrapper>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "confirmed":
      return <Badge tone="success">Confirmed</Badge>;
    case "cancellation_requested":
      return <RequestStatusBadge status="pending" />;
    case "cancelled":
      return <Badge tone="neutral">Cancelled</Badge>;
    case "completed":
      return <Badge variant="outline">Completed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/**
 * BookingList — wraps multiple BookingRows with a hairline divider
 * between rows and a slight vertical rhythm.
 */
export function BookingList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grouped-section divide-y divide-[var(--content-separator)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
