import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRightIcon,
  CalendarIcon,
  ClassIcon,
  FamilyIcon,
  UsersIcon,
  ClockIcon,
  CheckIcon,
  CompassIcon,
  CardIcon,
  MembershipIcon,
  InboxIcon,
  TicketIcon,
} from "@/components/icons";
import { MobileQuickActions } from "./mobile-quick-actions";
import { GroupedSection } from "@/components/ui/grouped-list";
import {
  ClubTilesGrid,
  JointCrossSell,
  type MembershipPitchClub,
} from "./membership-pitch";
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

/**
 * The portal home for households with NO active membership.
 *
 * Leads with quick actions (lessons, classes, membership, trial, inbox),
 * then pricing, club tiles, and supporting membership content below.
 */
export function NonMemberHome({
  firstName,
  isParent,
  hasAnyChild,
  clubs,
  brandName,
  showTrialEntry = true,
  marketingImages = {},
}: {
  firstName: string | null;
  isParent: boolean;
  /** True when the household roster already has any child member. */
  hasAnyChild: boolean;
  clubs: MembershipPitchClub[];
  marketingImages?: Record<string, string>;
  /** Active tenant brand name, used in the welcome kicker. Defaults to a
   *  generic label so callers that haven't been updated still render. */
  brandName?: string;
  showTrialEntry?: boolean;
}) {
  const greeting = greetingWord();
  const headline = isParent
    ? "Find a lesson for the family. Membership when you're ready."
    : "Find a lesson. Become a member when you're ready.";

  const randwijck = randwijckStatusOn();
  const adultJointSaving = jointSavings("adult", { isReturning: true });
  const known = clubs.filter(
    (c) => c.slug === "triaz" || c.slug === "randwijck",
  );

  const mobileQuickActions = [
    {
      href: "/portal/programs",
      label: "Browse lessons",
      icon: <CompassIcon size={20} />,
      emphasis: true,
    },
    {
      href: "/portal/classes",
      label: "Classes",
      icon: <ClassIcon size={20} />,
    },
    {
      href: "/portal/membership#buy",
      label: "Get membership",
      icon: <MembershipIcon size={20} />,
    },
    ...(showTrialEntry
      ? [
          {
            href: "/portal/request-trial",
            label: "Request trial",
            icon: <TicketIcon size={20} />,
          },
        ]
      : []),
    {
      href: "/portal/inbox",
      label: "Inbox",
      icon: <InboxIcon size={20} />,
    },
  ];

  return (
    <div className="space-y-6 md:space-y-10">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="kicker-pill text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--triaz-ink)]">
            Welcome to {brandName ?? "us"}
          </div>
          <h1 className="font-display text-2xl font-medium leading-tight tracking-[-0.02em] md:text-3xl">
            {headline}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {greeting}
            {firstName ? `, ${firstName}` : ""}. Tap below to get started.
          </p>
        </div>
        <MobileQuickActions items={mobileQuickActions} alwaysVisible header={false} />
      </div>

      {/* Headline price strip (includes season urgency footer) */}
      <PriceAnchorStrip
        randwijckOpen={randwijck.isOpen}
        randwijckEvent={
          randwijck.isOpen
            ? `closes ${formatLongDate(addDaysVisual(randwijck.upcoming.endsOn, -1))}`
            : `reopens ${formatLongDate(randwijck.upcoming.startsOn)}`
        }
      />

      {/* 4 — Two-club tile grid + joint upsell */}
      <Section
        title="Pick your home club"
        description="One membership unlocks bookings at that club. Cover both for a joint discount."
      >
        <div className="space-y-5">
          {known.length === 2 && <JointCrossSell saving={adultJointSaving} />}
          <ClubTilesGrid clubs={clubs} marketingImages={marketingImages} />
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
      {/* 8 — FAQ (collapsed by default) */}
      <FaqBlock />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 — Price anchor strip
// ---------------------------------------------------------------------------

function PriceAnchorStrip({
  randwijckOpen,
  randwijckEvent,
}: {
  randwijckOpen: boolean;
  randwijckEvent: string;
}) {
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
    <div className="space-y-3">
      <div className="grid gap-px bg-[var(--content-separator)] md:grid-cols-3 md:gap-3 md:bg-transparent">
        {items.map((it) => (
          <div
            key={it.href}
            className={cn(
              "group relative flex flex-col gap-2 bg-[var(--content-grouped-inset)] p-5 md:elev-card md:transition-shadow md:hover:shadow-[var(--shadow-floating)]",
              it.highlight && "md:ring-1 md:ring-[var(--joint)]/40",
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
                "text-sm font-medium",
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
            <Button
              asChild
              variant="outline"
              tone={it.tone === "joint" ? "neutral" : it.tone}
              size="sm"
              className="mt-2 w-fit"
            >
              <Link href={it.href}>
                See pricing <ArrowRightIcon size={14} />
              </Link>
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--triaz-soft)] px-4 py-3 text-xs text-[var(--triaz-ink)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-medium">Triaz plays year-round.</span>{" "}
          <span className="text-[var(--triaz-ink)]/80">
            Randwijck {randwijckOpen ? "is open now and " : ""}
            {randwijckEvent}.
          </span>
        </p>
        <Link
          href="/portal/membership#buy"
          className="inline-flex shrink-0 items-center gap-1 font-semibold underline-offset-4 hover:underline"
        >
          Lock yours in <ArrowRightIcon size={12} />
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 — Feature grid
// ---------------------------------------------------------------------------

function FeatureGrid({ brandName: _brandName }: { brandName: string }) {
  const features = FEATURE_ITEMS;
  return (
    <>
      <GroupedSection header="What membership unlocks" className="md:hidden">
        <li className="grouped-row p-0">
          <div className="grid w-full grid-cols-1 divide-y divide-[var(--content-separator)]">
            {features.map((f) => (
              <div key={f.title} className="flex gap-3 px-4 py-3">
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
        </li>
      </GroupedSection>
      <div className="hidden md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
    </>
  );
}

const FEATURE_ITEMS: {
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
    icon: <UsersIcon size={18} />,
    title: "Kids' programs",
    body: "Group lessons, camps, school pickups, high performance.",
  },
  {
    icon: <ClockIcon size={18} />,
    title: "Year-round play",
    body: "Triaz drains in the rain — the season never really stops.",
  },
  {
    icon: <FamilyIcon size={18} />,
    title: "Cover the family",
    body: "One family membership covers everyone in your household.",
  },
];

// ---------------------------------------------------------------------------
// Family pitch
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
        <div className="elev-card border border-[var(--randwijck)]/20 bg-[var(--randwijck-soft)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--randwijck-ink)]">
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
                <Link href="/portal/family?addChild=1">
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
      className="group flex min-h-[2.75rem] w-full items-start gap-3 px-4 py-3 no-underline active:bg-[var(--muted)]/30 md:elev-card md:p-4 md:transition-shadow md:hover:shadow-[var(--shadow-floating)]"
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
            href="/portal/family?addChild=1"
            className="underline-offset-4 hover:underline"
          >
            your family page
          </Link>{" "}
          and bump up to a family membership when you're ready.
        </>
      ),
    },
    {
      q: "Refunds or cancellations?",
      a: (
        <>
          Renew or buy coverage on{" "}
          <Link
            href="/portal/membership#buy"
            className="underline-offset-4 hover:underline"
          >
            My membership
          </Link>
          . Receipts and credits sit under{" "}
          <Link
            href="/portal/payments"
            className="underline-offset-4 hover:underline"
          >
            Payments
          </Link>
          . Rain or holiday changes show in{" "}
          <Link
            href="/portal/inbox"
            className="underline-offset-4 hover:underline"
          >
            your inbox
          </Link>
          .
        </>
      ),
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
          before you commit — or browse{" "}
          <Link
            href="/get-started"
            className="underline-offset-4 hover:underline"
          >
            start here
          </Link>{" "}
          if you are not signed in yet.
        </>
      ),
    },
  ];
  return (
    <details className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
      <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Quick answers</div>
            <div className="text-xs text-[var(--muted-foreground)]">
              The questions we hear most — tap to expand
            </div>
          </div>
          <ArrowRightIcon
            size={16}
            className="shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-90"
          />
        </div>
      </summary>
      <div className="space-y-4 border-t border-[var(--border)] px-5 pb-5 pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {faqs.map((f) => (
            <div
              key={f.q}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4"
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
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 text-sm">
          <CardIcon className="text-[var(--muted-foreground)]" />
          <span className="text-[var(--muted-foreground)]">
            Browsing before you sign in? See{" "}
            <Link href="/get-started" className="underline-offset-4 hover:underline">
              start here
            </Link>
            .
          </span>
          <Button asChild tone="triaz" size="sm" className="ml-auto">
            <Link href="/portal/membership#buy">
              Get a membership <ArrowRightIcon size={14} />
            </Link>
          </Button>
        </div>
      </div>
    </details>
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
