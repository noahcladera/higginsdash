"use client";

import * as React from "react";
import { ClockIcon, FlagIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface LegacyPaymentRow {
  date: string | null;
  student: string;
  class: string;
  status: string;
  paidCents: number;
  refundedCents: number;
}
export interface LegacyCalendarRow {
  date: string | null;
  calendar: string;
  event: string;
}
export interface LegacyEmailRow {
  date: string | null;
  subject: string;
  direction: string;
  sensitivity: string;
  flagged: boolean;
}

export interface LegacyHistoryPanelProps {
  displayName: string;
  totalPaid: string;
  totalRefunded: string;
  bookingCount: number;
  emailCount: number;
  complaintCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  payments: LegacyPaymentRow[];
  calendar: LegacyCalendarRow[];
  emails: LegacyEmailRow[];
}

const euros = new Intl.NumberFormat("en-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function money(cents: number): string {
  return euros.format(cents / 100);
}

type TabKey = "payments" | "calendar" | "emails";

export function LegacyHistoryPanel(props: LegacyHistoryPanelProps) {
  const [tab, setTab] = React.useState<TabKey>("payments");

  const range =
    props.firstSeen && props.lastSeen
      ? `${props.firstSeen} → ${props.lastSeen}`
      : props.firstSeen || props.lastSeen || "unknown";

  const summary: Array<{ label: string; value: string }> = [
    { label: "Bookings", value: String(props.bookingCount) },
    { label: "Paid", value: props.totalPaid },
    { label: "Refunded", value: props.totalRefunded },
    { label: "Emails", value: String(props.emailCount) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {summary.map((s) => (
          <div key={s.label} className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {s.label}
            </span>
            <span className="font-display text-2xl font-medium leading-none">
              {s.value}
            </span>
          </div>
        ))}
        {props.complaintCount > 0 && (
          <Badge tone="warning" className="gap-1">
            <FlagIcon /> {props.complaintCount} flagged
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <ClockIcon className="size-3.5" />
        <span>{range}</span>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            View full history
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Legacy history — {props.displayName}</DialogTitle>
            <DialogDescription>
              Pre-migration data assembled by the Higgins brain (GoTimmy,
              calendars, office email). Reference only — verify before trusting.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 border-b border-[var(--border)]">
            <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>
              Payments ({props.payments.length})
            </TabButton>
            <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")}>
              Calendar ({props.calendar.length})
            </TabButton>
            <TabButton active={tab === "emails"} onClick={() => setTab("emails")}>
              Emails ({props.emails.length})
            </TabButton>
          </div>

          <div className="max-h-[55vh] overflow-y-auto">
            {tab === "payments" && <PaymentsTable rows={props.payments} />}
            {tab === "calendar" && <CalendarTable rows={props.calendar} />}
            {tab === "emails" && <EmailsTable rows={props.emails} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors " +
        (active
          ? "border-[var(--foreground)] text-[var(--foreground)]"
          : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
      }
    >
      {children}
    </button>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={
        "px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] " +
        (right ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}

function Td({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td
      className={
        "px-2 py-1.5 align-top " +
        (right ? "text-right tabular-nums " : "") +
        (muted ? "text-[var(--muted-foreground)]" : "")
      }
    >
      {children}
    </td>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-2 py-6 text-center text-sm text-[var(--muted-foreground)]">
        {text}
      </td>
    </tr>
  );
}

function PaymentsTable({ rows }: { rows: LegacyPaymentRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-[var(--card)]">
        <tr className="border-b border-[var(--border)]">
          <Th>Date</Th>
          <Th>Student</Th>
          <Th>Class</Th>
          <Th>Status</Th>
          <Th right>Paid</Th>
          <Th right>Refunded</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyRow cols={6} text="No payment history." />}
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-[var(--border)]/60">
            <Td muted>{r.date ?? "—"}</Td>
            <Td>{r.student}</Td>
            <Td>{r.class}</Td>
            <Td>{r.status}</Td>
            <Td right>{money(r.paidCents)}</Td>
            <Td right>{r.refundedCents > 0 ? money(r.refundedCents) : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CalendarTable({ rows }: { rows: LegacyCalendarRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-[var(--card)]">
        <tr className="border-b border-[var(--border)]">
          <Th>Date</Th>
          <Th>Calendar</Th>
          <Th>Event</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyRow cols={3} text="No matched calendar events." />}
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-[var(--border)]/60">
            <Td muted>{r.date ?? "—"}</Td>
            <Td muted>{r.calendar}</Td>
            <Td>{r.event}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmailsTable({ rows }: { rows: LegacyEmailRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-[var(--card)]">
        <tr className="border-b border-[var(--border)]">
          <Th>Date</Th>
          <Th>Subject</Th>
          <Th>Direction</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyRow cols={4} text="No email history." />}
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-[var(--border)]/60">
            <Td muted>{r.date ?? "—"}</Td>
            <Td>{r.subject}</Td>
            <Td muted>{r.direction}</Td>
            <Td>{r.flagged && <Badge tone="warning" className="gap-1"><FlagIcon /> issue</Badge>}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
