/**
 * Renders a list of class updates with optional video thumbnails /
 * embeds. Server component — no interactivity beyond the optional
 * "archive" form passed in by the coach surface.
 */

import Link from "next/link";
import type { ClassUpdateRow } from "@/lib/class-updates/queries";
import { Button } from "@/components/ui/button";
import { archiveClassUpdate } from "@/lib/class-updates/actions";

interface Props {
  updates: ClassUpdateRow[];
  /**
   * `coach`: include archive controls and skip the "open in portal"
   *          deep link.
   * `parent`: render the embedded video iframe inline so the family
   *           can watch from the series page.
   */
  variant: "coach" | "parent";
  /** Used by the coach archive form to revalidate the right path. */
  classSeriesId?: string;
  emptyHint?: string;
}

export function ClassUpdateList({
  updates,
  variant,
  classSeriesId,
  emptyHint,
}: Props) {
  if (updates.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        {emptyHint ?? "No updates posted yet."}
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {updates.map((u) => {
        const posterName =
          [u.postedBy.firstName, u.postedBy.lastName]
            .filter(Boolean)
            .join(" ") || "Coach";
        return (
          <li
            key={u.id}
            className="elev-card rounded-md p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{u.title}</h3>
              <span className="text-xs text-[var(--muted-foreground)]">
                {posterName} · {u.publishedAt.toLocaleDateString()}
              </span>
            </div>
            {u.bodyMarkdown && (
              <p className="mt-2 whitespace-pre-line text-sm text-[var(--foreground)]/80">
                {u.bodyMarkdown}
              </p>
            )}

            {u.videoProvider && u.videoId && (
              <div className="mt-3">
                {variant === "parent" ? (
                  <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
                    <iframe
                      src={
                        u.videoProvider === "youtube"
                          ? `https://www.youtube.com/embed/${u.videoId}`
                          : `https://player.vimeo.com/video/${u.videoId}`
                      }
                      title={u.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <Link
                    href={u.videoUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 rounded-md border border-[var(--border)] p-2 text-sm hover:bg-[var(--muted)]/30"
                  >
                    {u.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.thumbnailUrl}
                        alt=""
                        className="h-12 w-20 rounded-sm object-cover"
                      />
                    ) : (
                      <span className="grid h-12 w-20 place-items-center rounded-sm bg-[var(--muted)] text-xs">
                        Video
                      </span>
                    )}
                    <span>
                      Watch on{" "}
                      {u.videoProvider === "youtube" ? "YouTube" : "Vimeo"}
                    </span>
                  </Link>
                )}
              </div>
            )}

            {variant === "coach" && classSeriesId && (
              <form action={archiveClassUpdate} className="mt-3">
                <input type="hidden" name="id" value={u.id} />
                <input
                  type="hidden"
                  name="classSeriesId"
                  value={classSeriesId}
                />
                <Button type="submit" variant="ghost" size="sm">
                  Archive
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
