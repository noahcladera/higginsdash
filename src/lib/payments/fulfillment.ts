"use server";

/**
 * Runs the business logic after a checkout succeeds (demo confirm or
 * Mollie webhook). Shared by demo dispatch and production webhooks.
 */

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import type { DemoCheckoutAction } from "@/lib/payments/demo-checkout";

import {
  createMembership,
  upgradeMembership,
} from "@/app/portal/membership/actions";
import { createEnrollment } from "@/lib/portal/enrollment-actions";
import { createBooking } from "@/lib/booking/actions";

export type CheckoutFulfillmentResult =
  | {
      ok: true;
      enrollmentId?: string;
      paymentId?: string | null;
    }
  | { ok: false; error: string };

export interface CheckoutFulfillmentContext {
  amountEur: number;
  paidAt?: Date;
}

export async function fulfillCheckoutAction(
  action: DemoCheckoutAction,
  context?: CheckoutFulfillmentContext,
): Promise<CheckoutFulfillmentResult> {
  const paidAt = context?.paidAt ?? new Date();
  const amountEur = context?.amountEur ?? 0;

  // When fulfillment runs from the verified Mollie sync path, `amountEur` is
  // the amount Mollie actually captured (validated upstream). Pass it as the
  // payment-integrity floor so domain actions refuse to grant goods that were
  // underpaid. `context` is undefined only on legacy/no-context calls.
  const verifyPaidEur = context ? amountEur : null;

  switch (action.kind) {
    case "membership_create": {
      const res = await createMembership(action.payload, { verifyPaidEur });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true };
    }

    case "membership_upgrade": {
      const res = await upgradeMembership(action.payload, { verifyPaidEur });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true };
    }

    case "enrollment_create": {
      const res = await createEnrollment(action.payload, {
        kind: "lesson_plus_membership",
        amountPaid: amountEur,
        paidAt,
        creditCentsApplied: action.payload.creditCentsApplied,
      });
      if (!res.ok) return { ok: false, error: res.error };
      revalidatePath("/portal/classes");
      revalidatePath("/portal/programs");
      revalidatePath("/portal/membership");
      revalidatePath("/portal/payments");
      return {
        ok: true,
        enrollmentId: res.enrollmentId,
        paymentId: res.paymentId,
      };
    }

    case "enrollment_create_lesson_only": {
      const res = await createEnrollment(action.payload, {
        kind: "lesson_only",
        amountPaid: amountEur,
        paidAt,
        creditCentsApplied: action.payload.creditCentsApplied,
      });
      if (!res.ok) return { ok: false, error: res.error };
      revalidatePath("/portal/classes");
      revalidatePath("/portal/programs");
      revalidatePath("/portal/membership");
      revalidatePath("/portal/payments");
      return {
        ok: true,
        enrollmentId: res.enrollmentId,
        paymentId: res.paymentId,
      };
    }

    case "court_booking_create": {
      const res = await createBooking(action.payload, { verifyPaidEur });
      if (!res.ok) return { ok: false, error: res.error };
      await prisma.courtBooking
        .update({
          where: { id: res.bookingId },
          data: { paymentStatus: "paid" },
        })
        .catch(() => undefined);
      revalidatePath("/portal/bookings");
      revalidatePath("/portal/book");
      revalidatePath("/admin/bookings");
      revalidatePath("/admin");
      return { ok: true };
    }
  }
}
