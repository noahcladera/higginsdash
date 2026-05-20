"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { requirePlatformSupport } from "@/lib/auth/require-platform-support";
import { recordAudit, auditRowIdForOrganizationSlug } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  CURRENT_ORG_COOKIE,
  PRODUCT_MODE_COOKIE,
  listRegisteredOrgs,
  requireCurrentOrg,
  resolvePreset,
  FEATURE_FLAG_KEYS,
  TERM_KEY_PATHS,
  type FeatureFlags,
} from "@/lib/tenant";

/**
 * Force every cached layout that reads the org config to re-render.
 * Called from every settings action that mutates the row.
 */
function bustOrgCaches(): void {
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
  revalidatePath("/coach", "layout");
  revalidatePath("/admin/support", "layout");
  revalidatePath("/signup");
  revalidatePath("/", "layout");
}

function isNextRedirectError(e: unknown): boolean {
  if (e instanceof Error && e.message === "NEXT_REDIRECT") return true;
  if (
    e &&
    typeof e === "object" &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  ) {
    return true;
  }
  return false;
}

/**
 * Admin-only action that flips the per-browser product-mode cookies.
 * Kept around as a dev escape hatch so we can preview the surface for a
 * different org without actually owning that org's session.
 */
export async function setProductMode(formData: FormData): Promise<void> {
  await requireAdmin();
  const mode = String(formData.get("mode") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();

  const cookieStore = await cookies();
  const cookieOpts = { path: "/", sameSite: "lax" as const, httpOnly: false };

  if (mode === "reset") {
    cookieStore.delete(PRODUCT_MODE_COOKIE);
    cookieStore.delete(CURRENT_ORG_COOKIE);
    redirect("/admin/settings");
  }

  if (slug) {
    const orgs = await listRegisteredOrgs();
    const target = orgs.find((o) => o.slug === slug);
    if (!target) redirect("/admin/settings");
    cookieStore.set(CURRENT_ORG_COOKIE, target!.slug, cookieOpts);
    cookieStore.set(PRODUCT_MODE_COOKIE, target!.productMode, cookieOpts);
  } else if (mode === "club" || mode === "programs") {
    cookieStore.set(PRODUCT_MODE_COOKIE, mode, cookieOpts);
    cookieStore.delete(CURRENT_ORG_COOKIE);
  }

  redirect("/admin/settings");
}

// ─── General settings ───────────────────────────────────────────────────────

const GeneralSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  shortName: z.string().trim().min(1).max(40),
  country: z.string().trim().min(2).max(8),
  locale: z.string().trim().min(2).max(20),
  currency: z.string().trim().min(3).max(8),
  // Empty string = "clear it"; otherwise must look vaguely like an
  // email so the placeholder copy can show without ceremony.
  officeEmail: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v.length === 0 || /.+@.+\..+/.test(v),
      { message: "Office email must look like an email address." },
    ),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Update the org's identity fields (display name, country, currency, …).
 * Branding logo + wordmark live on a sibling action so the two screens
 * don't fight over the same form.
 */
export async function updateOrgGeneral(formData: FormData): Promise<SaveResult> {
  await requireAdmin();
  const org = await requireCurrentOrg();

  const parsed = GeneralSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    shortName: formData.get("shortName") ?? "",
    country: formData.get("country") ?? "",
    locale: formData.get("locale") ?? "",
    currency: formData.get("currency") ?? "",
    officeEmail: formData.get("officeEmail") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "One of the values didn't look right.",
    };
  }

  const { officeEmail, ...identity } = parsed.data;
  await prisma.organization.update({
    where: { slug: org.slug },
    data: {
      ...identity,
      officeEmail: officeEmail.length > 0 ? officeEmail : null,
    },
  });

  bustOrgCaches();
  return { ok: true };
}

// ─── Feature flags ──────────────────────────────────────────────────────────

/**
 * Replace the org's feature-flag overrides with whatever the form
 * submitted. Each known flag has a checkbox named exactly after the
 * key — anything checked becomes `true`, anything missing becomes
 * `false`. We always store the full set so the runtime never has to
 * "guess what the missing key meant".
 */
export async function updateOrgFeatures(formData: FormData): Promise<SaveResult> {
  await requireAdmin();
  const org = await requireCurrentOrg();
  if (org.profileLocked) {
    return {
      ok: false,
      error:
        "Feature toggles are locked to your industry preset. Contact support if you need a change.",
    };
  }

  const next: Partial<FeatureFlags> = {};
  for (const key of FEATURE_FLAG_KEYS) {
    next[key] = formData.get(key) === "on" || formData.get(key) === "true";
  }

  await prisma.organization.update({
    where: { slug: org.slug },
    data: { features: next as object },
  });

  bustOrgCaches();
  return { ok: true };
}

/** Wipe all feature overrides — caller will fall back to the preset. */
export async function resetOrgFeatures(): Promise<SaveResult> {
  await requireAdmin();
  const org = await requireCurrentOrg();
  if (org.profileLocked) {
    return {
      ok: false,
      error:
        "Feature toggles are locked to your industry preset. Contact support if you need a change.",
    };
  }
  await prisma.organization.update({
    where: { slug: org.slug },
    data: { features: {} },
  });
  bustOrgCaches();
  return { ok: true };
}

// ─── Terminology overrides ──────────────────────────────────────────────────

/**
 * Store a sparse `terms` JSON. We walk the known key paths so a typo'd
 * input field can't poison the column with junk. Empty values are
 * dropped, so the resolver falls back to the preset / default for any
 * key the admin didn't explicitly set.
 */
export async function updateOrgTerms(formData: FormData): Promise<SaveResult> {
  await requireAdmin();
  const org = await requireCurrentOrg();
  if (org.profileLocked) {
    return {
      ok: false,
      error:
        "Terminology is locked to your industry preset. Contact support if you need a wording change.",
    };
  }

  const overrides: Record<string, unknown> = {};
  for (const { path } of TERM_KEY_PATHS) {
    const raw = formData.get(path);
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    setNested(overrides, path, trimmed);
  }

  await prisma.organization.update({
    where: { slug: org.slug },
    data: { terms: overrides as object },
  });

  bustOrgCaches();
  return { ok: true };
}

/** Wipe all terminology overrides — falls back to preset / DEFAULT_TERMS. */
export async function resetOrgTerms(): Promise<SaveResult> {
  await requireAdmin();
  const org = await requireCurrentOrg();
  if (org.profileLocked) {
    return {
      ok: false,
      error:
        "Terminology is locked to your industry preset. Contact support if you need a change.",
    };
  }
  await prisma.organization.update({
    where: { slug: org.slug },
    data: { terms: {} },
  });
  bustOrgCaches();
  return { ok: true };
}

// ─── Apply preset ───────────────────────────────────────────────────────────

const ApplyPresetSchema = z
  .object({
    presetSlug: z.string().trim().min(1).max(60),
    acknowledgeIrreversible: z.string().optional(),
  })
  .refine(
    (d) =>
      d.acknowledgeIrreversible === "on" ||
      d.acknowledgeIrreversible === "true",
    {
      message: "Confirm that you understand this choice is permanent for your team.",
      path: ["acknowledgeIrreversible"],
    },
  );

/**
 * Apply an industry preset once: rewrites `presetSlug`, `productMode`,
 * clears `features` and `terms` overrides, then **locks** the profile so
 * tenants cannot switch presets or edit flags/terminology without platform
 * support.
 */
export async function applyPreset(formData: FormData): Promise<SaveResult> {
  try {
    const { person } = await requireAdmin();
    const org = await requireCurrentOrg();
    if (org.profileLocked) {
      return {
        ok: false,
        error:
          "Your industry preset is already locked. Contact support if you truly need to change business model or vocabulary.",
      };
    }

    const parsed = ApplyPresetSchema.safeParse({
      presetSlug: formData.get("presetSlug") ?? "",
      acknowledgeIrreversible: (formData.get("acknowledgeIrreversible") ??
        "") as string,
    });
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().fieldErrors.acknowledgeIrreversible?.[0] ??
        parsed.error.issues[0]?.message ??
        "Invalid input.";
      return { ok: false, error: msg };
    }

    const preset = resolvePreset(parsed.data.presetSlug);
    const before = await prisma.organization.findUnique({
      where: { slug: org.slug },
      select: {
        slug: true,
        presetSlug: true,
        productMode: true,
        presetLockedAt: true,
        terminologyLocked: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { slug: org.slug },
        data: {
          presetSlug: preset.presetSlug,
          productMode: preset.productMode,
          features: {},
          terms: {},
          presetLockedAt: new Date(),
          terminologyLocked: true,
        },
      });
      await recordAudit({
        tx,
        tableName: "organizations",
        rowId: auditRowIdForOrganizationSlug(org.slug),
        action: "update",
        changedByPersonId: person.id,
        before,
        after: {
          organizationSlug: org.slug,
          presetSlug: preset.presetSlug,
          productMode: preset.productMode,
          features: {},
          terms: {},
          presetLockedAt: "now",
          terminologyLocked: true,
        },
        changeSource: "admin_console",
      });
    });

    bustOrgCaches();
    return { ok: true };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("[applyPreset]", e);
    const raw = e instanceof Error ? e.message : String(e);
    if (
      /Unknown column|does not exist in the current database|column .* does not exist/i.test(
        raw,
      )
    ) {
      return {
        ok: false,
        error:
          "Your database is missing columns this app expects (preset lock). Run migrations with your env loaded, e.g. `npm run db:migrate`, then try again.",
      };
    }
    const short =
      raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
    return {
      ok: false,
      error: `Could not apply preset: ${short}`,
    };
  }
}

function setNested(target: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const next = cursor[part];
    if (!next || typeof next !== "object") cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

// ─── Platform support: clear profile lock ─────────────────────────────────

/**
 * Clears `preset_locked_at` / `terminology_locked` so the org can apply a
 * different preset and edit features/terminology again. Restricted to
 * `PLATFORM_SUPPORT_EMAILS`.
 */
export async function unlockOrgProfileLock(
  formData: FormData,
): Promise<SaveResult> {
  try {
    const { person } = await requirePlatformSupport();
    const slug = String(formData.get("orgSlug") ?? "").trim();
    if (!slug) return { ok: false, error: "Missing organization slug." };

    const before = await prisma.organization.findUnique({
      where: { slug },
      select: {
        slug: true,
        presetLockedAt: true,
        terminologyLocked: true,
        presetSlug: true,
      },
    });
    if (!before) return { ok: false, error: "Organization not found." };

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { slug },
        data: { presetLockedAt: null, terminologyLocked: false },
      });
      await recordAudit({
        tx,
        tableName: "organizations",
        rowId: auditRowIdForOrganizationSlug(slug),
        action: "update",
        changedByPersonId: person.id,
        before,
        after: {
          organizationSlug: slug,
          presetLockedAt: null,
          terminologyLocked: false,
          presetSlug: before.presetSlug,
        },
        changeSource: "admin_console",
      });
    });

    bustOrgCaches();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
