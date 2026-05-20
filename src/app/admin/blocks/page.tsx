import Link from "next/link";
import type { RecurringBlockPurpose, RecurringBlockScope } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { blockStatusTone } from "@/lib/ui/status-tone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CancelBlockButton } from "./cancel-block-button";
import { ScopeBadge, ScopeToggle } from "./scope-toggle";

const DOW_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** Lesson-style blocks always reserve the court fully — scope is fixed. */
const LESSON_PURPOSES: RecurringBlockPurpose[] = ["coach_private_lesson"];

function isLessonPurpose(p: RecurringBlockPurpose): boolean {
  return LESSON_PURPOSES.includes(p);
}

function formatTime(t: Date) {
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface BlockRow {
  id: string;
  purposeType: RecurringBlockPurpose;
  purposeDescription: string;
  scope: RecurringBlockScope;
  internalNotes: string | null;
  dayOfWeek: string | null;
  startTime: Date;
  endTime: Date;
  startsOn: Date;
  endsOn: Date;
  status: string;
  court: { name: string };
  requesterPerson: { firstName: string; lastName: string };
}

export default async function AdminBlocksPage() {
  await requireAdmin();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const pendingRequestCount = await prisma.recurringBlock.count({
    where: { status: "pending" },
  });

  const clubs = await prisma.club.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      recurringBlocks: {
        where: {
          OR: [
            { status: "active" },
            { status: "cancelled", cancelledAt: { gte: thirtyDaysAgo } },
            { status: "expired", endsOn: { gte: thirtyDaysAgo } },
          ],
        },
        orderBy: [{ startsOn: "asc" }, { startTime: "asc" }],
        include: {
          court: { select: { name: true } },
          requesterPerson: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Admin"
        title="Blocks"
        description="Time ranges where bookable spaces are unavailable. Some block kinds reserve the space fully; others can be set to Members only so staff can still teach through the window."
      />

      <div className="flex justify-end">
        <Link
          href="/admin/blocks/requests"
          className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)]/60"
        >
          Recurring booking requests
          {pendingRequestCount > 0 && (
            <Badge tone="warning" variant="soft">
              {pendingRequestCount} pending
            </Badge>
          )}
        </Link>
      </div>

      {clubs.map((club) => {
        const active = club.recurringBlocks.filter(
          (b) =>
            b.status === "active" &&
            b.startsOn <= today &&
            b.endsOn >= today,
        );
        const upcoming = club.recurringBlocks.filter(
          (b) => b.status === "active" && b.startsOn > today,
        );
        const ended = club.recurringBlocks.filter(
          (b) => b.status !== "active" || b.endsOn < today,
        );

        return (
          <section key={club.id} className="space-y-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-medium tracking-tight">
                {club.name}
              </h2>
              <Link
                href="/admin/bookings"
                className="text-xs underline hover:text-[var(--accent)]"
              >
                Open bookings calendar →
              </Link>
            </div>

            <BlockBucket title="Active now" rows={active} />
            <BlockBucket title="Upcoming" rows={upcoming} />
            <BlockBucket
              title="Recently ended (last 30 days)"
              rows={ended}
              muted
            />
          </section>
        );
      })}
    </div>
  );
}

/**
 * One time bucket (Active / Upcoming / Recently ended). Splits its rows
 * into "Lessons" (coach private + class capacity) and "Others / External"
 * (admin / partner blocks like Kids Actief or KV Triaz korfball) with their
 * own tables.
 */
function BlockBucket({
  title,
  rows,
  muted,
}: {
  title: string;
  muted?: boolean;
  rows: BlockRow[];
}) {
  const lessons = rows.filter((b) => isLessonPurpose(b.purposeType));
  const others = rows.filter((b) => !isLessonPurpose(b.purposeType));

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-xs text-[var(--muted-foreground)]">
        <span className="font-medium">{title}:</span> none.
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${muted ? "opacity-80" : ""}`}>
      <header className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {title}
      </header>
      <BlockSubsection
        title="Lessons"
        emptyHint="No private-lesson series or class-capacity holds in this period."
        rows={lessons}
        kind="lessons"
      />
      <BlockSubsection
        title="Others / External"
        emptyHint="No external partner or admin blocks in this period (e.g. Kids Actief, KV Triaz korfball, maintenance)."
        rows={others}
        kind="others"
      />
    </div>
  );
}

function BlockSubsection({
  title,
  emptyHint,
  rows,
  kind,
}: {
  title: string;
  emptyHint: string;
  rows: BlockRow[];
  kind: "lessons" | "others";
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-[11px] text-[var(--muted-foreground)]">
        <span className="font-medium">{title}:</span> {emptyHint}
      </div>
    );
  }

  const showScope = true;

  return (
    <div className="rounded-md border border-[var(--border)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)]">
        {title}
        <span className="ml-2 text-[11px] font-normal text-[var(--muted-foreground)]">
          {rows.length} block{rows.length === 1 ? "" : "s"}
        </span>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Court</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Range</TableHead>
            {showScope && <TableHead>Scope</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell>
                <div className="font-medium">{b.purposeDescription}</div>
                {b.internalNotes && (
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {b.internalNotes}
                  </div>
                )}
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  by {b.requesterPerson.firstName} {b.requesterPerson.lastName}
                </div>
              </TableCell>
              <TableCell className="text-xs">{b.court.name}</TableCell>
              <TableCell className="text-xs">
                {b.dayOfWeek ? DOW_LABEL[b.dayOfWeek] : "Every day"}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {formatTime(b.startTime)}–{formatTime(b.endTime)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {formatDate(b.startsOn)} → {formatDate(b.endsOn)}
              </TableCell>
              {showScope && (
                <TableCell>
                  {kind === "others" && b.status === "active" ? (
                    <ScopeToggle blockId={b.id} scope={b.scope} />
                  ) : (
                    <ScopeBadge scope={b.scope} />
                  )}
                </TableCell>
              )}
              <TableCell>
                <Badge tone={blockStatusTone(b.status)} variant="soft" className="capitalize">
                  {b.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {b.status === "active" && <CancelBlockButton id={b.id} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
