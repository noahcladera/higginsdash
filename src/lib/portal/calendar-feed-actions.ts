"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { requireAuthedPerson } from "@/lib/auth/require-authed-person";
import { resolvePersonAccess } from "@/lib/auth/person-access";
import { recordAudit } from "@/lib/audit/record";
import type { CalendarFeedScope } from "@prisma/client";

const MEMBER_SCOPES: CalendarFeedScope[] = ["self", "household"];
const COACH_SCOPES: CalendarFeedScope[] = ["coach"];

function allowedScopesFor(access: {
  isCoachLike: boolean;
  isMember: boolean;
}): CalendarFeedScope[] {
  const scopes: CalendarFeedScope[] = [];
  if (access.isMember) scopes.push(...MEMBER_SCOPES);
  if (access.isCoachLike) scopes.push(...COACH_SCOPES);
  return scopes;
}

/**
 * Generate a fresh subscription token for the signed-in person.
 *
 * Returning the token directly is intentional: the client uses it to
 * paste into Google/Apple. We never need to display it again — the
 * portal UI shows the full URL once and then masks it.
 *
 * Scope determines whether the feed includes only the owner's classes,
 * every household member they live with, or their teaching schedule.
 */
export async function createCalendarFeedToken(args: {
  scope?: CalendarFeedScope;
  label?: string;
}): Promise<{ ok: true; token: string; id: string } | { ok: false; error: string }> {
  const { person } = await requireAuthedPerson();
  if (!person) return { ok: false, error: "Not signed in" };

  const access = await resolvePersonAccess();
  if (!access) return { ok: false, error: "Not signed in" };

  const scope = args.scope ?? "self";
  const allowed = allowedScopesFor(access);
  if (!allowed.includes(scope)) {
    return { ok: false, error: "That calendar scope is not available for your account." };
  }

  if (scope === "household" && !access.householdId) {
    return { ok: false, error: "Household calendar requires a family on your account." };
  }

  const label = args.label?.trim() || null;
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

  revalidateCalendarPaths();
  return { ok: true, token: created.token, id: created.id };
}

/**
 * Return an active token for the given scope, creating one if needed.
 * Used by the add-to-calendar dialog so repeat clicks reuse the same URL.
 */
export async function ensureCalendarFeedToken(args: {
  scope?: CalendarFeedScope;
}): Promise<
  | { ok: true; token: string; id: string; created: boolean }
  | { ok: false; error: string }
> {
  const { person } = await requireAuthedPerson();
  if (!person) return { ok: false, error: "Not signed in" };

  const access = await resolvePersonAccess();
  if (!access) return { ok: false, error: "Not signed in" };

  const scope = args.scope ?? "self";
  const allowed = allowedScopesFor(access);
  if (!allowed.includes(scope)) {
    return {
      ok: false,
      error: "That calendar scope is not available for your account.",
    };
  }

  if (scope === "household" && !access.householdId) {
    return {
      ok: false,
      error: "Household calendar requires a family on your account.",
    };
  }

  const existing = await prisma.calendarFeedToken.findFirst({
    where: {
      personId: person.id,
      scope,
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true },
  });

  if (existing) {
    return {
      ok: true,
      token: existing.token,
      id: existing.id,
      created: false,
    };
  }

  const created = await createCalendarFeedToken({ scope });
  if (!created.ok) return created;
  return { ...created, created: true };
}

function revalidateCalendarPaths() {
  revalidatePath("/portal");
  revalidatePath("/portal/profile");
  revalidatePath("/coach/calendar");
  revalidatePath("/coach/profile");
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

  revalidateCalendarPaths();
  return { ok: true };
}
