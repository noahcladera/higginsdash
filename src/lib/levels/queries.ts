import { prisma } from "@/lib/prisma";
import type { LevelAudience } from "@prisma/client";

export async function getLevelContentsByAudience(audience: LevelAudience) {
  return prisma.levelContent.findMany({
    where: { audience },
    orderBy: { sortOrder: "asc" },
  });
}
