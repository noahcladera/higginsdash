"use server";

import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/tenant";
import { submitTrialInterest } from "@/app/trial/actions";

const SubmitPortalTrialSchema = z.object({
  audience: z.enum(["kids", "adults"]),
  contactName: z.string().trim().min(1, "Contact name is required.").max(120),
  playerName: z.string().trim().max(120).optional().default(""),
  playerAge: z.union([z.literal(""), z.number().int().min(3).max(99)]).optional(),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  phone: z.string().trim().max(40).optional().default(""),
  preferredClub: z.enum(["triaz", "randwijck", "no_preference"]).default("no_preference"),
  notes: z.string().trim().max(2000).optional().default(""),
  playerPersonId: z.string().uuid().optional().nullable(),
  classSeriesId: z.string().uuid().optional().nullable(),
});

export type SubmitPortalTrialInput = z.input<typeof SubmitPortalTrialSchema>;
export type SubmitPortalTrialResult = { ok: true } | { ok: false; error: string };

export async function submitPortalTrialRequest(
  raw: SubmitPortalTrialInput,
): Promise<SubmitPortalTrialResult> {
  const { person, householdId } = await requireMember();
  await requireFeature("trialInterest");

  const parsed = SubmitPortalTrialSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
    };
  }

  const data = parsed.data;
  if (data.audience === "kids" && data.playerName.trim().length === 0) {
    return { ok: false, error: "Child name is required." };
  }
  if (data.audience === "kids" && (data.playerAge === "" || data.playerAge == null)) {
    return { ok: false, error: "Child age is required." };
  }
  if (data.classSeriesId) {
    const exists = await prisma.classSeries.findUnique({
      where: { id: data.classSeriesId },
      select: { id: true },
    });
    if (!exists) {
      return { ok: false, error: "The selected class is no longer available." };
    }
  }

  let participantPersonId: string | null = null;
  if (data.audience === "adults") {
    participantPersonId = person.id;
  } else if (data.playerPersonId) {
    if (!householdId) {
      return { ok: false, error: "Please add this child to your account first." };
    }
    const allowedChild = await prisma.householdMember.findFirst({
      where: {
        householdId,
        roleInHousehold: "child",
        personId: data.playerPersonId,
      },
      select: { personId: true },
    });
    if (!allowedChild) {
      return { ok: false, error: "That child is not linked to your account." };
    }
    participantPersonId = allowedChild.personId;
  }

  return submitTrialInterest({
    audience: data.audience,
    contactName: data.contactName,
    playerName: data.audience === "kids" ? data.playerName : "",
    playerAge: data.audience === "kids" ? (data.playerAge ?? "") : "",
    email: data.email,
    phone: data.phone,
    preferredClub: data.preferredClub,
    notes: data.notes,
    personId: participantPersonId,
    classSeriesId: data.classSeriesId ?? null,
  });
}
