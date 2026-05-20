/**
 * Shared vocabulary for "request → notify → decide → reverse" workflows.
 *
 * Different domain status enums (CourtBookingStatus.cancellation_requested vs
 * RecurringBlockStatus.pending vs CoachSubRequestStatus.pending) all map to
 * the same conceptual state. This file holds the canonical labels so UI,
 * inboxes, and badges read from one source of truth.
 */

export type RequestStatus = "pending" | "approved" | "denied";

/**
 * One pending row for an admin/coach/member inbox view. Specific surfaces
 * narrow the union to the kinds they care about.
 */
export type PendingItem =
  | {
      kind: "booking_cancellation";
      id: string;
      subjectId: string;
      title: string;
      subtitle: string;
      requestedAt: Date;
      requesterName: string;
      reason: string | null;
      href: string;
    }
  | {
      kind: "recurring_block";
      id: string;
      subjectId: string;
      title: string;
      subtitle: string;
      requestedAt: Date;
      requesterName: string;
      reason: string | null;
      href: string;
    }
  | {
      kind: "coach_sub";
      id: string;
      subjectId: string;
      title: string;
      subtitle: string;
      requestedAt: Date;
      requesterName: string;
      reason: string | null;
      href: string;
    }
  | {
      kind: "membership_cancellation";
      id: string;
      subjectId: string;
      title: string;
      subtitle: string;
      requestedAt: Date;
      requesterName: string;
      reason: string | null;
      href: string;
    }
  | {
      kind: "refund_flag";
      id: string;
      subjectId: string;
      title: string;
      subtitle: string;
      requestedAt: Date;
      requesterName: string;
      reason: string | null;
      href: string;
    };

export const REQUEST_STATUS_COPY: Record<
  RequestStatus,
  { label: string; description: string }
> = {
  pending: {
    label: "Awaiting review",
    description: "We've got your request. The office will respond shortly.",
  },
  approved: {
    label: "Approved",
    description: "Your request was approved.",
  },
  denied: {
    label: "Denied",
    description: "Your request was not approved — see the note below.",
  },
};
