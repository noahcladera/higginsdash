import type { ReferenceVideo } from "./types";

export const REFERENCE_VIDEOS: ReferenceVideo[] = [
  {
    id: "ages-4-7",
    title: "Ages 4–7 — skills & medals",
    youtubeId: "oFGpJh2y2iI",
    ageRange: "4–7",
  },
  {
    id: "ages-7-12",
    title: "Ages 7–12 — skills & medals",
    youtubeId: "q5ea9ar5ccY",
    ageRange: "7–12",
  },
];

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}

export function youtubeWatchUrl(id: string): string {
  return `https://youtu.be/${id}`;
}
