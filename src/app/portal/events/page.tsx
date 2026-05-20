import { listVisibleEvents } from "@/lib/portal/catalog-queries";
import { PageHeader } from "@/components/ui/page-header";
import { SeriesRow } from "@/app/portal/programs/_components/series-row";

/**
 * Portal events surface — same data and enrollment path as the
 * regular catalog, only filtered to `ClassType.event`. We reuse
 * `SeriesRow` so cards look identical to the catalog and clicks
 * land on the existing series detail page.
 */
export default async function PortalEventsPage() {
  const events = await listVisibleEvents();

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <PageHeader
        kicker="Events"
        title="What's on"
        description="Tournaments, socials and one-off events. Same booking and payment flow as classes — just hand-picked moments rather than a recurring spot."
      />

      {events.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-10 text-center text-sm text-[var(--muted-foreground)]">
          Nothing scheduled right now. Check back soon — we run socials,
          ladders and tournaments throughout the season.
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <SeriesRow key={e.id} series={e} showProgramTag={false} />
          ))}
        </ul>
      )}
    </div>
  );
}
