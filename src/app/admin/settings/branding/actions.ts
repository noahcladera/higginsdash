"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { requireCurrentOrg } from "@/lib/tenant";

/**
 * Save the current org's runtime branding overrides.
 *
 * Persisted in `organizations` keyed by the org slug. Any field the
 * admin clears (empty string) is stored as NULL so the tenant
 * resolver falls back to the static seed defaults.
 *
 * The tenant resolver caches the row per-request, so the very next
 * request after this action returns will render with the new values.
 * We call `revalidatePath` on the four layout roots + /login so
 * already-cached RSC payloads are invalidated too.
 */
const SaveBrandingSchema = z.object({
  logoUrl: z
    .string()
    .trim()
    .url()
    .max(2048)
    .optional()
    .or(z.literal("")),
  brandTitle: z.string().trim().max(100).optional().or(z.literal("")),
  brandSubline: z.string().trim().max(120).optional().or(z.literal("")),
});

export type SaveBrandingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveBranding(
  formData: FormData,
): Promise<SaveBrandingResult> {
  await requireAdmin();
  const org = await requireCurrentOrg();

  const parsed = SaveBrandingSchema.safeParse({
    logoUrl: formData.get("logoUrl") ?? "",
    brandTitle: formData.get("brandTitle") ?? "",
    brandSubline: formData.get("brandSubline") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "One of the values didn't look right — check the logo URL.",
    };
  }

  const data = {
    logoUrl: parsed.data.logoUrl ? parsed.data.logoUrl : null,
    brandTitle: parsed.data.brandTitle ? parsed.data.brandTitle : null,
    brandSubline: parsed.data.brandSubline ? parsed.data.brandSubline : null,
  };

  await prisma.organization.update({
    where: { slug: org.slug },
    data,
  });

  // Force layouts that read the brand to re-render on next navigation.
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
  revalidatePath("/coach", "layout");
  revalidatePath("/login");

  return { ok: true };
}
