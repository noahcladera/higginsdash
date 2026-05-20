"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { recordAudit } from "@/lib/audit";
import { SEASON_SLUG_RE, slugifySeasonName } from "@/lib/seasons/slug";
import type { ActionResult } from "@/lib/feedback/types";

/**
 * Admin CRUD for the catalog `Season` model.
 *
 * Seasons are manual labels (name + audience) used to group class
 * series and autofill youth schedules. Enrollment windows live on each
 * class series, not on the season row.
 */

const SeasonAudienceSchema = z.enum(["youth", "adult"]);

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .transform((v) => {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  });

const OptionalDateOnlySchema = z
  .union([z.literal(""), DateOnlySchema])
  .transform((v) => (v === "" ? null : v));

const trimmedOptional = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => {
      if (!v) return null;
      const t = v.trim();
      return t === "" ? null : t;
    });

function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

const SeasonBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    audience: SeasonAudienceSchema,
    startsOn: OptionalDateOnlySchema.optional().transform((v) => v ?? null),
    endsOn: OptionalDateOnlySchema.optional().transform((v) => v ?? null),
    slug: z
      .string()
      .max(80)
      .optional()
      .transform((v) => (v ?? "").trim().toLowerCase()),
    notes: trimmedOptional(2000),
  })
  .superRefine((data, ctx) => {
    if (data.audience === "youth") {
      if (!data.startsOn) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startsOn"],
          message: "Youth seasons need a start date.",
        });
      }
      if (!data.endsOn) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endsOn"],
          message: "Youth seasons need an end date.",
        });
      }
    }
    if (
      data.startsOn &&
      data.endsOn &&
      data.endsOn.getTime() < data.startsOn.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "End date must be on or after the start date.",
      });
    }
  });

function resolveSlug(name: string, slugInput: string): string | { error: string } {
  const slug = slugInput ? slugInput : slugifySeasonName(name);
  if (!slug || !SEASON_SLUG_RE.test(slug)) {
    return {
      error:
        "Slug must be lowercase letters, digits, and hyphens (e.g. spring-2026).",
    };
  }
  return slug;
}

export async function createSeason(
  formData: FormData,
): Promise<ActionResult<{ seasonId: string }>> {
  const { person: admin } = await requireAdmin();
  const parsed = SeasonBodySchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;

  const slugResult = resolveSlug(data.name, data.slug);
  if (typeof slugResult !== "string") {
    return { ok: false, error: slugResult.error };
  }
  const slug = slugResult;

  const dup = await prisma.season.findUnique({ where: { slug } });
  if (dup) {
    return {
      ok: false,
      error: `Slug "${slug}" is already in use. Pick a different name or slug.`,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.season.create({
      data: {
        name: data.name,
        slug,
        audience: data.audience,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        notes: data.notes,
        isActive: true,
      },
    });
    await recordAudit({
      tableName: "seasons",
      rowId: row.id,
      action: "insert",
      changedByPersonId: admin.id,
      after: row,
      changeSource: "admin_console",
      tx,
    });
    return row;
  });

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/classes");
  return { ok: true, seasonId: created.id, message: `Created ${created.name}` };
}

const UpdateSchema = SeasonBodySchema.extend({
  seasonId: z.string().uuid(),
});

export async function updateSeason(
  formData: FormData,
): Promise<ActionResult<{ seasonId: string }>> {
  const { person: admin } = await requireAdmin();
  const parsed = UpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;

  const existing = await prisma.season.findUnique({
    where: { id: data.seasonId },
  });
  if (!existing) {
    return { ok: false, error: "Season not found." };
  }

  const slugResult = resolveSlug(data.name, data.slug);
  if (typeof slugResult !== "string") {
    return { ok: false, error: slugResult.error };
  }
  const slug = slugResult;

  if (slug !== existing.slug) {
    const dup = await prisma.season.findUnique({ where: { slug } });
    if (dup) {
      return {
        ok: false,
        error: `Slug "${slug}" is already in use.`,
      };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.season.update({
      where: { id: data.seasonId },
      data: {
        name: data.name,
        slug,
        audience: data.audience,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        notes: data.notes,
      },
    });
    await recordAudit({
      tableName: "seasons",
      rowId: row.id,
      action: "update",
      changedByPersonId: admin.id,
      before: existing,
      after: row,
      changeSource: "admin_console",
      tx,
    });
    return row;
  });

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/classes");
  return {
    ok: true,
    seasonId: updated.id,
    message: `Updated ${updated.name}`,
  };
}

const DeleteSchema = z.object({ seasonId: z.string().uuid() });

export async function deleteSeason(
  formData: FormData,
): Promise<ActionResult> {
  const { person: admin } = await requireAdmin();
  const parsed = DeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Invalid season id." };
  }
  const { seasonId } = parsed.data;

  const inUse = await prisma.classSeries.count({ where: { seasonId } });
  if (inUse > 0) {
    return {
      ok: false,
      error: `Can't delete this season — ${inUse} class series still reference it. Archive it instead so it stays linked to historical classes but disappears from the create-class dropdown.`,
    };
  }

  const existing = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!existing) {
    return { ok: false, error: "Season not found." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.season.delete({ where: { id: seasonId } });
      await recordAudit({
        tableName: "seasons",
        rowId: seasonId,
        action: "delete",
        changedByPersonId: admin.id,
        before: existing,
        changeSource: "admin_console",
        tx,
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return {
        ok: false,
        error:
          "Can't delete this season — at least one class series still references it. Archive it instead.",
      };
    }
    throw err;
  }

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/classes");
  return { ok: true, message: `Deleted ${existing.name}` };
}

const SetActiveSchema = z.object({
  seasonId: z.string().uuid(),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function setSeasonActive(
  formData: FormData,
): Promise<ActionResult> {
  const { person: admin } = await requireAdmin();
  const parsed = SetActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Invalid input." };
  }
  const { seasonId, isActive } = parsed.data;

  const existing = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!existing) return { ok: false, error: "Season not found." };
  if (existing.isActive === isActive) {
    return {
      ok: true,
      message: isActive ? "Already active." : "Already archived.",
    };
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.season.update({
      where: { id: seasonId },
      data: {
        isActive,
        archivedAt: isActive ? null : new Date(),
      },
    });
    await recordAudit({
      tableName: "seasons",
      rowId: seasonId,
      action: "update",
      changedByPersonId: admin.id,
      before: existing,
      after: updated,
      changeSource: "admin_console",
      tx,
    });
  });

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/classes");
  return {
    ok: true,
    message: isActive
      ? `${existing.name} is back in the dropdown.`
      : `${existing.name} archived.`,
  };
}
