"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { requireCurrentOrg } from "@/lib/tenant";

export interface StockMediaItem {
  id: string;
  url: string;
  title: string;
}

/**
 * List curated stock photos for the current org. Used by ImageUpload's
 * built-in picker so admins can click a photo instead of uploading.
 */
export async function listStockMedia(): Promise<StockMediaItem[]> {
  await requireAdmin();
  const org = await requireCurrentOrg();

  const rows = await prisma.stockMedia.findMany({
    where: { orgSlug: org.slug },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    select: { id: true, url: true, title: true },
  });

  return rows;
}
