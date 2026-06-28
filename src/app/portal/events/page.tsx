import { CalendarIcon } from "lucide-react";
import { listVisibleEvents } from "@/lib/portal/catalog-queries";
import { PortalPageHeader } from "@/components/portal/portal-page-header";
import { EmptyState } from "@/components/ui/empty-state";
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
    <div className="space-y-10">
      <PortalPageHeader
        kicker="Events"
        title="What's on"
        description="Tournaments, socials and one-off events. Same booking and payment flow as classes — just hand-picked moments rather than a recurring spot."
      />

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon />}
          title="Nothing scheduled right now"
          description="Check back soon — we run socials, ladders and tournaments throughout the season."
        />
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
