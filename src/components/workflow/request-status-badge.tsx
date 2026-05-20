/**
 * Single source of truth for "Awaiting review / Approved / Denied" pill
 * copy and tone. Used by booking rows, recurring-block rows, sub-request
 * rows, membership cancel rows, refund flags, and inboxes.
 *
 * Pass an explicit `label` to override the default text (rare — only when
 * a domain phrasing reads better than the generic one).
 */

import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/workflow/types";

const TONE: Record<RequestStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  denied: "danger",
};

const DEFAULT_LABEL: Record<RequestStatus, string> = {
  pending: "Awaiting review",
  approved: "Approved",
  denied: "Denied",
};

export function RequestStatusBadge({
  status,
  label,
  className,
}: {
  status: RequestStatus;
  label?: string;
  className?: string;
}) {
  return (
    <Badge tone={TONE[status]} className={className}>
      {label ?? DEFAULT_LABEL[status]}
    </Badge>
  );
}
