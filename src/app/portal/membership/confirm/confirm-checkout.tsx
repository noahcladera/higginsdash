"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/icons";
import { startCheckout as beginCheckout } from "@/lib/payments/start-checkout";
import { getMollieAccountForMembership } from "@/lib/payments/mollie-accounts";
import { portalPurchaseSuccessUrl } from "@/lib/portal/purchase-success-url";
import type { ClubSlug } from "@/lib/pricing";

function membershipSuccessUrl(amountEur?: number) {
  return portalPurchaseSuccessUrl({
    kind: "membership",
    next: "/portal/membership",
    amountEur,
  });
}

type RandwijckBundle = "summer" | "late_season";

/**
 * Client-only confirm-and-pay button for `/portal/membership/confirm`.
 *
 * Single-club purchases fire one `startDemoCheckout` and route to the
 * Mollie demo page. Joint purchases fire the Triaz half first, stash the
 * Randwijck half in `sessionStorage`, and let the membership page's
 * mount effect chain the second checkout when the user returns.
 *
 * The actual DB write happens server-side inside `createMembership`
 * after the demo Mollie page confirms — the joint flow's "triaz" step
 * is the one that does the writes (creating both Payment rows in one
 * transaction); the "randwijck" step is cosmetic.
 */

const PENDING_JOINT_STEP_KEY = "demo_membership_joint_step";

interface PendingJointStep {
  tier: "adult" | "child";
  assignedPersonId?: string;
  randwijckPortion: number;
  description: string;
  returnUrl: string;
}

export interface ConfirmCheckoutButtonProps {
  tier: "adult" | "child" | "family";
  clubs: ClubSlug[];
  /** Required for child purchases; null otherwise. */
  assignedPersonId: string | null;
  /** Set when the buyer chose a Randwijck flat-rate bundle. */
  randwijckBundle: RandwijckBundle | null;
  /** Total billed today (for confirm button display). */
  totalEur: number;
  /** Triaz portion of the joint price; 0 for non-joint. */
  triazPortion: number;
  /** Randwijck portion of the joint price; 0 for non-joint. */
  randwijckPortion: number;
  /** Used as the Mollie checkout description. */
  headline: string;
}

export function ConfirmCheckoutButton({
  tier,
  clubs,
  assignedPersonId,
  randwijckBundle,
  totalEur,
  triazPortion,
  randwijckPortion,
  headline,
}: ConfirmCheckoutButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // If we landed back here after the Triaz half of a joint purchase,
  // auto-fire the Randwijck half. The membership page also has this
  // effect so a customer who navigates back to /portal/membership
  // gets the same treatment.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(PENDING_JOINT_STEP_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_JOINT_STEP_KEY);
    let pending: PendingJointStep;
    try {
      pending = JSON.parse(raw) as PendingJointStep;
    } catch {
      return;
    }
    void beginCheckout(
      {
        amountEur: pending.randwijckPortion,
        description: pending.description,
        returnUrl: pending.returnUrl,
        mollieAccount: getMollieAccountForMembership({ clubSlug: "randwijck" }),
        action: {
          kind: "membership_create",
          payload: {
            tier: pending.tier,
            clubs: ["triaz", "randwijck"],
            assignedPersonId: pending.assignedPersonId,
            step: "randwijck",
          },
        },
      },
      router,
    );
  }, [router]);

  function onConfirm() {
    startTransition(() => {
      const isJoint = clubs.length === 2;
      if (isJoint && tier !== "family") {
        if (typeof window !== "undefined") {
          const pending: PendingJointStep = {
            tier: tier as "adult" | "child",
            assignedPersonId: assignedPersonId ?? undefined,
            randwijckPortion,
            description: `${headline} · Randwijck portion`,
            returnUrl: membershipSuccessUrl(totalEur),
          };
          try {
            sessionStorage.setItem(
              PENDING_JOINT_STEP_KEY,
              JSON.stringify(pending),
            );
          } catch {
            // sessionStorage disabled — the second leg won't auto-fire
            // but the customer's first half still completes correctly.
          }
        }
        void beginCheckout(
          {
            amountEur: triazPortion,
            description: `${headline} · Triaz portion`,
            returnUrl: "/portal/membership",
            mollieAccount: getMollieAccountForMembership({ clubSlug: "triaz" }),
            action: {
              kind: "membership_create",
              payload: {
                tier,
                clubs: ["triaz", "randwijck"],
                assignedPersonId: assignedPersonId ?? undefined,
                step: "triaz",
              },
            },
          },
          router,
        );
        return;
      }

      // Single-club: one checkout, one Payment row.
      const targetClub = clubs[0];
      void beginCheckout(
        {
          amountEur: totalEur,
          description: headline,
          returnUrl: membershipSuccessUrl(totalEur),
          mollieAccount: getMollieAccountForMembership({ clubSlug: targetClub }),
          action: {
            kind: "membership_create",
            payload: {
              tier,
              clubs,
              assignedPersonId: assignedPersonId ?? undefined,
              randwijckBundle: randwijckBundle ?? undefined,
            },
          },
        },
        router,
      );
    });
  }

  return (
    <Button
      type="button"
      tone={clubs.length === 2 ? "joint" : clubs[0] === "triaz" ? "triaz" : "randwijck"}
      size="lg"
      disabled={isPending}
      onClick={onConfirm}
    >
      {isPending ? "Sending you to checkout…" : "Confirm and pay"}{" "}
      <ArrowRightIcon size={14} />
    </Button>
  );
}
