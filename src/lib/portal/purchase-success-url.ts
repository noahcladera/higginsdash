import { isSafeInternalPath } from "@/lib/safe-redirect";

export type PurchaseSuccessKind =
  | "enrollment"
  | "waitlist"
  | "membership"
  | "booking";

export function portalPurchaseSuccessUrl(args: {
  kind: PurchaseSuccessKind;
  next: string;
  seriesId?: string;
  studentName?: string;
  paymentId?: string;
  amountEur?: number;
}): string {
  const next = isSafeInternalPath(args.next) ? args.next : "/portal";
  const params = new URLSearchParams({ kind: args.kind, next });
  if (args.seriesId) params.set("series", args.seriesId);
  if (args.studentName) params.set("student", args.studentName.slice(0, 60));
  if (args.paymentId) params.set("payment", args.paymentId);
  if (args.amountEur != null && args.amountEur > 0) {
    params.set("amount", String(args.amountEur));
  }
  return `/portal/success?${params.toString()}`;
}

export function enrollmentSuccessUrl(args: {
  seriesId: string;
  studentName: string;
  paymentId?: string;
  waitlist?: boolean;
  amountEur?: number;
}): string {
  return portalPurchaseSuccessUrl({
    kind: args.waitlist ? "waitlist" : "enrollment",
    next: "/portal/classes",
    seriesId: args.seriesId,
    studentName: args.studentName,
    paymentId: args.paymentId,
    amountEur: args.amountEur,
  });
}
