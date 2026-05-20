"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";

const SlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const VenueSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(SlugRegex, "Slug must be lowercase, digits, and hyphens only"),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["club", "school", "rented_court"]),
  clubId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v == null ? null : v)),
  addressLine1: trimmedOptional(160),
  addressLine2: trimmedOptional(160),
  postalCode: trimmedOptional(20),
  city: trimmedOptional(80),
  country: z.string().trim().min(2).max(2).default("NL"),
  notes: trimmedOptional(2000),
});

function trimmedOptional(max: number) {
  return z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const t = v.trim();
      return t === "" ? null : t;
    });
}

/**
 * Create a venue. Redirects to the detail page on success so the admin
 * lands on "edit what I just made". Unique slug is enforced at the
 * database layer.
 */
export async function createVenue(formData: FormData) {
  await requireAdmin();
  const parsed = VenueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const data = parsed.data;
  if (data.kind === "club" && !data.clubId) {
    throw new Error("Club venues must be linked to a club.");
  }

  const created = await prisma.venue.create({
    data: {
      slug: data.slug,
      name: data.name,
      kind: data.kind,
      clubId: data.kind === "club" ? data.clubId : null,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      postalCode: data.postalCode,
      city: data.city,
      country: data.country,
      notes: data.notes,
    },
  });

  revalidatePath("/admin/venues");
  redirect(`/admin/venues/${created.id}`);
}

const UpdateSchema = VenueSchema.extend({ venueId: z.string().uuid() });

export async function updateVenue(formData: FormData) {
  await requireAdmin();
  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { venueId, ...data } = parsed.data;
  if (data.kind === "club" && !data.clubId) {
    throw new Error("Club venues must be linked to a club.");
  }

  await prisma.venue.update({
    where: { id: venueId },
    data: {
      slug: data.slug,
      name: data.name,
      kind: data.kind,
      clubId: data.kind === "club" ? data.clubId : null,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      postalCode: data.postalCode,
      city: data.city,
      country: data.country,
      notes: data.notes,
    },
  });

  revalidatePath("/admin/venues");
  revalidatePath(`/admin/venues/${venueId}`);
}

const ArchiveSchema = z.object({
  venueId: z.string().uuid(),
  archive: z.enum(["archive", "unarchive"]),
});

/**
 * Archive / unarchive a venue. Archiving blocks future class creation
 * but preserves historical references — existing ClassSeries rows keep
 * their `venueId` even after the venue is archived.
 */
export async function archiveVenue(formData: FormData) {
  await requireAdmin();
  const parsed = ArchiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid input");
  }
  const { venueId, archive } = parsed.data;
  await prisma.venue.update({
    where: { id: venueId },
    data: {
      isActive: archive === "unarchive",
      archivedAt: archive === "archive" ? new Date() : null,
    },
  });
  revalidatePath("/admin/venues");
  revalidatePath(`/admin/venues/${venueId}`);
}
