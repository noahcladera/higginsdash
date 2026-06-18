import { prisma } from "@/lib/prisma";

export async function getMedalLevelContents() {
  return prisma.medalLevelContent.findMany({
    orderBy: { sortOrder: "asc" },
  });
}
