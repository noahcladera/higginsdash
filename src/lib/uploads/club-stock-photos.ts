import { prisma } from "@/lib/prisma";
import type { ClubSlug } from "@/lib/pricing";

const CLUB_MATCH: Record<ClubSlug, RegExp> = {
  triaz: /triaz/i,
  randwijck: /randwijck/i,
};

function scoreClubStockRow(
  clubSlug: ClubSlug,
  row: { sourcePath: string; title: string },
): number {
  const path = row.sourcePath.toLowerCase();
  const title = row.title.toLowerCase();
  let score = 0;

  if (CLUB_MATCH[clubSlug].test(path) || CLUB_MATCH[clubSlug].test(title)) {
    score += 10;
  }
  if (path.includes("facilities") || path.includes("4. facilities")) {
    score += 5;
  }
  if (path.includes("marketing") || path.includes("3. marketing")) {
    score += 3;
  }
  if (/logo/i.test(path) || /logo/i.test(title)) score -= 20;
  if (/screenshot/i.test(path)) score -= 10;

  return score;
}

/**
 * Best-matching stock photo for a club tile hero, or null when none qualify.
 * Prefers facility/marketing photos over logos and screenshots.
 */
export async function findClubStockPhotoUrl(
  orgSlug: string,
  clubSlug: ClubSlug,
): Promise<string | null> {
  const rows = await prisma.stockMedia.findMany({
    where: { orgSlug },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    select: { url: true, sourcePath: true, title: true },
  });

  let best: { url: string; score: number } | null = null;
  for (const row of rows) {
    const score = scoreClubStockRow(clubSlug, row);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { url: row.url, score };
    }
  }

  return best?.url ?? null;
}
