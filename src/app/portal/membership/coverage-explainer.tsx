import {
  formatMembershipPrice,
  jointFullYear,
  jointSavings,
  KEY_DEPOSIT_EUR,
  RANDWIJCK_BUNDLES,
  RANDWIJCK_FULL_YEAR,
  RANDWIJCK_PRORATED_BY_MONTH,
  TRIAZ_FULL_YEAR,
  TRIAZ_QUARTER_FRACTION,
  TRIAZ_QUARTER_LABEL,
  type MembershipTier,
  type TriazQuarter,
} from "@/lib/pricing";
import { clubTheme } from "@/lib/club-theme";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatLongDate,
  randwijckStatusOn,
  SEASON_CONFIG,
} from "@/lib/membership-seasons";
import { SeasonStrip } from "./season-strip";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function randwijckSeasonLabel(): string {
  const { opensOn, closesOn } = SEASON_CONFIG.randwijck;
  return `${MONTH_NAMES[opensOn.month - 1]} ${opensOn.day} – ${MONTH_NAMES[closesOn.month - 1]} ${closesOn.day}`;
}

/**
 * Pricing matrix + how memberships map to each club (courts, hours, booking).
 */
export function CoverageExplainer() {
  const triaz = clubTheme("triaz");
  const randwijck = clubTheme("randwijck");
  const joint = clubTheme("joint");
  const randwijckSeason = randwijckStatusOn();

  const rows: { tier: MembershipTier; label: string }[] = [
    { tier: "adult", label: "Adult" },
    { tier: "child", label: "Youth (under 18)" },
    { tier: "family", label: "Family" },
  ];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Tier · full year
              </th>
              <th
                className={cn(
                  "px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em]",
                  triaz.accentText,
                )}
              >
                Triaz only
              </th>
              <th
                className={cn(
                  "px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em]",
                  randwijck.accentText,
                )}
              >
                Randwijck only
              </th>
              <th
                className={cn(
                  "px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em]",
                  joint.accentText,
                )}
              >
                Both clubs
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const triazPrice =
                row.tier === "family" ? null : TRIAZ_FULL_YEAR[row.tier];
              const randwijckPrice = RANDWIJCK_FULL_YEAR[row.tier];
              const both =
                row.tier === "family"
                  ? null
                  : jointFullYear(row.tier).total;
              const savings =
                row.tier === "family" ? 0 : jointSavings(row.tier, { isReturning: true });
              return (
                <tr
                  key={row.tier}
                  className="border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-strong)]"
                >
                  <td className="px-5 py-4 font-medium">{row.label}</td>
                  <td className="tabular px-5 py-4 text-right font-medium">
                    {triazPrice == null ? (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    ) : (
                      formatMembershipPrice(triazPrice)
                    )}
                  </td>
                  <td className="tabular px-5 py-4 text-right font-medium">
                    {formatMembershipPrice(randwijckPrice)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {both == null ? (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    ) : (
                      <>
                        <span className="tabular font-display text-base font-medium">
                          {formatMembershipPrice(both)}
                        </span>
                        {savings > 0 && (
                          <Badge tone="success" className="ml-2 align-middle">
                            Save {formatMembershipPrice(savings)}
                          </Badge>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 text-sm text-[var(--muted-foreground)] sm:grid-cols-2">
        <li className="rounded-[var(--radius-md)] bg-[var(--surface)] p-4">
          <strong className="block text-[var(--foreground)]">Family</strong>
          covers every adult and child in your household and is sold for
          Randwijck only — pick Adult or Youth for Triaz.
        </li>
        <li className="rounded-[var(--radius-md)] bg-[var(--surface)] p-4">
          <strong className="block text-[var(--foreground)]">
            Joint coverage
          </strong>
          covers both clubs on one membership — Triaz lands its full portion
          and Randwijck absorbs the joint discount.
        </li>
        <li className="rounded-[var(--radius-md)] bg-[var(--surface)] p-4">
          <strong className="block text-[var(--foreground)]">
            New members prorate
          </strong>
          to their join date — Triaz by quarter, Randwijck by month. See the
          tables below for what you'd actually pay this month.
        </li>
        <li className="rounded-[var(--radius-md)] bg-[var(--surface)] p-4">
          <strong className="block text-[var(--foreground)]">
            Returning members pay full year
          </strong>
          — proration only applies to brand-new joiners. Office-managed
          renewals default to the full annual rate above.
        </li>
      </ul>

      <ProrationTables />

      <KeyDepositCallout />

      <div className="grid gap-4 lg:grid-cols-2">
        <ClubInfoCard
          slug="triaz"
          title="Triaz"
          seasonPill="Year-round"
          seasonPillTone="triaz"
          stats={[
            { label: "Court hours", value: "09:00 – 22:00" },
            { label: "Bookings / day", value: "1 per person" },
            { label: "Cancel window", value: "10 minutes before" },
            { label: "Court fees", value: "Free with membership" },
          ]}
          courts={[
            { name: "Court 1", note: "Multi-use · walk-on only (not reservable)" },
            { name: "Court 2", note: "Multi-use · practice court" },
            { name: "Court 3", note: "Grass · KNLTB-certified" },
            { name: "Court 4", note: "Grass · KNLTB-certified" },
          ]}
          unlocks={[
            "Book courts at no charge (subject to availability and your daily quota).",
            "Book up to 7 days ahead, on the hour, 60-minute slots.",
            "Join group lessons, camps, and programs at Triaz.",
            "Year-round play — Triaz never closes for winter.",
            "Tue & Wed evenings share the venue with the korfball club; some courts may be blocked then.",
          ]}
        />
        <ClubInfoCard
          slug="randwijck"
          title="Randwijck"
          seasonPill={
            randwijckSeason.isOpen
              ? `Open now · ${randwijckSeasonLabel()}`
              : `Reopens ${formatLongDate(randwijckSeason.upcoming.startsOn)}`
          }
          seasonPillTone={randwijckSeason.isOpen ? "randwijck" : "neutral"}
          randwijckSeason={randwijckSeason}
          stats={[
            { label: "Court hours", value: "08:00 – 22:00" },
            { label: "Bookings / day", value: "2 per person" },
            { label: "Cancel window", value: "48 hours before start" },
            { label: "Court fees", value: "Paid per booking (Mollie)" },
          ]}
          courts={[
            { name: "B. Borg", note: "Clay · premium · KNLTB-certified · maintained daily" },
            { name: "J. Mcenroe", note: "Clay · premium · KNLTB-certified · maintained daily" },
          ]}
          unlocks={[
            "Book clay courts as a member (each booking is charged per hour).",
            "Book up to 7 days ahead, on the hour, 60-minute slots.",
            "Join lessons and camps hosted at Randwijck.",
            "Request season-long recurring court rentals (office approval + invoice).",
            "Stricter cancellation: at least two days before your slot.",
          ]}
        />
      </div>
    </div>
  );
}

function ProrationTables() {
  const triaz = clubTheme("triaz");
  const randwijck = clubTheme("randwijck");
  const quarters: TriazQuarter[] = [
    "q1_apr_jun",
    "q2_jul_sep",
    "q3_oct_dec",
    "q4_jan_mar",
  ];
  const months = [4, 5, 6, 7, 8, 9, 10] as const;
  const adultRandwijckFull = RANDWIJCK_FULL_YEAR.adult;
  const childRandwijckFull = RANDWIJCK_FULL_YEAR.child;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
          <div>
            <div
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.18em]",
                triaz.accentText,
              )}
            >
              Triaz · prorated by quarter
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              New joiners only. Returning members pay the full annual rate.
            </div>
          </div>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              <th className="px-5 py-2 font-semibold">Quarter</th>
              <th className="px-5 py-2 text-right font-semibold">Adult</th>
              <th className="px-5 py-2 text-right font-semibold">Youth</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => {
              const fraction = TRIAZ_QUARTER_FRACTION[q];
              const adult = TRIAZ_FULL_YEAR.adult * fraction;
              const child = TRIAZ_FULL_YEAR.child * fraction;
              return (
                <tr key={q} className="border-t border-[var(--border)]">
                  <td className="px-5 py-2.5 font-medium">
                    {TRIAZ_QUARTER_LABEL[q]}
                  </td>
                  <td className="tabular px-5 py-2.5 text-right">
                    {formatMembershipPrice(round2(adult))}
                  </td>
                  <td className="tabular px-5 py-2.5 text-right">
                    {formatMembershipPrice(round2(child))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
          <div>
            <div
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.18em]",
                randwijck.accentText,
              )}
            >
              Randwijck · prorated by month
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              Apr & May join the full season.
            </div>
          </div>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              <th className="px-5 py-2 font-semibold">Month of join</th>
              <th className="px-5 py-2 text-right font-semibold">Adult</th>
              <th className="px-5 py-2 text-right font-semibold">Youth</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const adult =
                RANDWIJCK_PRORATED_BY_MONTH.adult[m] ?? adultRandwijckFull;
              const child =
                RANDWIJCK_PRORATED_BY_MONTH.child[m] ?? childRandwijckFull;
              return (
                <tr key={m} className="border-t border-[var(--border)]">
                  <td className="px-5 py-2.5 font-medium">{MONTH_NAMES[m - 1]}</td>
                  <td className="tabular px-5 py-2.5 text-right">
                    {formatMembershipPrice(adult)}
                  </td>
                  <td className="tabular px-5 py-2.5 text-right">
                    {formatMembershipPrice(child)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-[var(--border)] bg-[var(--surface-strong)] px-5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Or pick a flat-rate seasonal pass · adult
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {RANDWIJCK_BUNDLES.map((b) => (
              <li
                key={b.id}
                className="flex items-baseline justify-between gap-2"
              >
                <span>{b.label}</span>
                <span className="tabular font-medium">
                  {formatMembershipPrice(b.amountEur)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function KeyDepositCallout() {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
      <strong className="text-[var(--foreground)]">
        Adult Triaz · €{KEY_DEPOSIT_EUR} key deposit
      </strong>{" "}
      We list the gate-key deposit on every adult Triaz membership for
      transparency, but it's <strong>not billed</strong> right now — the
      gate hardware isn't connected yet. Youth Triaz members can buy a key
      from the office for €{KEY_DEPOSIT_EUR} on request.
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ClubInfoCard({
  slug,
  title,
  seasonPill,
  seasonPillTone,
  randwijckSeason,
  stats,
  courts,
  unlocks,
}: {
  slug: "triaz" | "randwijck";
  title: string;
  seasonPill: string;
  seasonPillTone: "triaz" | "randwijck" | "neutral";
  randwijckSeason?: ReturnType<typeof randwijckStatusOn>;
  stats: { label: string; value: string }[];
  courts: { name: string; note: string }[];
  unlocks: string[];
}) {
  const theme = clubTheme(slug);
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]",
        theme.bg,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className={cn("font-display text-xl font-medium tracking-tight", theme.accentText)}>
          {title}
        </h3>
        <Badge
          tone={seasonPillTone}
          variant="soft"
          className="max-w-[min(100%,14rem)] text-center leading-snug"
        >
          {seasonPill}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-[var(--radius-sm)] bg-[var(--card)] px-3 py-2 shadow-[var(--shadow-sm)]"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              {s.label}
            </div>
            <div className="mt-0.5 tabular font-medium text-[var(--foreground)]">{s.value}</div>
          </div>
        ))}
      </div>

      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Courts
        </h4>
        <ul className="mt-2 space-y-2">
          {courts.map((c) => (
            <li
              key={c.name}
              className="flex gap-2 rounded-[var(--radius-sm)] bg-[var(--card)] px-3 py-2 text-sm shadow-[var(--shadow-sm)]"
            >
              <span className={cn("font-semibold tabular", theme.accentText)}>{c.name}</span>
              <span className="text-[var(--muted-foreground)]">{c.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          What your membership unlocks here
        </h4>
        <ul className={cn("mt-2 list-inside list-disc space-y-1.5 text-sm", theme.mutedText)}>
          {unlocks.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Season at a glance
        </h4>
        <div className="mt-2 rounded-[var(--radius-md)] bg-[var(--card)] p-3">
          <SeasonStrip slug={slug} />
        </div>
        {slug === "randwijck" && randwijckSeason && !randwijckSeason.isOpen && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Randwijck memberships follow the clay season — when the club is closed,
            Randwijck-only and joint options are hidden from the buy menu until we reopen.
          </p>
        )}
      </section>
    </article>
  );
}
