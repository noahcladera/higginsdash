"use client";

import { LinkSegmentedControl } from "@/components/ui/link-segmented-control";

export function BookClubPicker({
  clubs,
  activeSlug,
  date,
  courtId,
  basePath = "/portal/book",
}: {
  clubs: { slug: string; name: string }[];
  activeSlug: string;
  date: string;
  /** Preserve active court when switching clubs. */
  courtId?: string;
  /** Route prefix, e.g. `/portal/book` or `/coach/book`. */
  basePath?: string;
}) {
  if (clubs.length <= 1) return null;

  return (
    <LinkSegmentedControl
      aria-label="Club"
      options={clubs.map((c) => ({ value: c.slug, label: c.name }))}
      value={activeSlug}
      hrefFor={(slug) => {
        const params = new URLSearchParams({ club: slug, date });
        if (courtId) params.set("court", courtId);
        return `${basePath}?${params.toString()}`;
      }}
    />
  );
}
