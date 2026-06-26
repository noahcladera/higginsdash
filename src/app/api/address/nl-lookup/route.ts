import { NextResponse } from "next/server";

import { lookupNlAddress } from "@/lib/address/nl-lookup";
import { isValidNlPostcode } from "@/lib/address/nl-postcode";
import { checkRateLimitByIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rl = await checkRateLimitByIp("nl-address-lookup", {
    limit: 30,
    windowSec: 60,
  });
  if (!rl.success) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const postcode = searchParams.get("postcode")?.trim() ?? "";
  const number = searchParams.get("number")?.trim() ?? "";
  const suffix = searchParams.get("suffix")?.trim() ?? "";

  if (!postcode || !number) {
    return NextResponse.json(
      { error: "missing_params" },
      { status: 400 },
    );
  }

  if (!isValidNlPostcode(postcode)) {
    return NextResponse.json(
      { error: "invalid_postcode" },
      { status: 400 },
    );
  }

  try {
    const result = await lookupNlAddress(postcode, number, suffix || undefined);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
}
