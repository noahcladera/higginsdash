"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { pollCheckoutIntent } from "@/lib/payments/checkout-actions";
import { isSafeInternalPath } from "@/lib/safe-redirect";

/**
 * Landing page after Mollie hosted checkout. Polls until the webhook
 * (or this page) has fulfilled the checkout intent.
 */
export default function CheckoutReturnPage() {
  const searchParams = useSearchParams();
  const intentId = searchParams.get("intent");
  const [state, setState] = useState<
    "loading" | "success" | "pending" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!intentId) {
      setState("error");
      setError("Missing payment reference.");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      const res = await pollCheckoutIntent(intentId);
      if (cancelled) return;

      if (res.ok && res.status === "paid") {
        // Defense-in-depth: only ever navigate to a same-origin path, even
        // though returnUrl is validated at intent creation.
        const safe = isSafeInternalPath(res.returnUrl) ? res.returnUrl : "/portal";
        setReturnUrl(safe);
        setState("success");
        window.location.replace(safe);
        return;
      }
      if (res.ok && res.status === "pending") {
        if (attempts < maxAttempts) {
          setState("loading");
          window.setTimeout(tick, 1500);
        } else {
          setState("pending");
        }
        return;
      }
      setState("error");
      setError(res.ok ? "Something went wrong." : res.error);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [intentId]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {state === "loading" && (
        <>
          <h1 className="text-xl font-semibold">Confirming payment…</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            This usually takes a few seconds. Please keep this tab open.
          </p>
        </>
      )}
      {state === "pending" && (
        <>
          <h1 className="text-xl font-semibold">Payment received</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            We are still updating your account. Refresh in a moment or check your
            inbox in the portal.
          </p>
          {returnUrl && (
            <Button asChild>
              <Link href={returnUrl}>Continue</Link>
            </Button>
          )}
        </>
      )}
      {state === "error" && (
        <>
          <h1 className="text-xl font-semibold">Payment issue</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {error ?? "Contact the office if you were charged."}
          </p>
          <Button asChild variant="outline">
            <Link href="/portal">Back to portal</Link>
          </Button>
        </>
      )}
    </div>
  );
}

