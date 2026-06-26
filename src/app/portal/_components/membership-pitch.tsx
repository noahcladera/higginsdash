import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ArrowRightIcon, MapPinIcon, TennisIcon } from "@/components/icons";
import { clubTheme, themeForClubs, type ClubTheme } from "@/lib/club-theme";
import {
  MEMBERSHIP_PRICES,
  RANDWIJCK_FULL_YEAR,
  TRIAZ_FULL_YEAR,
  formatMembershipPrice,
  jointSavings,
  type ClubSlug,
} from "@/lib/pricing";
import {
  currentTriazHalf,
  formatLongDate,
  randwijckStatusOn,
} from "@/lib/membership-seasons";
import { cn } from "@/lib/utils";

/**
 * Per-club facts — surface, location, blurb, and (optionally) a hero image
 * URL. When `imageSrc` is missing we render a CSS court placeholder tinted
 * to the club. Drop a JPG at `/public/images/clubs/<slug>.jpg` and pass it
 * as `imageSrc` to upgrade the visual.
 */
const CLUB_INFO: Record<
  ClubSlug,
  {
    surface: "Clay" | "Grass";
    surfaceNote: string;
    city: string;
    addressLine1: string;
    postalCode: string;
    mapUrl: string;
    blurb: string;
    imageSrc?: string;
  }
> = {
  triaz: {
    surface: "Grass",
    surfaceNote: "Drains in the rain, so play never really stops.",
    city: "Amsterdam",
    addressLine1: "Van Heenvlietlaan 6",
    postalCode: "1083 CL",
    mapUrl:
      "https://maps.google.com/?q=S.V.+Triaz+Van+Heenvlietlaan+6+Amsterdam",
    blurb:
      "Four outdoor grass courts. Open all year — the turf soaks up the wet so we keep playing through the Dutch winter.",
    imageSrc: undefined,
  },
  randwijck: {
    surface: "Clay",
    surfaceNote: "Soft on the knees, slow on the bounce.",
    city: "Amstelveen",
    addressLine1: "Barend van Dorenweerdelaan 16",
    postalCode: "1181 BK",
    mapUrl:
      "https://maps.google.com/?q=Tennispark+Randwijck+Barend+van+Dorenweerdelaan+16+Amstelveen",
    blurb:
      "Classic Dutch clay. Open from spring through autumn — the courts close once the rain takes over.",
    imageSrc: undefined,
  },
};

export interface MembershipPitchClub {
  id: string;
  name: string;
  slug: string;
}

/**
 * Top "what is this" card used above the club tiles. Optional — if the
 * caller already has its own page header, skip this and just render
 * `<ClubTilesGrid />` + `<JointCrossSell />` directly.
 */
export function MembershipPitchHeader({
  kicker = "Pick a home",
  title = "Two clubs, one membership system",
  description = "You need an active membership at a club to book one of its courts. Choose the club that suits your week, or cover both for a joint discount.",
}: {
  kicker?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="elev-card p-5 sm:p-6">
      <div className="space-y-1">
        <div className="text-sm font-medium text-[var(--muted-foreground)]">
          {kicker}
        </div>
        <h2 className="font-display text-2xl font-medium tracking-tight">
          {title}
        </h2>
        <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
          {description}
        </p>
      </div>
    </div>
  );
}

/**
 * Two-club tile grid. Each tile shows a tinted court hero, key facts,
 * the cheapest entry price, and a tinted CTA into the membership page.
 *
 * Falls back gracefully if a club isn't yet seeded — only renders tiles
 * for the slugs we know about (Triaz / Randwijck).
 */
export function ClubTilesGrid({
  clubs,
  marketingImages = {},
}: {
  clubs: MembershipPitchClub[];
  marketingImages?: Record<string, string>;
}) {
  const known = clubs
    .map((c) => ({ ...c, slug: c.slug as ClubSlug }))
    .filter((c) => c.slug in CLUB_INFO);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {known.map((club) => (
        <ClubTile
          key={club.id}
          club={club}
          theme={themeForClubs([club.slug])}
          imageSrc={marketingImages[`club:${club.slug}`]}
        />
      ))}
    </div>
  );
}

/**
 * Joint cross-sell card — pitch the "both clubs" bundle and the
 * adult-tier saving vs two single-club memberships. Suppress when the
 * household only has one known club seeded.
 */
export function JointCrossSell({
  saving = jointSavings("adult", { isReturning: true }),
}: {
  saving?: number;
} = {}) {
  const styles = clubTheme("joint");
  return (
    <article
      className={cn(
        "fade-in elev-card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6",
      )}
    >
      <div className="flex items-center gap-4">
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "var(--joint-soft)",
            color: styles.rawColor,
          }}
        >
          <TennisIcon />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-[var(--muted-foreground)]">
            Best value
          </div>
          <h3 className="font-display text-xl font-medium tracking-tight">
            Cover both clubs from{" "}
            {formatMembershipPrice(MEMBERSHIP_PRICES.adult.joint)}
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            One membership, both venues. Save up to{" "}
            <span className="text-[var(--foreground)]">
              {formatMembershipPrice(saving)}
            </span>{" "}
            vs buying single-club memberships for both.
          </p>
        </div>
      </div>

      <Button asChild tone="joint">
        <Link href="/portal/membership?coverage=joint">
          See joint options <ArrowRightIcon size={14} />
        </Link>
      </Button>
    </article>
  );
}

function ClubTile({
  club,
  theme,
  imageSrc,
}: {
  club: { id: string; name: string; slug: ClubSlug };
  theme: ClubTheme;
  imageSrc?: string;
}) {
  const styles = clubTheme(theme);
  const info = CLUB_INFO[club.slug];
  const heroSrc = imageSrc ?? info.imageSrc;

  // Cheapest entry: pick the lowest single-club rate visible across
  // both clubs at full-year (returning-member) pricing.
  const fromPrice =
    club.slug === "triaz"
      ? TRIAZ_FULL_YEAR.child
      : RANDWIJCK_FULL_YEAR.child;
  const adultFullYear =
    club.slug === "triaz" ? TRIAZ_FULL_YEAR.adult : RANDWIJCK_FULL_YEAR.adult;
  const childFullYear =
    club.slug === "triaz" ? TRIAZ_FULL_YEAR.child : RANDWIJCK_FULL_YEAR.child;
  const familyFullYear =
    club.slug === "triaz"
      ? null
      : RANDWIJCK_FULL_YEAR.family;

  // Season status for the tile footer.
  const seasonLine = (() => {
    if (club.slug === "triaz") {
      const half = currentTriazHalf();
      return {
        kind: "open" as const,
        label: "Open year-round",
        detail: `Current half ends ${formatLongDate(addDaysVisual(half.endsOn, -1))}.`,
      };
    }
    const r = randwijckStatusOn();
    if (r.isOpen && r.current) {
      return {
        kind: "open" as const,
        label: "In season now",
        detail: `Closes ${formatLongDate(addDaysVisual(r.current.endsOn, -1))}.`,
      };
    }
    return {
      kind: "closed" as const,
      label: "Closed for winter",
      detail: `Reopens ${formatLongDate(r.upcoming.startsOn)}.`,
    };
  })();

  return (
    <article
      className={cn(
        "fade-in group elev-card flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-floating)]",
      )}
    >
      <CourtHero
        slug={club.slug}
        themeColor={styles.rawColor}
        imageSrc={heroSrc}
      />

      <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)]">
            <span style={{ color: styles.rawColor }}>{styles.label}</span>
            <span aria-hidden className="text-[var(--muted-foreground)]">
              ·
            </span>
            <span className="text-[var(--muted-foreground)]">
              {info.surface} court
            </span>
          </div>
          <h3 className="font-display text-3xl font-medium tracking-tight">
            {club.name}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <MapPinIcon size={14} />
            <a
              href={info.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {info.addressLine1}, {info.postalCode} {info.city}
            </a>
          </div>
        </header>

        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          {info.blurb}
        </p>

        <div className="grid gap-2 text-sm">
          <Fact label="Surface">
            <TennisIcon size={14} className="opacity-60" /> {info.surface} ·{" "}
            <span className="text-[var(--muted-foreground)]">
              {info.surfaceNote}
            </span>
          </Fact>
          <Fact label="Season">
            <SeasonDot kind={seasonLine.kind} />
            {seasonLine.label}
            <span className="text-[var(--muted-foreground)]">
              · {seasonLine.detail}
            </span>
          </Fact>
        </div>

        <div className="mt-auto flex items-end justify-between gap-4 pt-2">
          <div>
            <div className="text-sm font-medium text-[var(--muted-foreground)]">
              Memberships from
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--control)] px-4 py-3">
            <div className="tabular font-display text-3xl font-medium tracking-tight">
              {formatMembershipPrice(fromPrice)}
              <span className="ml-1 text-sm font-normal text-[var(--muted-foreground)]">
                / season
              </span>
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              Adults {formatMembershipPrice(adultFullYear)} ·
              Kids {formatMembershipPrice(childFullYear)}
              {familyFullYear != null && (
                <>
                  {" "}
                  · Family {formatMembershipPrice(familyFullYear)}
                </>
              )}
            </div>
            </div>
          </div>
          <Link
            href={`/portal/membership?club=${club.slug}#buy`}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-[filter] focus:outline-none focus-visible:ring-2",
              styles.buttonBg,
              styles.buttonBgHover,
              styles.buttonText,
              styles.ring,
            )}
          >
            Get a {styles.label} membership <ArrowRightIcon size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="w-20 shrink-0 text-sm font-medium text-[var(--foreground)]/70">
        {label}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm">
        {children}
      </div>
    </div>
  );
}

function SeasonDot({ kind }: { kind: "open" | "closed" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mr-1 inline-block h-2 w-2 translate-y-[-1px] rounded-full",
        kind === "open"
          ? "bg-[var(--success)]"
          : "bg-[var(--muted-foreground)]/50",
      )}
    />
  );
}

/**
 * Court-like hero region. Painted with CSS so we don't depend on any
 * external image. Pass `imageSrc` once a real photo is provided to show
 * that instead (the painted version becomes the loading background).
 */
function CourtHero({
  slug,
  themeColor,
  imageSrc,
}: {
  slug: ClubSlug;
  themeColor: string;
  imageSrc?: string;
}) {
  const isClay = slug === "randwijck";
  const surface = isClay
    ? "linear-gradient(180deg, oklch(0.74 0.13 40) 0%, oklch(0.58 0.16 38) 60%, oklch(0.48 0.16 36) 100%)"
    : "linear-gradient(180deg, oklch(0.66 0.14 155) 0%, oklch(0.5 0.14 155) 60%, oklch(0.4 0.12 155) 100%)";

  return (
    <div
      className="relative isolate aspect-[16/7] w-full overflow-hidden"
      style={{
        background: surface,
      }}
    >
      {imageSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {!imageSrc && (
        <svg
          aria-hidden
          viewBox="0 0 320 140"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full opacity-90 mix-blend-screen"
        >
          <rect
            x="22"
            y="18"
            width="276"
            height="104"
            fill="none"
            stroke="white"
            strokeWidth="1.4"
            rx="2"
          />
          <rect
            x="40"
            y="18"
            width="240"
            height="104"
            fill="none"
            stroke="white"
            strokeWidth="1"
          />
          <line
            x1="40"
            y1="50"
            x2="280"
            y2="50"
            stroke="white"
            strokeWidth="1"
          />
          <line
            x1="40"
            y1="90"
            x2="280"
            y2="90"
            stroke="white"
            strokeWidth="1"
          />
          <line
            x1="160"
            y1="50"
            x2="160"
            y2="90"
            stroke="white"
            strokeWidth="1"
          />
          <line
            x1="22"
            y1="70"
            x2="298"
            y2="70"
            stroke="white"
            strokeWidth="1.6"
            opacity="0.8"
          />
        </svg>
      )}

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-14"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 100%)",
        }}
      />

      <div
        className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur"
        style={{ color: themeColor }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: themeColor }}
          aria-hidden
        />
        {isClay ? "Clay" : "Grass"}
      </div>
    </div>
  );
}

/**
 * Same trick the season calendar uses — `endsOn` is exclusive so step
 * back a day for human-readable display ("Sep 1" → "31 August").
 */
function addDaysVisual(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
