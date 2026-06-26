import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MetricStrip, Stat } from "@/components/ui/stat";
import { Section, SectionDivider } from "@/components/ui/section";
import { StatusSurface } from "@/components/ui/status-surface";
import { ChevronRightIcon, ClassIcon, MapPinIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status-tone";

type VenueKind = "club" | "school" | "rented_court";

export type VenueDirectoryItem = {
  id: string;
  slug: string;
  name: string;
  kind: VenueKind;
  city: string | null;
  isActive: boolean;
  coverImageUrl: string | null;
  club: { name: string; slug: string } | null;
  _count: { classSeries: number };
};

const KIND_SECTIONS: {
  kind: VenueKind;
  title: string;
  description: string;
}[] = [
  {
    kind: "club",
    title: "Club venues",
    description: "Home bases where members play and classes meet on court.",
  },
  {
    kind: "school",
    title: "School venues",
    description: "On-site locations at partner schools — pickup timing lives on Schools.",
  },
  {
    kind: "rented_court",
    title: "Rented courts",
    description: "External courts booked for specific programs.",
  },
];

export function VenueDirectory({
  venues,
  classLabel,
  classSingular,
}: {
  venues: VenueDirectoryItem[];
  classLabel: string;
  classSingular: string;
}) {
  const active = venues.filter((v) => v.isActive);
  const archived = venues.filter((v) => !v.isActive);
  const withClasses = active.filter((v) => v._count.classSeries > 0).length;
  const clubCount = active.filter((v) => v.kind === "club").length;
  const schoolCount = active.filter((v) => v.kind === "school").length;
  const rentedCount = active.filter((v) => v.kind === "rented_court").length;

  return (
    <div className="space-y-8">
      <MetricStrip>
        <Stat label="Active" value={active.length} hint="Open for new classes" tone="triaz" />
        <Stat
          label="With classes"
          value={withClasses}
          hint={`Linked to a ${classLabel.toLowerCase()} series`}
        />
        <Stat label="Clubs" value={clubCount} tone="triaz" />
        <Stat
          label="Archived"
          value={archived.length}
          hint={archived.length === 0 ? "Nothing hidden" : "Hidden from new classes"}
          tone={archived.length > 0 ? "warning" : "neutral"}
        />
      </MetricStrip>

      <div className="flex flex-wrap gap-2 text-xs">
        {schoolCount > 0 && (
          <Badge tone="joint" variant="soft">
            {schoolCount} school{schoolCount === 1 ? "" : "s"}
          </Badge>
        )}
        {rentedCount > 0 && (
          <Badge tone="neutral" variant="soft">
            {rentedCount} rented
          </Badge>
        )}
      </div>

      {KIND_SECTIONS.map(({ kind, title, description }) => {
        const rows = active.filter((v) => v.kind === kind);
        if (rows.length === 0) return null;
        return (
          <Section key={kind} title={title} description={description}>
            <ul className="space-y-2">
              {rows.map((venue) => (
                <VenueRow
                  key={venue.id}
                  venue={venue}
                  classLabel={classLabel}
                  classSingular={classSingular}
                />
              ))}
            </ul>
          </Section>
        );
      })}

      {archived.length > 0 && (
        <>
          <SectionDivider label="Archived" />
          <Section
            title={`${archived.length} archived`}
            description="Still attached to existing class series — restore anytime."
            surface="card"
            padding="compact"
          >
            <ul className="space-y-2">
              {archived.map((venue) => (
                <VenueRow
                  key={venue.id}
                  venue={venue}
                  classLabel={classLabel}
                  classSingular={classSingular}
                  archived
                />
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

function VenueRow({
  venue,
  classLabel,
  classSingular,
  archived = false,
}: {
  venue: VenueDirectoryItem;
  classLabel: string;
  classSingular: string;
  archived?: boolean;
}) {
  const tone = venueTone(venue);
  const meta = buildMeta(venue);

  return (
    <li>
      <Link
        href={`/admin/venues/${venue.id}`}
        className="group block rounded-[var(--radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <StatusSurface
          tone={tone}
          className={cn(
            "elev-card flex items-stretch gap-0 overflow-hidden p-0 transition-[transform,box-shadow] duration-[var(--duration-fast)]",
            "group-hover:-translate-y-px group-hover:shadow-[var(--shadow-elevated)]",
            archived && "opacity-70 saturate-[0.92]",
          )}
        >
          <VenueThumbnail venue={venue} tone={tone} />
          <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 sm:gap-4 sm:py-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium tracking-tight text-[var(--foreground)]">
                  {venue.name}
                </span>
                <Badge tone={kindBadgeTone(venue.kind)} variant="soft" className="capitalize">
                  {kindLabel(venue.kind)}
                </Badge>
                {archived && (
                  <Badge tone="neutral" variant="soft">
                    archived
                  </Badge>
                )}
                <span className="tabular text-xs font-medium text-[var(--muted-foreground)] sm:hidden">
                  {venue._count.classSeries}{" "}
                  {venue._count.classSeries === 1
                    ? classSingular.toLowerCase()
                    : classLabel.toLowerCase()}
                </span>
              </div>
              <p className="truncate text-sm text-[var(--muted-foreground)]">{meta}</p>
              <p className="font-mono text-[11px] text-[var(--muted-foreground)]/80">
                {venue.slug}
              </p>
            </div>

            <div className="hidden shrink-0 text-right sm:block">
              <div className="font-display text-2xl font-medium tabular-nums leading-none tracking-tight">
                {venue._count.classSeries}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                {venue._count.classSeries === 1
                  ? classSingular.toLowerCase()
                  : classLabel.toLowerCase()}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)]">
              <span className="hidden text-xs font-medium sm:inline">Edit</span>
              <ChevronRightIcon size={16} className="transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </StatusSurface>
      </Link>
    </li>
  );
}

function VenueThumbnail({
  venue,
  tone,
}: {
  venue: VenueDirectoryItem;
  tone: StatusTone;
}) {
  const iconTone =
    tone === "triaz"
      ? "text-[var(--triaz-ink)] bg-[var(--triaz-soft)]"
      : tone === "randwijck"
        ? "text-[var(--randwijck-ink)] bg-[var(--randwijck-soft)]"
        : tone === "joint"
          ? "text-[var(--joint-ink)] bg-[var(--joint-soft)]"
          : "text-[var(--muted-foreground)] bg-[var(--surface-strong)]";

  if (venue.coverImageUrl) {
    return (
      <div className="relative hidden w-20 shrink-0 self-stretch overflow-hidden sm:block lg:w-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={venue.coverImageUrl}
          alt=""
          className="h-full min-h-[4.5rem] w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[var(--card)]/10" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "hidden w-14 shrink-0 items-center justify-center sm:flex sm:w-16",
        iconTone,
      )}
    >
      {venue.kind === "school" ? (
        <ClassIcon size={22} />
      ) : (
        <MapPinIcon size={22} />
      )}
    </div>
  );
}

function buildMeta(venue: VenueDirectoryItem): string {
  const parts: string[] = [];
  if (venue.city) parts.push(venue.city);
  if (venue.club?.name) parts.push(venue.club.name);
  if (parts.length === 0) return "No location or club linked";
  return parts.join(" · ");
}

function venueTone(venue: VenueDirectoryItem): StatusTone {
  if (venue.kind === "school") return "joint";
  if (venue.kind === "rented_court") return "neutral";
  if (venue.club?.slug === "randwijck") return "randwijck";
  if (venue.club?.slug === "triaz") return "triaz";
  return "triaz";
}

function kindLabel(kind: VenueKind): string {
  switch (kind) {
    case "club":
      return "Club";
    case "school":
      return "School";
    case "rented_court":
      return "Rented court";
  }
}

function kindBadgeTone(kind: VenueKind): "triaz" | "joint" | "neutral" {
  switch (kind) {
    case "club":
      return "triaz";
    case "school":
      return "joint";
    case "rented_court":
      return "neutral";
  }
}
