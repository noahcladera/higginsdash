import { prisma } from "@/lib/prisma";
import { isSafeInternalPath } from "@/lib/safe-redirect";
import { resolveCoverImageFocusY } from "@/lib/uploads/cover-image-focus";
import { PurchaseSuccessCelebration } from "@/components/portal/purchase-success-celebration";
import type { PurchaseSuccessKind } from "@/lib/portal/purchase-success-url";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstString(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const KINDS = new Set<PurchaseSuccessKind>([
  "enrollment",
  "waitlist",
  "membership",
  "booking",
]);

export default async function PortalPurchaseSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kindRaw = firstString(sp.kind);
  const kind: PurchaseSuccessKind = KINDS.has(kindRaw as PurchaseSuccessKind)
    ? (kindRaw as PurchaseSuccessKind)
    : "enrollment";

  const nextRaw = firstString(sp.next);
  const nextUrl = nextRaw && isSafeInternalPath(nextRaw) ? nextRaw : "/portal";

  const seriesId = firstString(sp.series);
  const studentName =
    firstString(sp.student)?.trim().slice(0, 60) || "You";
  const paymentIdRaw = firstString(sp.payment);
  const paymentId =
    paymentIdRaw && UUID_RE.test(paymentIdRaw) ? paymentIdRaw : null;
  const amountRaw = firstString(sp.amount);
  const amountEur =
    amountRaw != null && Number.isFinite(Number(amountRaw))
      ? Number(amountRaw)
      : null;

  let seriesName: string | null = null;
  let clubName: string | null = null;
  let coverImageUrl: string | null = null;
  let coverImageFocusY = 50;

  if (seriesId && UUID_RE.test(seriesId)) {
    const series = await prisma.classSeries.findUnique({
      where: { id: seriesId },
      select: {
        name: true,
        coverImageUrl: true,
        coverImageFocusY: true,
        club: { select: { name: true } },
        program: {
          select: {
            coverImageUrl: true,
            coverImageFocusY: true,
          },
        },
      },
    });
    if (series) {
      seriesName = series.name;
      clubName = series.club?.name ?? null;
      coverImageUrl = series.coverImageUrl ?? series.program.coverImageUrl;
      coverImageFocusY = resolveCoverImageFocusY({
        seriesCoverUrl: series.coverImageUrl,
        seriesFocusY: series.coverImageFocusY,
        programFocusY: series.program.coverImageFocusY,
      });
    }
  }

  const atClub = clubName ? ` at ${clubName}` : "";
  const label = seriesName ?? "your booking";

  const headline =
    kind === "waitlist"
      ? "You're on the list"
      : kind === "membership"
        ? "Welcome aboard"
        : kind === "booking"
          ? "Court booked"
          : "See you on court";

  const body =
    kind === "waitlist"
      ? `${studentName} is on the waitlist for ${label}${atClub}. We'll message you when a spot opens.`
      : kind === "membership"
        ? "Your membership is active. You can book courts and enroll in lessons right away."
        : kind === "booking"
          ? "Your court is reserved. You'll find it under My bookings."
          : `${studentName} is enrolled in ${label}${atClub}. Schedule reminders and updates land in My classes.`;

  return (
    <PurchaseSuccessCelebration
      kind={kind}
      nextUrl={nextUrl}
      headline={headline}
      body={body}
      coverImageUrl={coverImageUrl}
      coverImageFocusY={coverImageFocusY}
      amountEur={amountEur}
      paymentId={paymentId}
    />
  );
}
