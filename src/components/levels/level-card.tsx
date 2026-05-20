import type { LevelContent } from "@prisma/client";

function embedFromUrl(url: string): { type: "iframe"; src: string } | { type: "video"; src: string } | null {
  try {
    const u = new URL(url);
    if (url.endsWith(".mp4") || u.pathname.endsWith(".mp4")) {
      return { type: "video", src: url };
    }
    if (u.hostname.includes("youtube.com") || u.hostname === "youtu.be") {
      let id: string | null = null;
      if (u.hostname === "youtu.be") {
        id = u.pathname.replace(/^\//, "") || null;
      } else if (u.pathname === "/watch") {
        id = u.searchParams.get("v");
      } else if (u.pathname.startsWith("/embed/")) {
        id = u.pathname.replace(/^\/embed\//, "") || null;
      }
      if (id)
        return {
          type: "iframe",
          src: `https://www.youtube.com/embed/${id}`,
        };
    }
    if (u.hostname.includes("vimeo.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const vid = parts[parts.length - 1];
      if (vid && /^\d+$/.test(vid))
        return { type: "iframe", src: `https://player.vimeo.com/video/${vid}` };
    }
  } catch {
    return null;
  }
  return null;
}

export function LevelCard({ row }: { row: LevelContent }) {
  const embed = row.videoUrl ? embedFromUrl(row.videoUrl) : null;

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
      <h2 className="font-display text-xl font-medium tracking-tight">
        {row.title}
      </h2>
      {row.shortDescription && (
        <p className="mt-2 text-sm font-medium text-[var(--muted-foreground)]">
          {row.shortDescription}
        </p>
      )}
      {row.longDescription.trim() ? (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
          {row.longDescription}
        </div>
      ) : (
        <p className="mt-4 text-sm italic text-[var(--muted-foreground)]">
          Description coming soon — ask your coach or the club if you are unsure
          which level fits.
        </p>
      )}
      {embed && (
        <div className="mt-6 aspect-video w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black">
          {embed.type === "iframe" ? (
            <iframe
              title={`Video: ${row.title}`}
              src={embed.src}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              controls
              className="h-full w-full"
              src={embed.src}
              preload="metadata"
            />
          )}
        </div>
      )}
    </article>
  );
}
