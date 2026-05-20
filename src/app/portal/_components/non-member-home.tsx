import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRightIcon,
  CalendarIcon,
  TrophyIcon,
  ClassIcon,
  FamilyIcon,
  UsersIcon,
  ClockIcon,
  CheckIcon,
  StarIcon,
  CompassIcon,
  CardIcon,
} from "@/components/icons";
import {
  ClubTilesGrid,
  JointCrossSell,
  type MembershipPitchClub,
} from "./membership-pitch";
import { RecommendedPrograms } from "./recommended-programs";
import {
  RANDWIJCK_FULL_YEAR,
  TRIAZ_FULL_YEAR,
  formatMembershipPrice,
  jointFullYear,
  jointSavings,
} from "@/lib/pricing";
import {
  formatLongDate,
  randwijckStatusOn,
} from "@/lib/membership-seasons";
import { cn } from "@/lib/utils";
import type { ProgramRec } from "@/lib/portal/recommend";

/**
 * The portal home for households with NO active membership.
 *
 * This is the high-conversion variant of `/portal`. Top-to-bottom it
 * walks a non-member through:
 *   1. A welcoming sales hero with primary "Get a membership" CTA.
 *   2. A three-anchor price strip (adult / family / both clubs).
 *   3. The two-club tile grid + joint upsell (shared with /portal/book).
 *   4. A six-tile "what you unlock" feature grid.
 *   5. The recommended-programs strip with a "members enroll first" pill.
 *   6. A family / kids pitch (only when relevant).
 *   7. A ladder teaser.
 *   8. A season urgency strip (Randwijck reopens / closes when).
 *   9. A short FAQ block.
 *
 * The empty-week calendar, the `—` stat strip, and the "talk to the
 * office" banner from the member layout are deliberately absent — they
 * say "you have nothing here" and we want every block to say "join us".
 */
export function NonMemberHome({
  firstName,
  isParent,
  hasAnyChild,
  clubs,
  recs,
  brandName,
  showTrialEntry = true,
}: {
  firstName: string | null;
  isParent: boolean;
  /** True when the household roster already has any child member. */
  hasAnyChild: boolean;
  clubs: MembershipPitchClub[];
  recs: { hero: ProgramRec[]; more: ProgramRec[] };
  /** Active tenant brand name, used in the welcome kicker. Defaults to a
   *  generic label so callers that haven't been updated still render. */
  brandName?: string;
  showTrialEntry?: boolean;
}) {
  const greeting = greetingWord();
  const headline = isParent
    ? "Find a lesson for the family. Membership when you're ready."
    : "Find a lesson. Become a member when you're ready.";
  const subtitle = isParent
    ? `${greeting}${firstName ? `, ${firstName}` : ""}. Browse what's on for you and the kids — coaching is open to non-members too. A membership unlocks bookings, the ladder, and the best price on lessons.`
    : `${greeting}${firstName ? `, ${firstName}` : ""}. Have a look at the lessons we run — anyone can sign up. A membership adds court bookings, ladder play, and member pricing.`;

  const randwijck = randwijckStatusOn();
  const adultJointSaving = jointSavings("adult", { isReturning: true });
  const known = clubs.filter(
    (c) => c.slug === "triaz" || c.slug === "randwijck",
  );

  return (
    <div className="space-y-12">
      {/* 1 — Sales hero (lessons-first; "skip to membership" stays one click away) */}
      <PageHeader
        kicker={`Welcome to ${brandName ?? "us"}`}
        title={headline}
        description={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild tone="triaz" size="lg">
              <Link href="/portal/programs">
                <CompassIcon /> Browse lessons <ArrowRightIcon />
              </Link>
            </Button>
            <Button asChild variant="outline" tone="neutral" size="lg">
              <Link href="/portal/membership#buy">
                Skip — I just want a membership
              </Link>
            </Button>
          </div>
        }
      />

      {/* 2 — Lessons teaser leads the page now */}
      <LessonsTeaser
        hero={recs.hero}
        more={recs.more}
        isParent={isParent}
        showTrialEntry={showTrialEntry}
      />

      {/* 3 — Headline price strip */}
      <PriceAnchorStrip />

      {/* 4 — Two-club tile grid + joint upsell */}
      <Section
        title="Pick your home club"
        description="One membership unlocks bookings at that club. Cover both for a joint discount."
      >
        <div className="space-y-5">
          <ClubTilesGrid clubs={clubs} />
          {known.length === 2 && <JointCrossSell saving={adultJointSaving} />}
        </div>
      </Section>

      {/* 5 — Everything a membership unlocks */}
      <Section
        title="Everything a membership unlocks"
        description="The whole club, online. No phone tag."
      >
        <FeatureGrid brandName={brandName ?? ""} />
      </Section>

      {/* 6 — Family pitch (only show when it's actually relevant) */}
      <FamilyPitch hasAnyChild={hasAnyChild} />

      {/* 7 — Ladder teaser */}
      <LadderTeaser brandName={brandName ?? ""} />

      {/* 8 — Season urgency */}
      <SeasonUrgency
        randwijckOpen={randwijck.isOpen}
        randwijckEvent={
          randwijck.isOpen
            ? `closes ${formatLongDate(addDaysVisual(randwijck.upcoming.endsOn, -1))}`
            : `reopens ${formatLongDate(randwijck.upcoming.startsOn)}`
        }
      />

      {/* 9 — FAQ */}
      <FaqBlock />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 — Price anchor strip
// ---------------------------------------------------------------------------

function PriceAnchorStrip() {
  const items: {
    href: string;
    kicker: string;
    price: number;
    sub: string;
    tone: "triaz" | "randwijck" | "joint";
    highlight?: boolean;
  }[] = [
    {
      href: "/portal/membership?tier=adult#buy",
      kicker: "Adult Triaz",
      price: TRIAZ_FULL_YEAR.adult,
      sub: "Year-round play on grass at Triaz.",
      tone: "triaz",
    },
    {
      href: "/portal/membership?tier=family#buy",
      kicker: "Family Randwijck",
      price: RANDWIJCK_FULL_YEAR.family,
      sub: "Everyone in your household, on the clay.",
      tone: "randwijck",
    },
    {
      href: "/portal/membership?coverage=joint#buy",
      kicker: "Both clubs",
      price: jointFullYear("adult").total,
      sub: `Save ${formatMembershipPrice(jointSavings("adult", { isReturning: true }))} vs. two singles.`,
      tone: "joint",
      highlight: true,
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn(
            "group relative flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]",
            it.highlight && "ring-1 ring-[var(--joint)]/40",
          )}
        >
          {it.highlight && (
            <span className="absolute right-4 top-4">
              <Badge tone="joint" variant="soft">
                Best value
              </Badge>
            </span>
          )}
          <div
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.18em]",
              it.tone === "triaz" && "text-[var(--triaz-ink)]",
              it.tone === "randwijck" && "text-[var(--randwijck-ink)]",
              it.tone === "joint" && "text-[var(--joint-ink)]",
            )}
          >
            {it.kicker}
          </div>
          <div className="tabular font-display text-3xl font-medium leading-none tracking-tight sm:text-4xl">
            From {formatMembershipPrice(it.price)}
            <span className="ml-1 text-sm font-normal text-[var(--muted-foreground)]">
              / year
            </span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">{it.sub}</div>
          <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-[var(--foreground)]">
            See it{" "}
            <ArrowRightIcon
              size={12}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 — Feature grid
// ---------------------------------------------------------------------------

function FeatureGrid({ brandName }: { brandName: string }) {
  const ladderTitle = brandName ? `${brandName} ladder` : "Member ladder";
  const features: {
    icon: React.ReactNode;
    title: string;
    body: string;
  }[] = [
    {
      icon: <CalendarIcon size={18} />,
      title: "Court bookings, online",
      body: "Reserve at your home club from your phone. No phone calls.",
    },
    {
      icon: <ClassIcon size={18} />,
      title: "Adult group lessons",
      body: "Weekly classes for every level — beginner to high intermediate.",
    },
    {
      icon: <TrophyIcon size={18} />,
      title: ladderTitle,
      body: "Adults challenge their way up the club rankings each season.",
    },
    {
      icon: <FamilyIcon size={18} />,
      title: "Cover the family",
      body: "One family membership covers everyone in your household.",
    },
    {
      icon: <ClockIcon size={18} />,
      title: "Year-round play",
      body: "Triaz drains in the rain — the season never really stops.",
    },
    {
      icon: <UsersIcon size={18} />,
      title: "Kids' programs",
      body: "Group lessons, camps, school pickups, high performance.",
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <div
          key={f.title}
          className="flex gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--triaz-soft)] text-[var(--triaz-ink)]">
            {f.icon}
          </div>
          <div className="space-y-1">
            <div className="text-sm font-semibold">{f.title}</div>
            <div className="text-sm text-[var(--muted-foreground)]">
              {f.body}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5 — Lessons teaser
// ---------------------------------------------------------------------------

function LessonsTeaser({
  hero,
  more,
  isParent,
  showTrialEntry,
}: {
  hero: ProgramRec[];
  more: ProgramRec[];
  isParent: boolean;
  showTrialEntry: boolean;
}) {
  const hasAny = hero.length > 0 || more.length > 0;
  return (
    <Section
      title="Lessons & programs"
      description={
        isParent
          ? "Coaching for adults and kids — anyone can sign up. Members get priority enrollment and the best price."
          : "Group classes for every level. Anyone can join — members enroll first and pay less."
      }
      action={
        <Button asChild variant="ghost" tone="neutral" size="sm">
          <Link href="/portal/programs">
            See everything <ArrowRightIcon size={14} />
          </Link>
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="triaz" variant="soft">
            <StarIcon size={12} /> Members enroll first
          </Badge>
          <p className="text-xs text-[var(--muted-foreground)]">
            Lock in a membership and you can book any class below in seconds.
          </p>
        </div>
        {hasAny ? (
          <RecommendedPrograms hero={hero} more={more} isParent={isParent} />
        ) : (
          <Link
            href="/portal/programs"
            className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-sm transition-colors hover:bg-[var(--surface-strong)]"
          >
            <span className="text-[var(--muted-foreground)]">
              Browse the full catalog of group lessons, camps and clinics.
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--foreground)]">
              Open <ArrowRightIcon size={14} />
            </span>
          </Link>
        )}
        {showTrialEntry && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Not sure where to start?{" "}
            <Link
              href="/portal/request-trial"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Request a trial lesson
            </Link>{" "}
            and we&apos;ll match you with the right group.
          </p>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 6 — Family pitch
// ---------------------------------------------------------------------------

function FamilyPitch({ hasAnyChild }: { hasAnyChild: boolean }) {
  return (
    <Section
      title="Bring the family"
      description={
        hasAnyChild
          ? "You've got kids on the account — get them on court too."
          : "Add your kids to the account and unlock youth programs across both clubs."
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[var(--radius-lg)] bg-[var(--randwijck-soft)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--randwijck-ink)]">
                Family membership
              </div>
              <h3 className="font-display text-2xl font-medium tracking-tight">
                {formatMembershipPrice(RANDWIJCK_FULL_YEAR.family)} covers
                everyone at Randwijck.
              </h3>
              <p className="max-w-prose text-sm text-[var(--randwijck-ink)]/80">
                One price for adults, kids, and partners across the whole
                household. Family is a Randwijck-only membership — for Triaz
                play, every adult and youth gets their own tier.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild tone="randwijck">
              <Link href="/portal/membership?tier=family#buy">
                See family options <ArrowRightIcon size={14} />
              </Link>
            </Button>
            {!hasAnyChild && (
              <Button asChild variant="outline" tone="neutral">
                <Link href="/portal/profile">
                  <FamilyIcon size={14} /> Add a child
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-3">
          <KidProgramTile
            title="Group youth lessons"
            body="Weekly after-school sessions at the club."
          />
          <KidProgramTile
            title="Camps & holiday play"
            body="School breaks filled with tennis."
          />
          <KidProgramTile
            title="School pickup"
            body="Coaches collect from AICS, IFS and partner schools."
          />
        </div>
      </div>
    </Section>
  );
}

function KidProgramTile({ title, body }: { title: string; body: string }) {
  return (
    <Link
      href="/portal/programs"
      className="group flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 transition-shadow hover:shadow-[var(--shadow-sm)]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--triaz-soft)] text-[var(--triaz-ink)]">
        <ClassIcon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">{title}</div>
          <ArrowRightIcon
            size={14}
            className="opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
          />
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">{body}</div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// 7 — Ladder teaser
// ---------------------------------------------------------------------------

function LadderTeaser({ brandName }: { brandName: string }) {
  const title = brandName ? `The ${brandName} ladder` : "The ladder";
  return (
    <Section
      title={title}
      description="Once you're an adult member, challenge your way up the club rankings."
    >
      <div className="flex flex-col items-start gap-4 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--joint-soft)] text-[var(--joint-ink)]">
            <TrophyIcon />
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Members only
            </div>
            <h3 className="font-display text-xl font-medium tracking-tight">
              Climb the ladder, win bragging rights.
            </h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Adult members challenge each other every season — singles
              ranking, real matches, real fun.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" tone="neutral">
          <Link href="/portal/ladder">
            How it works <ArrowRightIcon size={14} />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 8 — Season urgency
// ---------------------------------------------------------------------------

function SeasonUrgency({
  randwijckOpen,
  randwijckEvent,
}: {
  randwijckOpen: boolean;
  randwijckEvent: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--triaz-soft)] px-5 py-4 text-sm text-[var(--triaz-ink)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 sm:items-center">
        <CalendarIcon className="mt-0.5 shrink-0 sm:mt-0" />
        <p>
          <span className="font-medium">Triaz plays year-round.</span>{" "}
          <span className="text-[var(--triaz-ink)]/80">
            Randwijck {randwijckOpen ? "is open now and " : ""}
            {randwijckEvent}.
          </span>
        </p>
      </div>
      <Link
        href="/portal/membership#buy"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline"
      >
        Lock yours in <ArrowRightIcon size={12} />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9 — FAQ
// ---------------------------------------------------------------------------

function FaqBlock() {
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "How long does a membership last?",
      a: "365 days from the day you join. Triaz also runs in two seasonal halves if you'd rather pace yourself.",
    },
    {
      q: "Can I add a child later?",
      a: (
        <>
          Anytime. Add them on{" "}
          <Link
            href="/portal/profile"
            className="underline-offset-4 hover:underline"
          >
            your profile
          </Link>{" "}
          and bump up to a family membership when you're ready.
        </>
      ),
    },
    {
      q: "Refunds or cancellations?",
      a: "Talk to the office — we handle changes case by case. Self-serve renewals via Mollie are on the way.",
    },
    {
      q: "What about lessons?",
      a: (
        <>
          Members enroll directly through the portal. Take a look at{" "}
          <Link
            href="/portal/programs"
            className="underline-offset-4 hover:underline"
          >
            what we run
          </Link>{" "}
          before you commit.
        </>
      ),
    },
  ];
  return (
    <Section title="Quick answers" description="The questions we hear most.">
      <div className="grid gap-4 sm:grid-cols-2">
        {faqs.map((f) => (
          <div
            key={f.q}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <div className="mb-1 flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[var(--muted-foreground)]">
                <CheckIcon size={12} />
              </span>
              <div className="text-sm font-semibold">{f.q}</div>
            </div>
            <div className="pl-7 text-sm text-[var(--muted-foreground)]">
              {f.a}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] px-5 py-4 text-sm">
        <CardIcon className="text-[var(--muted-foreground)]" />
        <span className="text-[var(--muted-foreground)]">
          Got a question we didn't cover? Talk to the office.
        </span>
        <Button asChild tone="triaz" size="sm" className="ml-auto">
          <Link href="/portal/membership#buy">
            Get a membership <ArrowRightIcon size={14} />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 6) return "Up early";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function addDaysVisual(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
