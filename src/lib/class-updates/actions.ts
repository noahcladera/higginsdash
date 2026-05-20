"use server";

/**
 * Coach-side server actions for the class-updates feed.
 *
 * Permission model: caller must be on `class_series_coaches` for the
 * series (or an admin via {@link requireCoach}, which already collapses
 * admin → coach for `/coach/*` writes). Updates fan out as `in_app`
 * notifications to every adult in every household with an active or
 * pending-payment enrollment.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/auth/require-coach";
import { classSeriesClubScope } from "@/lib/coach/club-scope";
import { notify } from "@/lib/notifications/notify";
import { getTerms } from "@/lib/tenant";
import {
  fetchVimeoThumbnail,
  parseVideoUrl,
} from "@/lib/class-updates/parse-video";

const PostClassUpdateSchema = z.object({
  classSeriesId: z.string().uuid(),
  classSessionId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).default(""),
  videoUrl: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v?.trim() === "" ? undefined : v?.trim())),
});

export async function postClassUpdate(formData: FormData) {
  const parsed = PostClassUpdateSchema.parse({
    classSeriesId: formData.get("classSeriesId"),
    classSessionId: formData.get("classSessionId") ?? undefined,
    title: formData.get("title"),
    body: formData.get("body") ?? "",
    videoUrl: formData.get("videoUrl") ?? undefined,
  });

  const { person, allowedClubIds } = await requireCoach();
  const clubScope = classSeriesClubScope(allowedClubIds);

  const series = await prisma.classSeries.findFirst({
    where: {
      id: parsed.classSeriesId,
      coaches: { some: { coachPersonId: person.id } },
      ...clubScope,
    },
    select: {
      id: true,
      name: true,
      program: { select: { slug: true } },
    },
  });
  if (!series) {
    throw new Error("You can only post updates to your own classes.");
  }

  const terms = await getTerms();

  // If they pinned a session, sanity-check it's one of this series'
  // sessions. Wrong/absent → bail rather than silently dropping the
  // pin so the coach knows the form was misconfigured.
  if (parsed.classSessionId) {
    const session = await prisma.classSession.findFirst({
      where: {
        id: parsed.classSessionId,
        classSeriesId: parsed.classSeriesId,
      },
      select: { id: true },
    });
    if (!session) {
      throw new Error("That session doesn't belong to this series.");
    }
  }

  let videoProvider: "youtube" | "vimeo" | null = null;
  let videoId: string | null = null;
  let thumbnailUrl: string | null = null;
  if (parsed.videoUrl) {
    const parsedVideo = parseVideoUrl(parsed.videoUrl);
    if (!parsedVideo) {
      throw new Error(
        "Couldn't read that link. Use a YouTube or Vimeo URL.",
      );
    }
    videoProvider = parsedVideo.provider;
    videoId = parsedVideo.videoId;
    thumbnailUrl = parsedVideo.thumbnailUrl;
    if (videoProvider === "vimeo") {
      // Best-effort thumbnail. Failure is fine — the embed still works.
      thumbnailUrl = await fetchVimeoThumbnail(videoId);
    }
  }

  const created = await prisma.classUpdate.create({
    data: {
      classSeriesId: parsed.classSeriesId,
      classSessionId: parsed.classSessionId ?? null,
      postedByPersonId: person.id,
      title: parsed.title,
      bodyMarkdown: parsed.body,
      videoUrl: parsed.videoUrl ?? null,
      videoProvider,
      videoId,
      thumbnailUrl,
    },
    select: { id: true },
  });

  await fanOutToHouseholds({
    classUpdateId: created.id,
    classSeriesId: parsed.classSeriesId,
    seriesName: series.name,
    title: parsed.title,
    posterDisplayName:
      [person.firstName, person.lastName].filter(Boolean).join(" ") ||
      terms.coach.singular,
    classSingular: terms.class.singular,
  });

  revalidatePath(`/coach/classes/${parsed.classSeriesId}`);
  if (parsed.classSessionId) {
    revalidatePath(
      `/coach/classes/${parsed.classSeriesId}/sessions/${parsed.classSessionId}`,
    );
  }
  // Series detail page lives under /portal/programs/<slug>/<seriesId>.
  // We don't know the slug here from the form alone, so just hit the
  // family hub which lists recent updates plus the inbox.
  revalidatePath("/portal/family");
  revalidatePath("/portal/inbox");
  if (series.program?.slug) {
    revalidatePath(
      `/portal/programs/${series.program.slug}/${parsed.classSeriesId}`,
    );
  }
}

const ArchiveClassUpdateSchema = z.object({
  id: z.string().uuid(),
  classSeriesId: z.string().uuid(),
});

export async function archiveClassUpdate(formData: FormData) {
  const parsed = ArchiveClassUpdateSchema.parse({
    id: formData.get("id"),
    classSeriesId: formData.get("classSeriesId"),
  });

  const { person, allowedClubIds } = await requireCoach();
  const clubScope = classSeriesClubScope(allowedClubIds);

  const update = await prisma.classUpdate.findFirst({
    where: {
      id: parsed.id,
      classSeriesId: parsed.classSeriesId,
      classSeries: {
        coaches: { some: { coachPersonId: person.id } },
        ...clubScope,
      },
    },
    select: { id: true },
  });
  if (!update) {
    throw new Error("You can only archive updates on your own classes.");
  }

  await prisma.classUpdate.update({
    where: { id: parsed.id },
    data: { archivedAt: new Date() },
  });

  revalidatePath(`/coach/classes/${parsed.classSeriesId}`);
  revalidatePath("/portal/family");
}

interface FanOutInput {
  classUpdateId: string;
  classSeriesId: string;
  seriesName: string;
  title: string;
  posterDisplayName: string;
  classSingular: string;
}

/**
 * For every household with an active / pending-payment enrollment in
 * the series, notify each adult member. Idempotent within a single
 * call: we de-duplicate by personId so a parent enrolled twice for
 * siblings still only gets one ping.
 */
async function fanOutToHouseholds(input: FanOutInput): Promise<void> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      classSeriesId: input.classSeriesId,
      status: { in: ["active", "pending_payment"] },
    },
    select: {
      studentPersonId: true,
      student: {
        select: {
          person: {
            select: {
              householdMember: {
                select: {
                  household: {
                    select: {
                      members: {
                        where: { roleInHousehold: "adult" },
                        select: { personId: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const adultIds = new Set<string>();
  for (const e of enrollments) {
    const adults =
      e.student.person.householdMember?.household.members ?? [];
    for (const a of adults) adultIds.add(a.personId);
  }
  if (adultIds.size === 0) return;

  const subject = `New update from ${input.posterDisplayName} — ${input.seriesName}`;
  const body = `${input.posterDisplayName} posted "${input.title}" to ${input.seriesName}. Open the inbox or your ${input.classSingular.toLowerCase()} page to see it.`;

  // Sequential to keep it simple — the lists are small (one series,
  // dozens of adults). Wrap in a transaction so a partial failure
  // doesn't leave half the parents notified.
  await prisma.$transaction(async (tx) => {
    for (const personId of adultIds) {
      await notify({
        recipientPersonId: personId,
        templateKey: "class.update.posted",
        subject,
        body,
        relatedTable: "class_updates",
        relatedRowId: input.classUpdateId,
        tx: tx as Prisma.TransactionClient,
      });
    }
  });
}
