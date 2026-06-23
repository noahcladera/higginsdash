import { NextResponse } from "next/server";

import { syncAndFulfillByMolliePaymentId } from "@/lib/payments/hosted-checkout";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Mollie payment status webhook. Mollie POSTs `id=tr_...`
 * (application/x-www-form-urlencoded).
 *
 * Security model: Mollie webhooks are NOT signed. The trust anchor is that we
 * never trust the request body beyond the payment id — we re-fetch the payment
 * from Mollie over our authenticated API key (`fetchMolliePayment`) and act on
 * that. So an attacker POSTing a random id can at most trigger a no-op lookup.
 *
 * Retry semantics: we return 200 on success AND on terminal business failures
 * we have already recorded on the intent (so Mollie stops retrying those). On
 * UNEXPECTED/transient errors (Mollie API down, DB blip) we return 5xx so
 * Mollie retries the webhook with backoff and we don't silently drop a paid
 * order.
 */
export async function POST(req: Request) {
  // The endpoint is public (Mollie can't sign requests), so throttle per-IP to
  // blunt abuse — legitimate Mollie traffic is well under this ceiling.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const rl = await checkRateLimit("mollie-webhook", ip, {
    limit: 120,
    windowSec: 60,
  });
  if (!rl.success) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  let molliePaymentId: string | null = null;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    const params = new URLSearchParams(body);
    molliePaymentId = params.get("id");
  } else {
    try {
      const json = (await req.json()) as { id?: string };
      molliePaymentId = json.id ?? null;
    } catch {
      molliePaymentId = null;
    }
  }

  if (!molliePaymentId) {
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  }

  try {
    await syncAndFulfillByMolliePaymentId(molliePaymentId);
  } catch (e) {
    // Transient failure (Mollie fetch / DB). Ask Mollie to retry.
    console.error("[mollie/webhook] transient failure, signalling retry", e);
    return NextResponse.json(
      { ok: false, error: "temporary failure, retry" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
