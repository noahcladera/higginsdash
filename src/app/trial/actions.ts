"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

const SubmitSchema = z.object({
  audience: z.enum(["kids", "adults"]),
  contactName: z.string().trim().min(1, "Name is required.").max(120),
  playerName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  playerAge: z
    .union([z.literal(""), z.coerce.number().int().min(3).max(99)])
    .optional()
    .transform((v) => (v === "" || v == null ? null : (v as number))),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  preferredClub: z
    .enum(["triaz", "randwijck", "no_preference"])
    .optional()
    .nullable()
    .transform((v) => (v && v !== "no_preference" ? v : null)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  personId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  classSeriesId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type SubmitTrialInterestInput = z.input<typeof SubmitSchema>;
export type SubmitTrialInterestResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Public — no auth required. Drops a row into `trial_interests` for
 * the admin queue to pick up. Returns a generic friendly error for any
 * server-side issue so we don't leak validation internals to the
 * public form.
 */
export async function submitTrialInterest(
  raw: SubmitTrialInterestInput,
): Promise<SubmitTrialInterestResult> {
  const parsed = SubmitSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
    };
  }
  const data = parsed.data;
  let priorTrialCount = 0;
  if (data.personId) {
    priorTrialCount = await prisma.trialInterest.count({
      where: { personId: data.personId },
    });
  }

  try {
    await prisma.trialInterest.create({
      data: {
        audience: data.audience,
        contactName: data.contactName,
        playerName: data.playerName,
        playerAge: data.playerAge,
        email: data.email.toLowerCase(),
        phone: data.phone,
        preferredClub: data.preferredClub ?? undefined,
        notes: data.notes,
        status: "new",
        personId: data.personId,
        classSeriesId: data.classSeriesId,
        priorTrialCount,
        isRepeat: priorTrialCount > 0,
      },
    });
  } catch (e) {
    console.error("[submitTrialInterest] failed", e);
    return {
      ok: false,
      error: "Something went wrong. Please try again or email us directly.",
    };
  }

  return { ok: true };
}
