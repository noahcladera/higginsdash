"use client";

/**
 * Fake Mollie success splash.
 *
 * After the underlying server action runs we land here briefly: a big
 * green check, "Payment successful", then auto-redirect back to the
 * `?return=` URL after ~1.2s. Calling `router.refresh()` on the way
 * out forces the originating page to re-fetch (so the freshly created
 * membership / booking / enrollment shows up immediately).
 */

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { isSafeInternalPath } from "@/lib/safe-redirect";

const REDIRECT_AFTER_MS = 1200;

export default function DemoMollieSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}

function SuccessInner() {
  const router = useRouter();
  const params = useSearchParams();

  const returnParam = params.get("return");
  // Only same-origin paths — never honor an attacker-supplied external URL.
  const returnUrl = isSafeInternalPath(returnParam) ? returnParam : "/portal";
  const amountRaw = params.get("amount");
  const method = params.get("method");
  const bank = params.get("bank");

  const amountFormatted = useMemo(() => {
    const n = Number(amountRaw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(n);
  }, [amountRaw]);

  const methodLabel = useMemo(() => {
    if (!method) return null;
    if (method === "ideal") return bank ? `iDEAL · ${bank}` : "iDEAL";
    if (method === "card") return "Credit card";
    if (method === "bancontact") return "Bancontact";
    if (method === "paypal") return "PayPal";
    if (method === "applepay") return "Apple Pay";
    if (method === "klarna") return "Klarna";
    return method;
  }, [method, bank]);

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace(returnUrl);
      router.refresh();
    }, REDIRECT_AFTER_MS);
    return () => clearTimeout(t);
  }, [router, returnUrl]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-10 text-[#1f2d5c]">
      <section className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-[0_2px_24px_rgba(31,45,92,0.08)]">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#0CCFB4]/10">
          <CheckGlyph />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-[#1f2d5c]">
          Payment successful
        </h1>
        {amountFormatted && (
          <p className="mt-1 text-base font-semibold tabular-nums text-[#1f2d5c]">
            {amountFormatted}
          </p>
        )}
        {methodLabel && (
          <p className="text-sm text-[#5b6280]">Paid with {methodLabel}</p>
        )}
        <p className="mt-5 text-sm text-[#6b7390]">
          Redirecting you back to Hertogenbosch tennisclub…
        </p>
        <div className="mt-6 flex items-center justify-center">
          <span
            aria-hidden
            className="inline-block size-5 animate-spin rounded-full border-[3px] border-[#0CCFB4]/20 border-t-[#0CCFB4]"
          />
        </div>
      </section>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-9 text-[#0CCFB4]"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        className="origin-center"
        style={{
          strokeDasharray: 24,
          strokeDashoffset: 24,
          animation: "demo-mollie-check 600ms ease-out forwards",
        }}
      />
      <style>{`
        @keyframes demo-mollie-check {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );
}
