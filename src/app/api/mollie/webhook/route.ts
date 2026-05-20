import { NextResponse } from "next/server";

import { syncAndFulfillByMolliePaymentId } from "@/lib/payments/hosted-checkout";

/**
 * Mollie payment status webhook. Mollie POSTs `id=tr_...` (application/x-www-form-urlencoded).
 * We always return 200 after processing so Mollie does not retry indefinitely on
 * business-logic failures we have already recorded on the intent row.
 */
export async function POST(req: Request) {
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
    console.error("[mollie/webhook]", e);
  }

  return NextResponse.json({ ok: true });
}
