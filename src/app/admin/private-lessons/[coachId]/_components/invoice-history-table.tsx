"use client";

/**
 * History table for coach invoices with an inline expand-to-send panel
 * per row. Keeps the visual density of the original table but lets
 * admins fire off a breakdown email without leaving the page.
 */

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEur } from "@/lib/invoicing/money";
import { SendInvoiceCard } from "./send-invoice-card";

export interface InvoiceHistoryRow {
  paymentId: string;
  invoiceNumber: string | null;
  amount: number;
  status: string;
  issuedAtIso: string | null;
  description: string;
  lineCount: number;
  checkoutUrl: string | null;
}

export function InvoiceHistoryTable({
  rows,
  defaultEmail,
  initiallyExpandedInvoiceNumber,
}: {
  rows: InvoiceHistoryRow[];
  defaultEmail: string | null;
  /** If set, expand the matching row on first render (success banner flow). */
  initiallyExpandedInvoiceNumber?: string;
}) {
  const initialExpanded = (() => {
    if (!initiallyExpandedInvoiceNumber) return null;
    const match = rows.find(
      (r) => r.invoiceNumber === initiallyExpandedInvoiceNumber,
    );
    return match?.paymentId ?? null;
  })();
  const [expanded, setExpanded] = useState<string | null>(initialExpanded);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead className="text-right">Lines</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right w-[1%]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isOpen = expanded === row.paymentId;
          return (
            <Fragment key={row.paymentId}>
              <TableRow>
                <TableCell className="font-mono text-xs">
                  {row.invoiceNumber ?? "—"}
                </TableCell>
                <TableCell className="max-w-[28ch] truncate">
                  {row.description}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.status}</Badge>
                </TableCell>
                <TableCell className="text-[var(--muted-foreground)]">
                  {row.issuedAtIso
                    ? new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeZone: "Europe/Amsterdam",
                      }).format(new Date(row.issuedAtIso))
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.lineCount}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatEur(row.amount)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant={isOpen ? "secondary" : "outline"}
                    onClick={() =>
                      setExpanded(isOpen ? null : row.paymentId)
                    }
                  >
                    {isOpen ? "Close" : "Send →"}
                  </Button>
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow className="bg-[var(--muted)]/30">
                  <TableCell colSpan={7} className="p-3">
                    <SendInvoiceCard
                      paymentId={row.paymentId}
                      invoiceNumber={row.invoiceNumber ?? "—"}
                      amountLabel={formatEur(row.amount)}
                      defaultEmail={defaultEmail}
                      checkoutUrl={row.checkoutUrl}
                    />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
