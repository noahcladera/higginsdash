"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg, requireCurrentOrg } from "@/lib/tenant";
import { findClubStockPhotoUrl } from "@/lib/uploads/club-stock-photos";
import { MARKETING_IMAGE_KEYS } from "@/lib/uploads/marketing-images-keys";

const CoverUrlSchema = z
  .string()
  .max(2048)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), {
    message: "Image URL must be a full https:// link.",
  });

const SetMarketingImageSchema = z.object({
  key: z.string().min(1).max(80),
  url: CoverUrlSchema,
});

export type SetMarketingImageResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * All marketing images for the current org, keyed by `MarketingImage.key`.
 * Club tile keys fall back to curated stock photos when not explicitly set.
 */
export const getMarketingImages = cache(
  async (): Promise<Record<string, string>> => {
    const org = await getCurrentOrg();
    const rows = await prisma.marketingImage.findMany({
      where: { orgSlug: org.slug },
      select: { key: true, url: true },
    });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.url;

    const clubKeys = [
      { key: MARKETING_IMAGE_KEYS.clubTriaz, slug: "triaz" as const },
      { key: MARKETING_IMAGE_KEYS.clubRandwijck, slug: "randwijck" as const },
    ];
    const venueCovers = await prisma.venue.findMany({
      where: {
        slug: { in: clubKeys.map((c) => c.slug) },
        coverImageUrl: { not: null },
      },
      select: { slug: true, coverImageUrl: true },
    });
    const venueCoverBySlug = new Map(
      venueCovers.map((v) => [v.slug, v.coverImageUrl!]),
    );

    for (const { key, slug } of clubKeys) {
      const venueCover = venueCoverBySlug.get(slug);
      if (venueCover) {
        out[key] = venueCover;
        continue;
      }
      if (!out[key]) {
        const stockUrl = await findClubStockPhotoUrl(org.slug, slug);
        if (stockUrl) out[key] = stockUrl;
      }
    }

    return out;
  },
);

export async function setMarketingImage(
  key: string,
  url: string | null,
): Promise<SetMarketingImageResult> {
  await requireAdmin();
  const org = await requireCurrentOrg();

  const parsed = SetMarketingImageSchema.safeParse({ key, url: url ?? "" });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid image URL.",
    };
  }

  const { key: validKey, url: validUrl } = parsed.data;

  if (validUrl === null) {
    await prisma.marketingImage.deleteMany({
      where: { orgSlug: org.slug, key: validKey },
    });
  } else {
    await prisma.marketingImage.upsert({
      where: {
        orgSlug_key: { orgSlug: org.slug, key: validKey },
      },
      create: { orgSlug: org.slug, key: validKey, url: validUrl },
      update: { url: validUrl },
    });
  }

  revalidatePath("/admin/settings/photos");
  revalidatePath("/portal", "layout");
  revalidatePath("/portal/membership");
  revalidatePath("/portal/programs");
  return { ok: true };
}
