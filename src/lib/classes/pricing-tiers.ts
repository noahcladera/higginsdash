import { z } from "zod";

/**
 * One priced option on an event series. The primary tier is mirrored
 * on `ClassSeries.pricePerSeries`; the full list lives in `pricingTiers`.
 */
export type PricingTier = {
  id: string;
  label: string;
  amountEur: number;
  note?: string;
  /** When true, applied at checkout when the household has venue membership. */
  forMembers?: boolean;
};

export const PricingTierSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  amountEur: z.number().min(0).max(10000),
  note: z.string().max(200).optional(),
  forMembers: z.boolean().optional(),
});

export const PricingTiersJsonSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === "") return [] as PricingTier[];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid pricing tiers JSON",
      });
      return z.NEVER;
    }
    const arr = z.array(PricingTierSchema).safeParse(parsed);
    if (!arr.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid pricing tier shape",
      });
      return z.NEVER;
    }
    const tiers = arr.data;
    const labels = tiers.map((t) => t.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Price labels must be unique",
      });
      return z.NEVER;
    }
    const memberTiers = tiers.filter((t) => t.forMembers);
    if (memberTiers.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one member price tier is allowed",
      });
      return z.NEVER;
    }
    return tiers;
  });

/** Pick checkout price for an event given membership coverage. */
export function resolveEventCheckoutPrice(args: {
  pricePerSeries: number | null;
  pricingTiers: PricingTier[] | null;
  hasActiveMembership: boolean;
}): { amountEur: number | null; tier: PricingTier | null } {
  const tiers = args.pricingTiers ?? [];
  if (args.hasActiveMembership) {
    const member = tiers.find((t) => t.forMembers);
    if (member) return { amountEur: member.amountEur, tier: member };
  }
  const primary =
    tiers.find((t) => !t.forMembers) ??
    (tiers.length > 0 ? tiers[0] : null);
  if (primary) return { amountEur: primary.amountEur, tier: primary };
  return { amountEur: args.pricePerSeries, tier: null };
}

/** True when event has an explicit member tier (skip membership add-on). */
export function eventHasMemberPricingTier(
  pricingTiers: PricingTier[] | null | undefined,
): boolean {
  return (pricingTiers ?? []).some((t) => t.forMembers);
}

/** Parse `ClassSeries.pricingTiers` JSON from the database. */
export function parsePricingTiers(raw: unknown): PricingTier[] | null {
  if (raw == null) return null;
  const parsed = z.array(PricingTierSchema).safeParse(raw);
  return parsed.success ? parsed.data : null;
}
