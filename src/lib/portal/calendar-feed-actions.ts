"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { requireAuthedPerson } from "@/lib/auth/require-authed-person";
import { recordAudit } from "@/lib/audit/record";
import type { CalendarFeedScope } from "@prisma/client";

/**
 * Generate a fresh subscription token for the signed-in person.
 *
 * Returning the token directly is intentional: the client uses it to
 * paste into Google/Apple. We never need to display it again — the
 * portal UI shows the full URL once and then masks it.
 *
 * Scope determines whether the feed includes only the owner's classes
 * or every household member they live with.
 */
export async function createCalendarFeedToken(args: {
  scope?: CalendarFeedScope;
  label?: string;
}): Promise<{ ok: true; token: string; id: string } | { ok: false; error: string }> {
  const { person } = await requireAuthedPerson();
  if (!person) return { ok: false, error: "Not signed in" };

  const scope = args.scope ?? "self";
  const label = args.label?.trim() || null;
  // 32 random bytes → 64 hex chars. Plenty for an unguessable URL.
  const token = randomBytes(32).toString("hex");

  const created = await prisma.calendarFeedToken.create({
    data: {
      personId: person.id,
      token,
      scope,
      label,
    },
    select: { id: true, token: true },
  });

  await recordAudit({
    tableName: "calendar_feed_tokens",
    rowId: created.id,
    action: "insert",
    changedByPersonId: person.id,
    after: { scope, label, personId: person.id },
  });

  revalidatePath("/portal/profile");
  return { ok: true, token: created.token, id: created.id };
}

/**
 * Mark a token as revoked. Once revoked the calendar route returns 404
 * for any request bearing that token; subscribers will see their feed
 * stop updating, which is the desired UX for "I leaked this URL".
 */
export async function revokeCalendarFeedToken(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { person } = await requireAuthedPerson();
  if (!person) return { ok: false, error: "Not signed in" };

  const existing = await prisma.calendarFeedToken.findUnique({
    where: { id: args.id },
    select: { id: true, personId: true, revokedAt: true },
  });
  if (!existing || existing.personId !== person.id) {
    return { ok: false, error: "Token not found" };
  }
  if (existing.revokedAt) {
    return { ok: true };
  }

  const updated = await prisma.calendarFeedToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
    select: { id: true, revokedAt: true },
  });

  await recordAudit({
    tableName: "calendar_feed_tokens",
    rowId: updated.id,
    action: "update",
    changedByPersonId: person.id,
    before: existing,
    after: updated,
  });

  revalidatePath("/portal/profile");
  return { ok: true };
}
