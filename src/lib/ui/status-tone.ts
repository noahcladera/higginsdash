import type { TrialInterestStatus } from "@prisma/client";

/** Matches `Badge` tone variants — single source for status color semantics. */
export type StatusTone =
  | "neutral"
  | "triaz"
  | "randwijck"
  | "joint"
  | "success"
  | "warning"
  | "danger";

export const TRIAL_INTEREST_STATUS_TONE: Record<
  TrialInterestStatus,
  StatusTone
> = {
  new: "warning",
  in_progress: "joint",
  scheduled: "joint",
  converted: "success",
  closed: "neutral",
};

export function yesNoTone(active: boolean): StatusTone {
  return active ? "success" : "warning";
}

export function enrollmentStatusTone(
  status: string,
): StatusTone {
  if (status === "active") return "success";
  if (status === "waitlist" || status === "pending_payment") return "warning";
  return "neutral";
}

export function transferStatusTone(status: string): StatusTone {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

export function coachSubOutcomeTone(status: string): StatusTone {
  if (status === "filled") return "success";
  if (status === "pending") return "warning";
  return "neutral";
}

export function blockStatusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "cancelled") return "neutral";
  return "neutral";
}

export function classSeriesStatusTone(status: string): StatusTone {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

export function paymentStatusTone(status: string): StatusTone {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  if (status === "failed" || status === "charged_back") return "danger";
  return "neutral";
}
