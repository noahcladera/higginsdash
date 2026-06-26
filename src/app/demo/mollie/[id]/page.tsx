"use client";

/**
 * Fake Mollie hosted-checkout page used by the demo.
 *
 * Pulls a {@link DemoCheckoutIntent} stashed in `sessionStorage` by
 * {@link startDemoCheckout}, mimics Mollie's pay flow (method picker →
 * "Confirm payment" → ~1.5s spinner), then runs the real underlying
 * server action via `runDemoCheckout`. On success: redirects to the
 * success splash, which sends the user back to the originating page.
 *
 * Visually approximates Mollie's hosted page: light gray background,
 * centered white card, "TEST MODE" badge top-right, brand-colored
 * payment method tiles, big green CTA. Not pixel-perfect — close
 * enough to read as "real Mollie" in a demo.
 */

import { use, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  clearDemoIntent,
  loadDemoIntent,
  type DemoCheckoutIntent,
} from "@/lib/payments/demo-checkout";
import { MOLLIE_ACCOUNT_LABELS } from "@/lib/payments/mollie-accounts";
import { runDemoCheckout } from "./dispatch";

type Phase = "loading" | "idle" | "processing" | "error" | "missing";

type PaymentMethodKey =
  | "ideal"
  | "bancontact"
  | "card"
  | "paypal"
  | "applepay"
  | "klarna";

interface PaymentMethod {
  key: PaymentMethodKey;
  label: string;
  sub?: string;
  badge: () => React.ReactNode;
}

const METHODS: PaymentMethod[] = [
  {
    key: "ideal",
    label: "iDEAL",
    sub: "Pay with your bank",
    badge: () => <IdealBadge />,
  },
  {
    key: "bancontact",
    label: "Bancontact",
    sub: "Belgian bank cards",
    badge: () => <BancontactBadge />,
  },
  {
    key: "card",
    label: "Credit card",
    sub: "Visa · Mastercard · Amex",
    badge: () => <CardBadge />,
  },
  {
    key: "paypal",
    label: "PayPal",
    badge: () => <PaypalBadge />,
  },
  {
    key: "applepay",
    label: "Apple Pay",
    badge: () => <ApplePayBadge />,
  },
  {
    key: "klarna",
    label: "Klarna · Pay later",
    sub: "Pay in 30 days, no interest",
    badge: () => <KlarnaBadge />,
  },
];

const IDEAL_BANKS = [
  "ABN AMRO",
  "ASN Bank",
  "Bunq",
  "ING",
  "Knab",
  "Rabobank",
  "RegioBank",
  "Revolut",
  "SNS",
  "Triodos Bank",
  "Van Lanschot",
];

export default function DemoMolliePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [intent, setIntent] = useState<DemoCheckoutIntent | null>(null);
  const [method, setMethod] = useState<PaymentMethodKey>("ideal");
  const [bank, setBank] = useState<string>(IDEAL_BANKS[3]); // ING
  const [error, setError] = useState<string | null>(null);
  const [_, startTransition] = useTransition();

  // Hydrate intent from sessionStorage once on mount. If it's missing
  // (refresh after the tab cleared, deep-link, etc.) we render a
  // friendly "session expired" card.
  useEffect(() => {
    const found = loadDemoIntent(id);
    if (!found) {
      setPhase("missing");
      return;
    }
    setIntent(found);
    setPhase("idle");
  }, [id]);

  const amountFormatted = useMemo(
    () =>
      intent
        ? new Intl.NumberFormat("nl-NL", {
            style: "currency",
            currency: "EUR",
            minimumFractionDigits: 2,
          }).format(intent.amountEur)
        : "",
    [intent],
  );

  function handleConfirm() {
    if (!intent) return;
    setError(null);
    setPhase("processing");

    // Two-stage delay: first show the "Processing your payment…" UI for
    // a beat (so the demo audience sees it happen), then call the real
    // server action. Total perceived latency ~1.6s before redirect.
    setTimeout(() => {
      startTransition(async () => {
        const result = await runDemoCheckout(intent.action, {
          amountEur: intent.amountEur,
          paidAt: new Date(),
        });
        if (!result.ok) {
          setError(result.error);
          setPhase("error");
          return;
        }
        clearDemoIntent(id);

        // Some action kinds emit ids the landing page wants to use
        // (e.g. /portal/classes?enrolled=1 needs &payment=<id> to
        // light up the "View receipt" button). Splice them onto the
        // caller-provided returnUrl so the success interstitial
        // doesn't have to know about per-action shapes.
        let returnUrl = intent.returnUrl;
        if (
          (intent.action.kind === "enrollment_create" ||
            intent.action.kind === "enrollment_create_lesson_only") &&
          (result.enrollmentId || result.paymentId)
        ) {
          const ret = new URL(returnUrl, window.location.origin);
          if (result.enrollmentId) {
            ret.searchParams.set("enrollment", result.enrollmentId);
          }
          if (result.paymentId) {
            ret.searchParams.set("payment", result.paymentId);
          }
          // Preserve absolute/relative shape: if the caller gave us a
          // path (no host), strip the synthetic origin we added.
          returnUrl = intent.returnUrl.startsWith("/")
            ? ret.pathname + ret.search + ret.hash
            : ret.toString();
        }

        if (returnUrl.startsWith("/portal/success")) {
          router.replace(returnUrl);
          router.refresh();
          return;
        }

        const url = new URL("/demo/mollie/success", window.location.origin);
        url.searchParams.set("return", returnUrl);
        url.searchParams.set("amount", String(intent.amountEur));
        url.searchParams.set("method", method);
        if (method === "ideal") url.searchParams.set("bank", bank);
        router.replace(url.pathname + url.search);
      });
    }, 1500);
  }

  function handleCancel() {
    if (!intent) {
      router.replace("/portal");
      return;
    }
    clearDemoIntent(id);
    router.replace(intent.returnUrl);
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#1f2d5c]">
      <TopBar
        merchantLabel={intent?.merchantLabel ?? "Loading…"}
        intentId={id}
        mollieAccountLabel={
          intent ? MOLLIE_ACCOUNT_LABELS[intent.mollieAccount] : null
        }
      />

      <main className="mx-auto max-w-md px-4 pb-16 pt-6">
        {phase === "loading" && <LoadingCard />}
        {phase === "missing" && <MissingCard onHome={() => router.replace("/portal")} />}

        {(phase === "idle" || phase === "error") && intent && (
          <CheckoutCard
            amountFormatted={amountFormatted}
            description={intent.description}
            method={method}
            onMethod={setMethod}
            bank={bank}
            onBank={setBank}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            error={phase === "error" ? error : null}
          />
        )}

        {phase === "processing" && intent && (
          <ProcessingCard
            method={method}
            bank={bank}
            amountFormatted={amountFormatted}
          />
        )}

        <FooterMicrocopy />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function TopBar({
  merchantLabel,
  intentId,
  mollieAccountLabel,
}: {
  merchantLabel: string;
  intentId: string;
  mollieAccountLabel: string | null;
}) {
  return (
    <header className="border-b border-[#e2e4eb] bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <MollieWordmark />
          <span className="hidden h-5 w-px bg-[#d4d8e0] sm:block" />
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-[11px] uppercase tracking-wider text-[#6b7390]">
              Paying
            </span>
            <span className="text-sm font-semibold text-[#1f2d5c]">
              {merchantLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mollieAccountLabel && (
            <span className="rounded-full bg-[#1f2d5c]/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#1f2d5c]">
              {mollieAccountLabel} a/c
            </span>
          )}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Test mode
          </span>
          <span className="hidden font-mono text-[10px] text-[#9097ad] sm:inline">
            tr_{intentId.slice(0, 10)}
          </span>
        </div>
      </div>
    </header>
  );
}

function LoadingCard() {
  return (
    <section className="rounded-2xl bg-white p-8 shadow-[0_2px_24px_rgba(31,45,92,0.08)]">
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    </section>
  );
}

function MissingCard({ onHome }: { onHome: () => void }) {
  return (
    <section className="rounded-2xl bg-white p-8 shadow-[0_2px_24px_rgba(31,45,92,0.08)]">
      <h1 className="text-lg font-semibold text-[#1f2d5c]">
        Payment session expired
      </h1>
      <p className="mt-2 text-sm text-[#5b6280]">
        We couldn&apos;t find this payment session. It may have already been
        completed, or your browser cleared it. Head back and try again.
      </p>
      <button
        type="button"
        onClick={onHome}
        className="mt-6 w-full rounded-full bg-[#1f2d5c] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Back to portal
      </button>
    </section>
  );
}

function CheckoutCard({
  amountFormatted,
  description,
  method,
  onMethod,
  bank,
  onBank,
  onConfirm,
  onCancel,
  error,
}: {
  amountFormatted: string;
  description: string;
  method: PaymentMethodKey;
  onMethod: (k: PaymentMethodKey) => void;
  bank: string;
  onBank: (b: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_24px_rgba(31,45,92,0.08)]">
      <div className="border-b border-[#eef0f4] px-6 py-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b7390]">
          Amount
        </div>
        <div className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-[#1f2d5c]">
          {amountFormatted}
        </div>
        <div className="mt-1 text-sm text-[#5b6280]">{description}</div>
      </div>

      <div className="px-6 py-5">
        <h2 className="mb-3 text-sm font-semibold text-[#1f2d5c]">
          How would you like to pay?
        </h2>
        <ul className="space-y-2">
          {METHODS.map((m) => {
            const selected = method === m.key;
            return (
              <li key={m.key}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                    selected
                      ? "border-[#0CCFB4] bg-[#0CCFB4]/5"
                      : "border-[#e2e4eb] bg-white hover:border-[#c5cad6]",
                  )}
                >
                  <input
                    type="radio"
                    name="method"
                    value={m.key}
                    checked={selected}
                    onChange={() => onMethod(m.key)}
                    className="size-4 shrink-0 accent-[#0CCFB4]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#1f2d5c]">
                      {m.label}
                    </div>
                    {m.sub && (
                      <div className="text-[11px] text-[#6b7390]">
                        {m.sub}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">{m.badge()}</div>
                </label>

                {selected && m.key === "ideal" && (
                  <div className="ml-7 mt-2 rounded-xl bg-[#f7f8fb] px-3 py-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6b7390]">
                      Choose your bank
                    </label>
                    <select
                      value={bank}
                      onChange={(e) => onBank(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-[#d4d8e0] bg-white px-3 py-2 text-sm text-[#1f2d5c] focus:border-[#0CCFB4] focus:outline-none"
                    >
                      {IDEAL_BANKS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <strong className="font-semibold">Payment failed:</strong> {error}
          </div>
        )}

        <button
          type="button"
          onClick={onConfirm}
          className="mt-5 w-full rounded-full bg-[#0CCFB4] px-5 py-3.5 text-sm font-bold text-white shadow-[0_4px_12px_rgba(12,207,180,0.35)] transition hover:brightness-105 active:scale-[0.99]"
        >
          {error ? `Try again · ${amountFormatted}` : `Confirm payment · ${amountFormatted}`}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="mt-2 block w-full text-center text-xs text-[#6b7390] underline-offset-2 hover:underline"
        >
          Cancel and return to merchant
        </button>
      </div>
    </section>
  );
}

function ProcessingCard({
  method,
  bank,
  amountFormatted,
}: {
  method: PaymentMethodKey;
  bank: string;
  amountFormatted: string;
}) {
  const methodLabel =
    method === "ideal"
      ? `iDEAL · ${bank}`
      : METHODS.find((m) => m.key === method)?.label ?? "Card";
  return (
    <section className="rounded-2xl bg-white p-10 text-center shadow-[0_2px_24px_rgba(31,45,92,0.08)]">
      <div className="mx-auto flex size-16 items-center justify-center">
        <Spinner large />
      </div>
      <h2 className="mt-6 text-base font-semibold text-[#1f2d5c]">
        Processing your payment…
      </h2>
      <p className="mt-1 text-sm text-[#5b6280]">
        Confirming {amountFormatted} via {methodLabel}.
      </p>
      <p className="mt-4 text-[11px] text-[#9097ad]">
        Please don&apos;t close this window.
      </p>
    </section>
  );
}

function FooterMicrocopy() {
  return (
    <footer className="mt-6 flex items-center justify-center gap-2 text-[11px] text-[#9097ad]">
      <span>Powered by</span>
      <MollieWordmark small />
      <span>·</span>
      <span>Secure checkout</span>
      <span>·</span>
      <span>PCI DSS</span>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Mini brand badges (intentionally simple — close enough at thumbnail size)
// ---------------------------------------------------------------------------

function MollieWordmark({ small }: { small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-bold tracking-tight text-[#1f2d5c]",
        small ? "text-[11px]" : "text-base",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block rounded-full bg-[#1f2d5c]",
          small ? "size-2" : "size-2.5",
        )}
      />
      mollie
    </span>
  );
}

function IdealBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-white px-2 py-1 text-[10px] font-extrabold ring-1 ring-[#e2e4eb]">
      <span className="text-[#cd0067]">i</span>
      <span className="text-[#1f2d5c]">DEAL</span>
    </span>
  );
}

function BancontactBadge() {
  return (
    <span className="inline-flex h-6 items-center gap-0 overflow-hidden rounded-md ring-1 ring-[#e2e4eb]">
      <span className="bg-[#1e3a8a] px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">
        banc
      </span>
      <span className="bg-[#fbbf24] px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">
        ontact
      </span>
    </span>
  );
}

function CardBadge() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="inline-block h-5 w-7 rounded-sm bg-gradient-to-r from-[#1a1f71] to-[#1e3a8a] px-1 py-0.5 text-[8px] font-extrabold leading-none text-white">
        VISA
      </span>
      <span className="relative inline-block h-5 w-7 rounded-sm bg-white ring-1 ring-[#e2e4eb]">
        <span className="absolute left-1 top-1/2 size-3 -translate-y-1/2 rounded-full bg-[#eb001b]" />
        <span className="absolute right-1 top-1/2 size-3 -translate-y-1/2 rounded-full bg-[#f79e1b] mix-blend-multiply" />
      </span>
    </span>
  );
}

function PaypalBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[10px] font-extrabold tracking-tight ring-1 ring-[#e2e4eb]">
      <span className="text-[#003087]">Pay</span>
      <span className="text-[#009cde]">Pal</span>
    </span>
  );
}

function ApplePayBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-black px-2 py-1 text-[10px] font-semibold text-white">
      <AppleGlyph /> Pay
    </span>
  );
}

function KlarnaBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-[#FFA8CD] px-2 py-1 text-[10px] font-extrabold text-black">
      Klarna.
    </span>
  );
}

function AppleGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3 fill-current"
    >
      <path d="M11.4 8.5c0-1.6 1.3-2.4 1.4-2.5-0.8-1.1-2-1.3-2.4-1.3-1-0.1-2 0.6-2.5 0.6-0.5 0-1.3-0.6-2.2-0.6C4.4 4.7 3.1 5.5 2.4 6.8c-1 1.7-0.3 4.2 0.7 5.6 0.5 0.7 1 1.5 1.8 1.4 0.7 0 1-0.5 1.9-0.5 0.9 0 1.1 0.5 1.9 0.5 0.8 0 1.3-0.7 1.8-1.4 0.6-0.8 0.8-1.6 0.9-1.7-0.1 0-1.7-0.7-1.7-2.6zM9.7 3.7c0.4-0.5 0.7-1.2 0.6-1.9-0.6 0-1.3 0.4-1.7 0.9-0.4 0.4-0.7 1.1-0.6 1.7 0.7 0.1 1.4-0.3 1.7-0.7z" />
    </svg>
  );
}

function Spinner({ large }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block animate-spin rounded-full border-[3px] border-[#0CCFB4]/20 border-t-[#0CCFB4]",
        large ? "size-12" : "size-6",
      )}
    />
  );
}
