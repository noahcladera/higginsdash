"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { coverImageObjectPosition } from "@/lib/uploads/cover-image-focus";
import type { PurchaseSuccessKind } from "@/lib/portal/purchase-success-url";

const REDIRECT_AFTER_MS = 2800;

export function PurchaseSuccessCelebration({
  kind,
  nextUrl,
  headline,
  body,
  coverImageUrl,
  coverImageFocusY,
  amountEur,
  paymentId,
}: {
  kind: PurchaseSuccessKind;
  nextUrl: string;
  headline: string;
  body: string;
  coverImageUrl: string | null;
  coverImageFocusY: number;
  amountEur: number | null;
  paymentId: string | null;
}) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(REDIRECT_AFTER_MS / 1000),
  );

  const amountFormatted = useMemo(() => {
    if (amountEur == null || amountEur <= 0) return null;
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amountEur);
  }, [amountEur]);

  useEffect(() => {
    const redirectTimer = setTimeout(() => {
      router.replace(nextUrl);
      router.refresh();
    }, REDIRECT_AFTER_MS);

    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    return () => {
      clearTimeout(redirectTimer);
      clearInterval(tick);
    };
  }, [router, nextUrl]);

  const badgeTone =
    kind === "waitlist" ? "warning" : kind === "booking" ? "triaz" : "success";

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <section className="elev-card w-full max-w-lg overflow-hidden text-center">
        {coverImageUrl && (
          <div className="relative aspect-[16/9] w-full bg-[var(--triaz)]/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                objectPosition: coverImageObjectPosition(coverImageFocusY),
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--card)]/90 via-transparent to-transparent" />
          </div>
        )}

        <div className="space-y-5 px-6 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--success)]/10">
            <SuccessCheckIcon />
          </div>

          <div className="space-y-2">
            <Badge tone={badgeTone} variant="solid" className="mx-auto">
              {kind === "waitlist"
                ? "Waitlisted"
                : kind === "membership"
                  ? "Membership"
                  : kind === "booking"
                    ? "Booked"
                    : "Enrolled"}
            </Badge>
            <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
              {headline}
            </h1>
            {amountFormatted && (
              <p className="tabular text-lg font-semibold text-[var(--foreground)]">
                {amountFormatted}
              </p>
            )}
            <p className="mx-auto max-w-md text-sm text-[var(--muted-foreground)]">
              {body}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button asChild tone="triaz" size="sm">
              <Link href={nextUrl}>Continue</Link>
            </Button>
            {paymentId && kind !== "waitlist" && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/portal/payments?highlight=${paymentId}`}>
                  View receipt
                </Link>
              </Button>
            )}
          </div>

          <p className="text-xs text-[var(--muted-foreground)]">
            Continuing in {secondsLeft}s…
          </p>
        </div>
      </section>

      <style>{`
        @keyframes purchase-success-check {
          from { stroke-dashoffset: 28; opacity: 0.4; }
          to { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes purchase-success-pop {
          0% { transform: scale(0.85); opacity: 0; }
          60% { transform: scale(1.04); }
          100% { transform: scale(1); opacity: 1; }
        }
        .purchase-success-check path {
          stroke-dasharray: 28;
          stroke-dashoffset: 28;
          animation: purchase-success-check 650ms ease-out 150ms forwards;
        }
        .purchase-success-pop {
          animation: purchase-success-pop 500ms ease-out forwards;
        }
      `}</style>
    </div>
  );
}

function SuccessCheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="purchase-success-pop size-8 text-[var(--success)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path className="purchase-success-check" d="M5 13l4 4L19 7" />
    </svg>
  );
}
