"use client";

/**
 * Client-side invoice builder: a selectable table of unbilled line
 * items with a "Generate invoice" button that posts to
 * `createCoachInvoice`. Lives inside a client component because we
 * need per-row checkbox state and a live total.
 *
 * Serialization: the parent page passes dates as ISO strings so we
 * don't need to worry about serializing `Date` across the server /
 * client boundary.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEur } from "@/lib/invoicing/money";
import { createCoachInvoice } from "../../actions";

export interface InvoiceBuilderItem {
  refId: string;
  kind: "one_off" | "recurring_occurrence";
  courtName: string;
  clubName: string;
  description: string | null;
  startsAtIso: string;
  minutes: number;
  amount: number;
}

export function InvoiceBuilder({
  coachPersonId,
  periodStartUtc,
  periodEndUtc,
  periodIso,
  items,
}: {
  coachPersonId: string;
  periodStartUtc: string;
  periodEndUtc: string;
  periodIso: string;
  items: InvoiceBuilderItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.map((i) => i.refId)),
  );

  const allSelected = selected.size === items.length;
  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.refId)),
    [items, selected],
  );
  const total = selectedItems.reduce((s, i) => s + i.amount, 0);

  const toggle = (refId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId);
      else next.add(refId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.refId)));
  };

  const handleGenerate = () => {
    setError(null);
    if (selected.size === 0) {
      setError("Select at least one line item first.");
      return;
    }
    startTransition(async () => {
      const res = await createCoachInvoice({
        coachPersonId,
        refIds: Array.from(selected),
        periodStartUtc,
        periodEndUtc,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(
        `/admin/private-lessons/${coachPersonId}?period=${periodIso}&invoice=${encodeURIComponent(
          res.invoiceNumber,
        )}`,
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[1%]">
              <Checkbox
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead>When</TableHead>
            <TableHead className="text-right">Minutes</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const checked = selected.has(item.refId);
            return (
              <TableRow
                key={item.refId}
                data-state={checked ? "selected" : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={checked}
                    onChange={() => toggle(item.refId)}
                    aria-label={`Select ${item.refId}`}
                  />
                </TableCell>
                <TableCell>
                  {item.kind === "one_off" ? (
                    <Badge variant="outline">One-off</Badge>
                  ) : (
                    <Badge>Recurring</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{item.courtName}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {item.clubName}
                    {item.description && ` · ${item.description}`}
                  </div>
                </TableCell>
                <TableCell className="text-[var(--muted-foreground)]">
                  {formatWhen(item.startsAtIso)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.minutes}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatEur(item.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-[var(--muted-foreground)]">
          {selected.size} of {items.length} selected · Total{" "}
          <span className="font-medium text-[var(--foreground)]">
            {formatEur(total)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-sm text-[var(--danger-ink)]">{error}</span>
          )}
          <Button
            onClick={handleGenerate}
            loading={isPending}
            disabled={isPending || selected.size === 0}
          >
            {isPending ? "Generating..." : "Generate invoice"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
