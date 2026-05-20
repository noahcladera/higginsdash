import "server-only";

/**
 * Tenant resolution + per-request config.
 *
 * Single choke point for "which org is this request for, and what is it
 * configured to do?". Every server component, server action, and route
 * handler that reads tenant-scoped data goes through here.
 *
 * Architecture (one row, many JSON columns):
 *
 *   organizations row
 *     ├── identity      slug, displayName, shortName, country, locale, currency
 *     ├── productMode   "club" | "programs" | "custom"
 *     ├── presetSlug    "tennis_club" | "music_school" | …
 *     ├── features      Json — sparse override on top of BASE_FEATURE_FLAGS
 *     ├── terms         Json — sparse override on top of DEFAULT_TERMS
 *     └── branding      logoUrl, brandTitle, brandSubline (folded in from
 *                       the deprecated org_branding table)
 *
 * Resolution order:
 *   1. `higgins_current_org` cookie → row by slug.
 *   2. `higgins_product_mode` cookie / env → canonical row for that mode
 *      (`higgins-nl` for club, `demo-programs` for programs).
 *   3. The default org slug (`higgins-nl`).
 *
 * If the chosen slug doesn't have a row yet (fresh install / drift) we
 * fall back to a code-defined seed org so layouts keep rendering.
 *
 * Re-exports `FeatureFlags`, `Terms`, etc. from `./tenant/*` so existing
 * call sites doing `import { ... } from "@/lib/tenant"` continue working.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import type { Organization as OrganizationRow } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  BASE_FEATURE_FLAGS,
  mergeFeatureFlags,
  parseFeatureFlagsJson,
  type FeatureFlags,
} from "./tenant/features";
import {
  DEFAULT_TERMS,
  mergeTerms,
  parseTermsJson,
  type Terms,
} from "./tenant/terms";
import { getPreset, resolvePreset, type ProductMode } from "./tenant/presets";

// Re-export so call sites can still `import { FeatureFlags, ... } from "@/lib/tenant"`.
export type { FeatureFlags } from "./tenant/features";
export type { Terms, TermsOverrides, Pair } from "./tenant/terms";
export type { ProductMode, IndustryPreset } from "./tenant/presets";
export {
  BASE_FEATURE_FLAGS,
  FEATURE_FLAG_GROUPS,
  FEATURE_FLAG_KEYS,
  parseFeatureFlagsJson,
  mergeFeatureFlags,
} from "./tenant/features";
export {
  DEFAULT_TERMS,
  TERM_KEY_PATHS,
  parseTermsJson,
  mergeTerms,
  applyTerms,
  capitalize,
  decapitalize,
} from "./tenant/terms";
export {
  INDUSTRY_PRESETS,
  getPreset,
  resolvePreset,
} from "./tenant/presets";

export interface OrganizationBrand {
  /** Human-readable display name ("Higgins Tennis NL"). */
  displayName: string;
  /** Short name used in tight UI ("Higgins"). */
  shortName: string;
  /** ISO country code for formatting, pricing currency, etc. */
  country: "NL" | "US" | "UK" | "DE" | "FR" | "OTHER";
  /** Default locale for copy. */
  locale: "nl-NL" | "en-US" | "en-GB" | "de-DE" | "fr-FR" | string;
  /** Default currency for invoicing. */
  currency: "EUR" | "USD" | "GBP" | string;
  /** Public URL of the org's logo. */
  logoUrl?: string;
  /** Big "ops inbox" address for public mailtos and admin notifications.
   *  Optional so unset tenants render placeholder copy instead of a
   *  guessed-at address. */
  officeEmail?: string;
  /** Explicit wordmark parts when the brand split isn't a simple
   *  first-space split of `displayName`. Either of these may be empty. */
  brandTitle?: string;
  brandSubline?: string;
}

export interface Organization {
  /** Stable slug used in URLs / cookies / future FK. */
  slug: string;
  productMode: ProductMode;
  /** Slug of the preset this org most recently applied (advisory; the
   *  features/terms below have been merged with overrides on top). */
  presetSlug: string;
  brand: OrganizationBrand;
  features: FeatureFlags;
  terms: Terms;
  /** When non-null, `features` / `terms` JSON on the row are ignored at merge time. */
  presetLockedAt: Date | null;
  terminologyLocked: boolean;
  /** Convenience: same as `presetLockedAt != null`. */
  profileLocked: boolean;
}

/** Cookie used by the dev toggle (see `/admin/settings` + this file). */
export const PRODUCT_MODE_COOKIE = "higgins_product_mode";

/** Cookie used to override the current org slug (Pass 2-compatible). */
export const CURRENT_ORG_COOKIE = "higgins_current_org";

/**
 * Hard-coded seed orgs. Used as a last-resort fallback when there's no
 * `organizations` row matching the resolved slug — only really hit during
 * the first boot before the migration's seed insert lands. The admin UI
 * always operates on the DB row.
 */
const SEED_ORG_TEMPLATES: Record<
  string,
  {
    slug: string;
    displayName: string;
    shortName: string;
    country: string;
    locale: string;
    currency: string;
    presetSlug: string;
  }
> = {
  "higgins-nl": {
    slug: "higgins-nl",
    displayName: "Higgins Tennis Nederland",
    shortName: "Higgins",
    country: "NL",
    locale: "nl-NL",
    currency: "EUR",
    presetSlug: "tennis_club",
  },
  "demo-programs": {
    slug: "demo-programs",
    displayName: "Demo Programs Org",
    shortName: "Demo",
    country: "NL",
    locale: "en-US",
    currency: "EUR",
    presetSlug: "after_school",
  },
};

const DEFAULT_ORG_SLUG = "higgins-nl";

function buildOrgFromRow(row: OrganizationRow): Organization {
  const preset = resolvePreset(row.presetSlug ?? null);
  const profileLocked = row.presetLockedAt != null;
  const featureOverrides = profileLocked
    ? parseFeatureFlagsJson({})
    : parseFeatureFlagsJson(row.features);
  const termsOverrides = profileLocked
    ? parseTermsJson({})
    : parseTermsJson(row.terms);

  const features = mergeFeatureFlags(preset.features, featureOverrides);
  const terms = mergeTerms(preset.terms, termsOverrides);

  return {
    slug: row.slug,
    productMode: (row.productMode as ProductMode) ?? "custom",
    presetSlug: row.presetSlug ?? preset.presetSlug,
    brand: {
      displayName: row.brandTitle && row.brandSubline
        ? `${row.brandTitle} ${row.brandSubline}`.trim()
        : row.brandTitle?.trim() || row.displayName,
      shortName: row.shortName,
      country: (row.country || "OTHER") as OrganizationBrand["country"],
      locale: row.locale,
      currency: row.currency,
      logoUrl: row.logoUrl ?? undefined,
      officeEmail: row.officeEmail ?? undefined,
      brandTitle: row.brandTitle ?? undefined,
      brandSubline: row.brandSubline ?? undefined,
    },
    features,
    terms,
    presetLockedAt: row.presetLockedAt,
    terminologyLocked: row.terminologyLocked,
    profileLocked,
  };
}

function buildOrgFromSeed(slug: string): Organization {
  const seed = SEED_ORG_TEMPLATES[slug] ?? SEED_ORG_TEMPLATES[DEFAULT_ORG_SLUG]!;
  const preset = resolvePreset(seed.presetSlug);
  return {
    slug: seed.slug,
    productMode: preset.productMode,
    presetSlug: preset.presetSlug,
    brand: {
      displayName: seed.displayName,
      shortName: seed.shortName,
      country: seed.country as OrganizationBrand["country"],
      locale: seed.locale,
      currency: seed.currency,
    },
    features: preset.features,
    terms: preset.terms,
    presetLockedAt: null,
    terminologyLocked: false,
    profileLocked: false,
  };
}

/**
 * Read a single org row from the DB. Cached per-request so multiple
 * `getCurrentOrg()` calls in the same React tree share one query.
 */
const fetchOrgRow = cache(async (slug: string) => {
  try {
    return await prisma.organization.findUnique({ where: { slug } });
  } catch {
    // During early bootstrap / drift the table may not exist yet.
    return null;
  }
});

/**
 * Resolve the current org for this request.
 *
 * In Pass 2 this becomes: read `session.orgId` → fetch the org row.
 */
export async function getCurrentOrg(): Promise<Organization> {
  const cookieStore = await cookies();

  let slug: string | null = null;
  const explicitSlug = cookieStore.get(CURRENT_ORG_COOKIE)?.value;
  if (explicitSlug) {
    slug = explicitSlug;
  } else {
    const cookieMode = cookieStore.get(PRODUCT_MODE_COOKIE)?.value;
    const envMode = process.env.NEXT_PUBLIC_PRODUCT_MODE_OVERRIDE;
    const mode = cookieMode ?? envMode;
    if (mode === "club") slug = "higgins-nl";
    else if (mode === "programs") slug = "demo-programs";
    else slug = DEFAULT_ORG_SLUG;
  }

  const row = await fetchOrgRow(slug);
  if (row) return buildOrgFromRow(row);
  return buildOrgFromSeed(slug);
}

/** True when the current org runs the full club packaging. */
export async function isClubMode(): Promise<boolean> {
  const org = await getCurrentOrg();
  return org.productMode === "club";
}

/** True when the current org runs the lean programs packaging. */
export async function isProgramsMode(): Promise<boolean> {
  const org = await getCurrentOrg();
  return org.productMode === "programs";
}

/** Whether the named feature is enabled for the current org. */
export async function isFeatureEnabled(
  feature: keyof FeatureFlags,
): Promise<boolean> {
  const org = await getCurrentOrg();
  return org.features[feature] === true;
}

/**
 * 404 the route unless `feature` is enabled for the current org.
 *
 * Use at the top of every page/layout that belongs to a feature-gated
 * surface. When a tenant without the feature visits the URL directly they
 * get the standard Next not-found UI.
 *
 * Server actions that mutate gated data should call this too, so that a
 * forged POST (e.g. from a cached client bundle) can't write rows into
 * gated tables while the tenant has the feature off.
 */
export async function requireFeature(
  feature: keyof FeatureFlags,
): Promise<void> {
  const enabled = await isFeatureEnabled(feature);
  if (!enabled) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
}

/**
 * Every tenant currently registered. Today this comes from the
 * `organizations` table; falls back to seed templates when the table is
 * empty (first boot before migrations have been applied).
 */
export async function listRegisteredOrgs(): Promise<Organization[]> {
  try {
    const rows = await prisma.organization.findMany({ orderBy: { slug: "asc" } });
    if (rows.length > 0) return rows.map((row) => buildOrgFromRow(row));
  } catch {
    // fall through to seed
  }
  return Object.keys(SEED_ORG_TEMPLATES).map((slug) => buildOrgFromSeed(slug));
}

/**
 * Convenience for display code: the current org's brand, used by layouts
 * and email templates.
 */
export async function getCurrentBrand(): Promise<OrganizationBrand> {
  const org = await getCurrentOrg();
  return org.brand;
}

/**
 * The active glossary for the current org. Cached per-request via
 * `getCurrentOrg()` so this is essentially free to call multiple times.
 *
 * Server-only — client components consume the same data via
 * `useTerms()` / `<TermsProvider>`.
 */
export async function getTerms(): Promise<Terms> {
  const org = await getCurrentOrg();
  return org.terms;
}

/**
 * The current org's feature flags, fully merged. Equivalent to
 * `(await getCurrentOrg()).features` — exposed as a top-level helper so
 * consumers don't always have to grab the whole org.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const org = await getCurrentOrg();
  return org.features;
}

/**
 * Split a brand's display name into the two parts the wordmark renders:
 *
 *   - `title`   — the large display-serif word (e.g. "Higgins")
 *   - `subline` — the caps line underneath (e.g. "Tennis Nederland")
 *
 * When `brandTitle` / `brandSubline` are set explicitly on the org row
 * we use them verbatim — otherwise we fall back to splitting
 * `displayName` on its first whitespace, matching the legacy behaviour
 * for tenants that haven't filled in the explicit columns yet.
 */
export function splitBrandForWordmark(brand: OrganizationBrand): {
  title: string;
  subline: string | undefined;
} {
  const explicitTitle = brand.brandTitle?.trim();
  const explicitSubline = brand.brandSubline?.trim();
  if (explicitTitle || explicitSubline) {
    return {
      title: explicitTitle || brand.shortName,
      subline:
        explicitSubline && explicitSubline.length > 0
          ? explicitSubline
          : undefined,
    };
  }

  const name = brand.displayName.trim();
  const spaceIdx = name.indexOf(" ");
  if (spaceIdx < 0) {
    return { title: name || brand.shortName, subline: undefined };
  }
  const title = name.slice(0, spaceIdx).trim();
  const subline = name.slice(spaceIdx + 1).trim();
  return {
    title: title || brand.shortName,
    subline: subline.length > 0 ? subline : undefined,
  };
}

/**
 * The canonical tenant-resolution choke point.
 *
 * Every server action, page loader, and route handler that reads or
 * writes tenant-scoped data should call this helper.
 */
export async function requireCurrentOrg(): Promise<Organization> {
  const org = await getCurrentOrg();
  if (!org) {
    throw new Error(
      "requireCurrentOrg: no active organization for this request",
    );
  }
  return org;
}

/**
 * Narrower variant — 404s if the current org isn't in club mode.
 */
export async function requireClubMode(): Promise<Organization> {
  const org = await requireCurrentOrg();
  if (org.productMode !== "club") {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return org;
}

/** @deprecated kept for backwards compat — prefer the named preset slugs. */
void getPreset; // referenced for type-only re-export tracking
