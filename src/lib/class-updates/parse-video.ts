/**
 * Pure URL → provider/id helper for the coach class-update form.
 * Recognises YouTube watch / shortened / shorts URLs and Vimeo
 * canonical URLs. Returns `null` when nothing is recognised so the
 * caller can fall back to an "open original link" affordance.
 *
 * For YouTube the thumbnail lives at a stable, no-API-key URL
 * (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`). For Vimeo the
 * canonical thumbnail isn't predictable from the id alone, so we
 * rely on a server-side oEmbed lookup at create time
 * ({@link fetchVimeoThumbnail}). Failure to resolve the Vimeo
 * thumbnail is fine — the embed still works, the tile just shows
 * a generic placeholder.
 */

import type { ClassUpdateVideoProvider } from "@prisma/client";

export interface ParsedVideo {
  provider: ClassUpdateVideoProvider;
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string | null;
}

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const VIMEO_HOSTS = new Set([
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
]);

const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

/**
 * Extract the YouTube/Vimeo provider+id from a coach-pasted URL.
 * Synchronous and side-effect free; for Vimeo thumbnails call
 * {@link fetchVimeoThumbnail} after the fact.
 */
export function parseVideoUrl(raw: string): ParsedVideo | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.host.toLowerCase();

  if (YT_HOSTS.has(host)) {
    return parseYouTube(url);
  }
  if (VIMEO_HOSTS.has(host)) {
    return parseVimeo(url);
  }
  return null;
}

function parseYouTube(url: URL): ParsedVideo | null {
  let id: string | null = null;
  if (url.host === "youtu.be" || url.host === "www.youtu.be") {
    id = url.pathname.replace(/^\//, "").split("/")[0] ?? null;
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else if (segments[0] === "shorts" || segments[0] === "embed") {
      id = segments[1] ?? null;
    } else if (segments[0] === "live") {
      id = segments[1] ?? null;
    } else if (segments.length === 1 && segments[0]?.length === 11) {
      // Some short links: youtube.com/<id>
      id = segments[0];
    }
  }
  if (!id || !ID_RE.test(id)) return null;
  return {
    provider: "youtube",
    videoId: id,
    embedUrl: `https://www.youtube.com/embed/${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

function parseVimeo(url: URL): ParsedVideo | null {
  const segments = url.pathname.split("/").filter(Boolean);
  // Common shapes: /<id>, /video/<id>, /channels/.../<id>
  let id: string | null = null;
  for (const seg of segments.reverse()) {
    if (/^\d+$/.test(seg)) {
      id = seg;
      break;
    }
  }
  if (!id) return null;
  return {
    provider: "vimeo",
    videoId: id,
    embedUrl: `https://player.vimeo.com/video/${id}`,
    thumbnailUrl: null,
  };
}

/**
 * Hit Vimeo's public oEmbed endpoint to grab the thumbnail URL for a
 * given video id. Fails gracefully — returns `null` on any non-2xx /
 * malformed response, leaving the caller free to persist an update
 * without a thumbnail.
 */
export async function fetchVimeoThumbnail(
  videoId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(
        `https://vimeo.com/${videoId}`,
      )}`,
      { signal: AbortSignal.timeout(4_000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { thumbnail_url?: unknown };
    if (typeof json.thumbnail_url === "string") return json.thumbnail_url;
    return null;
  } catch {
    return null;
  }
}
