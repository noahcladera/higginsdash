/**
 * Generic "core" seed helpers.
 *
 * Everything here is tenant-agnostic — it bootstraps the synthetic rows
 * the application requires regardless of product mode or brand:
 *
 *   - System person + system household (FK anchors for catalog data that
 *     needs a person/household reference but belongs to the app itself).
 *   - Placeholder "NO COACH YET" coach (assigned to ClassSeries admins
 *     have drafted but not staffed).
 *
 * Both `prisma/seed.ts` (Higgins catalog) and
 * `prisma/seed-programs-demo.ts` (lean programs demo tenant) start with
 * these helpers, so the two seeds never drift on the anchor rows.
 *
 * Idempotent: every helper uses upsert semantics on a stable primary
 * key. Safe to re-run.
 */

import { PrismaClient } from "@prisma/client";
import {
  SYSTEM_PERSON_ID,
  SYSTEM_HOUSEHOLD_ID,
  SYSTEM_NO_COACH_PERSON_ID,
} from "../src/lib/system-ids";
import { resolvePreset } from "../src/lib/tenant/presets";

/**
 * Upsert the synthetic "System" person + matching household + membership
 * link. Used as the FK anchor on catalog data that requires a person /
 * household but belongs to the app itself (e.g. seeded recurring blocks).
 */
export async function seedSystemPerson(prisma: PrismaClient): Promise<void> {
  await prisma.person.upsert({
    where: { id: SYSTEM_PERSON_ID },
    create: {
      id: SYSTEM_PERSON_ID,
      firstName: "System",
      lastName: "Seed",
      isAdmin: false,
      notes: "Synthetic placeholder for seed data. Do not delete.",
    },
    update: {},
  });

  await prisma.household.upsert({
    where: { id: SYSTEM_HOUSEHOLD_ID },
    create: {
      id: SYSTEM_HOUSEHOLD_ID,
      displayName: "System (seed placeholder)",
      primaryContactPersonId: SYSTEM_PERSON_ID,
      notes: "Synthetic placeholder for seed data. Do not delete.",
    },
    update: {},
  });

  await prisma.householdMember.upsert({
    where: { personId: SYSTEM_PERSON_ID },
    create: {
      householdId: SYSTEM_HOUSEHOLD_ID,
      personId: SYSTEM_PERSON_ID,
      roleInHousehold: "adult",
    },
    update: {},
  });
}

/**
 * Seed the "NO COACH YET" placeholder. A single synthetic coach row
 * assigned to any ClassSeries an admin has drafted but not yet staffed.
 * Always present, never logs in, excluded from coach leaderboards via
 * the `SYSTEM_PERSON_IDS` allowlist.
 */
export async function seedPlaceholderCoach(prisma: PrismaClient): Promise<void> {
  await prisma.person.upsert({
    where: { id: SYSTEM_NO_COACH_PERSON_ID },
    create: {
      id: SYSTEM_NO_COACH_PERSON_ID,
      firstName: "NO COACH YET",
      lastName: "",
      isAdmin: false,
      notes:
        "Synthetic placeholder — assigned to ClassSeries that don't have a real coach picked yet. Do not delete.",
    },
    update: {
      firstName: "NO COACH YET",
      lastName: "",
    },
  });

  await prisma.coach.upsert({
    where: { personId: SYSTEM_NO_COACH_PERSON_ID },
    create: {
      personId: SYSTEM_NO_COACH_PERSON_ID,
      employmentType: "employee",
      joinedOn: new Date("2020-01-01"),
      isActive: true,
      notes:
        "Synthetic placeholder — 'NO COACH YET'. Used as the default ClassSeriesCoach when admins haven't staffed a real coach.",
    },
    update: { isActive: true },
  });
}

/**
 * Identity / config row a seeded tenant gets. Slug must match the value
 * the cookie / `getCurrentOrg()` resolution will look up.
 */
export interface SeedOrgConfig {
  slug: string;
  displayName: string;
  shortName: string;
  country?: string;
  locale?: string;
  currency?: string;
  /** Industry preset slug — must match one in
   *  {@link "../src/lib/tenant/presets".INDUSTRY_PRESETS}. */
  presetSlug: string;
  brandTitle?: string | null;
  brandSubline?: string | null;
  logoUrl?: string | null;
  officeEmail?: string | null;
}

/**
 * Upsert an `organizations` row for a tenant. The DB is the source of
 * truth for tenant config (features, terms, branding) — everything else
 * the app reads via `getCurrentOrg()` flows from here.
 *
 * `productMode` is taken from the named preset so that seeded tenants
 * boot in a sensible default; admins can override per-flag from
 * `/admin/settings/features` once running.
 *
 * Idempotent: re-runs leave `features` / `terms` overrides alone (those
 * are admin-edited at runtime) and only refresh identity / branding.
 */
export async function seedOrganization(
  prisma: PrismaClient,
  config: SeedOrgConfig,
): Promise<void> {
  const preset = resolvePreset(config.presetSlug);
  const country = config.country ?? "NL";
  const locale = config.locale ?? "nl-NL";
  const currency = config.currency ?? "EUR";

  await prisma.organization.upsert({
    where: { slug: config.slug },
    create: {
      slug: config.slug,
      displayName: config.displayName,
      shortName: config.shortName,
      country,
      locale,
      currency,
      productMode: preset.productMode,
      presetSlug: preset.presetSlug,
      // Start with empty override JSON — the resolved preset is applied
      // on top by `buildOrgFromRow()` at request time. Leaves the door
      // open for admins to layer their own overrides on top without
      // every re-seed clobbering them.
      features: {},
      terms: {},
      logoUrl: config.logoUrl ?? null,
      brandTitle: config.brandTitle ?? null,
      brandSubline: config.brandSubline ?? null,
      officeEmail: config.officeEmail ?? null,
    },
    update: {
      displayName: config.displayName,
      shortName: config.shortName,
      country,
      locale,
      currency,
    },
  });
}

/** Run both helpers in sequence. Convenience for new seeders. */
export async function seedCore(prisma: PrismaClient): Promise<void> {
  await seedSystemPerson(prisma);
  await seedPlaceholderCoach(prisma);
}
