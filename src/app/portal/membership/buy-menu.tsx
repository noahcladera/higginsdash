"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  availabilityFor,
  availableRandwijckBundlesFor,
  effectivePriceFor,
  formatMembershipPrice,
  jointSavings,
  keyDepositLine,
  type CellAvailability,
  type HouseholdOwnership,
  type ClubSlug,
  type MembershipTier,
  type RandwijckBundleId,
} from "@/lib/pricing";
import { clubTheme, type ClubTheme } from "@/lib/club-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startCheckout as beginCheckout } from "@/lib/payments/start-checkout";
import { getMollieAccountForMembership } from "@/lib/payments/mollie-accounts";

/**
 * sessionStorage key used to chain the Randwijck step of a joint
 * membership purchase. After the user completes the Triaz Mollie page,
 * the demo flow returns them to /portal/membership; the BuyMenu mount
 * effect notices this key and auto-fires the second `startDemoCheckout`
 * for the Randwijck portion. Kept in sync with the confirm-checkout
 * client component (which also reads this key on /portal/membership/confirm
 * for the rare case where a user navigates back to confirm directly).
 */
const PENDING_JOINT_STEP_KEY = "demo_membership_joint_step";

interface PendingJointStep {
  tier: "adult" | "child";
  assignedPersonId?: string;
  randwijckPortion: number;
  description: string;
  returnUrl: string;
}

/**
 * Buy menu for memberships.
 *
 * Each tier row routes to `/portal/membership/confirm` (the new
 * "what this membership unlocks" middle page) with the chosen tier,
 * clubs, and (for child rows) selected `assignedPersonId` in the query
 * string. The confirm page renders the price breakdown + benefits and
 * fires the actual checkout when the buyer hits "Confirm and pay".
 *
 * Pricing displayed here is the catalog price for the household given
 * `isReturning` and today's date — the server action recomputes it when
 * the buyer actually checks out, so a stale tab can't get a discount.
 */

export interface BuyMenuProps {
  collapsedByDefault?: boolean;
  randwijckOpen: boolean;
  randwijckReopensLabel: string;
  ownership: HouseholdOwnership;
  /** True when the household has any prior `Membership` row. Returning members never prorate. */
  isReturning: boolean;
}

const TIERS: { tier: MembershipTier; label: string; sub: string }[] = [
  { tier: "adult", label: "Adult", sub: "One adult, one year." },
  { tier: "child", label: "Youth", sub: "One child under 18, one year." },
  { tier: "family", label: "Family", sub: "Everyone in your household." },
];

const COLUMNS: {
  theme: ClubTheme;
  clubs: ClubSlug[];
  title: string;
  subtitle: string;
  highlight?: boolean;
}[] = [
  {
    theme: "triaz",
    clubs: ["triaz"],
    title: "Triaz only",
    subtitle: "Multi-use grass courts, our home club.",
  },
  {
    theme: "randwijck",
    clubs: ["randwijck"],
    title: "Randwijck only",
    subtitle: "Clay courts, leased weekday access.",
  },
  {
    theme: "joint",
    clubs: ["triaz", "randwijck"],
    title: "Both clubs",
    subtitle: "One membership, both clubs. Best value.",
    highlight: true,
  },
];

export function BuyMenu({
  collapsedByDefault = false,
  randwijckOpen,
  randwijckReopensLabel,
  ownership,
  isReturning,
}: BuyMenuProps) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const router = useRouter();

  // Auto-chain the Randwijck Mollie page after the user returns from
  // completing the Triaz one. Fires once per browser tab per joint
  // purchase — the sessionStorage key is cleared the moment we kick
  // off the second checkout so a refresh doesn't re-trigger it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(PENDING_JOINT_STEP_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_JOINT_STEP_KEY);
    let pending: PendingJointStep;
    try {
      pending = JSON.parse(raw) as PendingJointStep;
    } catch {
      return;
    }
    void beginCheckout(
      {
        amountEur: pending.randwijckPortion,
        description: pending.description,
        returnUrl: pending.returnUrl,
        mollieAccount: getMollieAccountForMembership({ clubSlug: "randwijck" }),
        action: {
          kind: "membership_create",
          payload: {
            tier: pending.tier,
            clubs: ["triaz", "randwijck"],
            assignedPersonId: pending.assignedPersonId,
            step: "randwijck",
          },
        },
      },
      router,
    );
  }, [router]);

  return (
    <div className="space-y-4">
      {collapsedByDefault && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            tone="neutral"
            size="sm"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide options" : "Show options"}
          </Button>
        </div>
      )}

      {!randwijckOpen && open && (
        <div className="rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[oklch(0.30_0.10_75)]">
          <strong className="font-semibold">
            Randwijck is closed for the season.
          </strong>{" "}
          The clay courts reopen on {randwijckReopensLabel}. Triaz
          memberships are still available year-round.
        </div>
      )}

      {open && (
        <>
          {!isReturning && (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
              <strong className="font-semibold text-[var(--foreground)]">
                New member?
              </strong>{" "}
              Prices below already reflect the current join window — Triaz
              prorates by quarter and Randwijck by month, so you only pay for
              the time ahead of you.
            </div>
          )}
          {isReturning && (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
              <strong className="font-semibold text-[var(--foreground)]">
                Returning member.
              </strong>{" "}
              Returning members pay the full annual rate regardless of join
              month — no proration applies.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {COLUMNS.map((col) => {
              const includesRandwijck = col.clubs.includes("randwijck");
              const disabled = includesRandwijck && !randwijckOpen;
              return (
                <ClubColumn
                  key={col.theme}
                  theme={col.theme}
                  clubs={col.clubs}
                  title={col.title}
                  subtitle={col.subtitle}
                  highlight={col.highlight && !disabled}
                  disabled={disabled}
                  disabledReason={
                    disabled
                      ? `Randwijck reopens ${randwijckReopensLabel}.`
                      : undefined
                  }
                  ownership={ownership}
                  isReturning={isReturning}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ClubColumn({
  theme,
  clubs,
  title,
  subtitle,
  highlight,
  disabled,
  disabledReason,
  ownership,
  isReturning,
}: {
  theme: ClubTheme;
  clubs: ClubSlug[];
  title: string;
  subtitle: string;
  highlight?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  ownership: HouseholdOwnership;
  isReturning: boolean;
}) {
  const styles = clubTheme(theme);
  const isRandwijckOnly = clubs.length === 1 && clubs[0] === "randwijck";
  const bundles = isRandwijckOnly && !disabled
    ? availableRandwijckBundlesFor({ tier: "adult" })
    : [];

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-[var(--radius-lg)] p-5 transition-shadow",
        styles.bg,
        highlight && "shadow-[var(--shadow-md)] ring-2 " + styles.ring,
        !highlight && "shadow-[var(--shadow-sm)]",
        disabled && "opacity-60",
      )}
    >
      {highlight && (
        <Badge
          tone="joint"
          variant="solid"
          className="absolute -top-2.5 left-4"
        >
          Best value
        </Badge>
      )}
      {disabled && (
        <Badge
          tone="warning"
          variant="solid"
          className="absolute -top-2.5 right-4"
        >
          Out of season
        </Badge>
      )}
      <div className="space-y-1">
        <h3
          className={cn(
            "font-display text-xl font-medium tracking-tight",
            styles.accentText,
          )}
        >
          {title}
        </h3>
        <p className={cn("text-sm", styles.mutedText)}>{subtitle}</p>
      </div>

      <div className="space-y-2">
        {TIERS.map((row) => {
          const familyBlocked = row.tier === "family" && clubs.includes("triaz");
          if (familyBlocked) {
            return (
              <FamilyBlockedRow
                key={row.tier}
                label={row.label}
                sub={row.sub}
                theme={theme}
              />
            );
          }
          return (
            <TierRow
              key={row.tier}
              tier={row.tier}
              label={row.label}
              sub={row.sub}
              clubs={clubs}
              theme={theme}
              disabled={disabled}
              column={clubs.length === 2 ? "both" : clubs[0]}
              ownership={ownership}
              isReturning={isReturning}
            />
          );
        })}
      </div>

      {bundles.length > 0 && (
        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h4
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.18em]",
                styles.mutedText,
              )}
            >
              Or pick a seasonal pass
            </h4>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Adult only
            </Badge>
          </div>
          <p className={cn("text-xs", styles.mutedText)}>
            Flat-rate alternatives to the prorated single — pick whichever
            costs less for your join date.
          </p>
          {bundles.map((b) => (
            <BundleRow
              key={b.id}
              bundleId={b.id}
              label={b.label}
              amountEur={b.amountEur}
              description={b.description}
              theme={theme}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {disabled && disabledReason && (
        <p className="text-xs text-[oklch(0.30_0.10_75)]">{disabledReason}</p>
      )}

      {!disabled && clubs.length === 2 && (
        <p className={cn("text-xs", styles.mutedText)}>
          Joint memberships save up to{" "}
          {formatMembershipPrice(jointSavings("adult", { isReturning }))} vs
          two single-club memberships.
        </p>
      )}
    </div>
  );
}

function TierRow({
  tier,
  label,
  sub,
  clubs,
  theme,
  disabled,
  column,
  ownership,
  isReturning,
}: {
  tier: MembershipTier;
  label: string;
  sub: string;
  clubs: ClubSlug[];
  theme: ClubTheme;
  disabled?: boolean;
  column: "triaz" | "randwijck" | "both";
  ownership: HouseholdOwnership;
  isReturning: boolean;
}) {
  const styles = clubTheme(theme);
  const availability = availabilityFor(tier, column, ownership);
  const price = effectivePriceFor(tier, column, ownership, { isReturning });
  const keyDeposit = keyDepositLine({
    tier,
    clubs,
    isReturning,
  });

  const [error] = useState<string | null>(null);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [childPickerClubs, setChildPickerClubs] = useState<ClubSlug[]>(clubs);
  const [childPickerUnlocked, setChildPickerUnlocked] = useState<
    Extract<CellAvailability, { kind: "unlocked" }> | null
  >(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const pickerId = useId();

  const householdChildren = ownership.householdMembers.filter((m) => !m.isAdult);

  useEffect(() => {
    if (!childPickerOpen || tier !== "child") return;
    const first = childPickerUnlocked?.eligibleAssignees?.[0]?.personId ?? null;
    setSelectedChildId(first);
  }, [childPickerOpen, tier, childPickerUnlocked?.eligibleAssignees]);

  useEffect(() => {
    if (!childPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChildPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [childPickerOpen]);

  function openChildPicker(clubsForPurchase: ClubSlug[]) {
    setChildPickerClubs(clubsForPurchase);
    const pickerColumn = columnKeyForClubs(clubsForPurchase);
    const a = availabilityFor("child", pickerColumn, ownership);
    setChildPickerUnlocked(a.kind === "unlocked" ? a : null);
    setChildPickerOpen(true);
  }

  function buildConfirmHref(args: {
    purchaseClubs: ClubSlug[];
    assignedPersonId?: string | null;
  }): string {
    const params = new URLSearchParams();
    params.set("tier", tier);
    params.set("clubs", args.purchaseClubs.join(","));
    if (args.assignedPersonId) params.set("assignedPersonId", args.assignedPersonId);
    return `/portal/membership/confirm?${params.toString()}`;
  }

  const disabledByState =
    availability.kind === "owned_by_self" || availability.kind === "absorbed_by_family";
  const actionDisabled = disabled || disabledByState;

  if (tier === "child") {
    const partial = availability.kind === "both_clubs_partial";
    const canOpenPicker =
      !disabled &&
      !disabledByState &&
      (availability.kind === "unlocked" || partial);

    return (
      <div className="relative rounded-[var(--radius-md)] bg-[var(--card)] p-3.5 shadow-[var(--shadow-sm)]">
        {childPickerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/20"
            aria-hidden
            onClick={() => setChildPickerOpen(false)}
          />
        )}
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className={cn("text-sm font-semibold", styles.accentText)}>
              {label}
            </div>
            <div className={cn("text-[11px]", styles.mutedText)}>{sub}</div>
          </div>
          <div className="tabular font-display text-xl font-medium tracking-tight">
            {formatMembershipPrice(price.amountEur)}
          </div>
        </div>

        {partial ? (
          <Button
            type="button"
            onClick={() => openChildPicker([availability.missingClub])}
            disabled={!canOpenPicker}
            tone={theme === "joint" ? "joint" : theme}
            size="sm"
            className="mt-3 w-full"
          >
            Add {availability.missingClub === "triaz" ? "Triaz" : "Randwijck"} for{" "}
            {formatMembershipPrice(price.amountEur)}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => canOpenPicker && openChildPicker(clubs)}
            disabled={!canOpenPicker}
            tone={theme === "joint" ? "joint" : theme}
            size="sm"
            className="mt-3 w-full"
          >
            {disabled
              ? "Out of season"
              : availability.kind === "owned_by_self"
                ? "You already have this"
                : availability.kind === "absorbed_by_family"
                  ? "Covered by Family membership"
                  : "Get youth membership"}
          </Button>
        )}

        {price.kind === "marginal" && !partial && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">Joint price applied.</p>
        )}

        {childPickerOpen && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-md)]"
            role="dialog"
            aria-labelledby={`${pickerId}-title`}
          >
            <ChildPickerBody
              pickerId={pickerId}
              householdChildren={householdChildren}
              unlocked={childPickerUnlocked}
              selectedChildId={selectedChildId}
              onSelectChild={setSelectedChildId}
              confirmHref={
                selectedChildId
                  ? buildConfirmHref({
                      purchaseClubs: childPickerClubs,
                      assignedPersonId: selectedChildId,
                    })
                  : null
              }
              onClose={() => setChildPickerOpen(false)}
              clubsLabel={childPickerClubs.map(clubLabelFor).join(" + ")}
            />
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs text-[var(--destructive)]">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--card)] p-3.5 shadow-[var(--shadow-sm)]">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className={cn("text-sm font-semibold", styles.accentText)}>
            {label}
          </div>
          <div className={cn("text-[11px]", styles.mutedText)}>{sub}</div>
        </div>
        <div className="tabular font-display text-xl font-medium tracking-tight">
          {formatMembershipPrice(price.amountEur)}
        </div>
      </div>
      {keyDeposit && (
        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          + {formatMembershipPrice(keyDeposit.notional)} key deposit{" "}
          {keyDeposit.billed ? "" : "(not billed yet — gate not connected)"}
        </p>
      )}
      {availability.kind === "both_clubs_partial" ? (
        <Button
          asChild={!actionDisabled}
          type="button"
          disabled={actionDisabled}
          tone={theme === "joint" ? "joint" : theme}
          size="sm"
          className="mt-3 w-full"
        >
          {actionDisabled ? (
            <span>
              Add {availability.missingClub === "triaz" ? "Triaz" : "Randwijck"}
            </span>
          ) : (
            <Link
              href={buildConfirmHref({
                purchaseClubs: [availability.missingClub],
              })}
            >
              Add {availability.missingClub === "triaz" ? "Triaz" : "Randwijck"} for{" "}
              {formatMembershipPrice(price.amountEur)}
            </Link>
          )}
        </Button>
      ) : (
        <Button
          asChild={!actionDisabled}
          type="button"
          disabled={actionDisabled}
          tone={theme === "joint" ? "joint" : theme}
          size="sm"
          className="mt-3 w-full"
        >
          {actionDisabled ? (
            <span>
              {disabled
                ? "Out of season"
                : availability.kind === "owned_by_self"
                  ? "You already have this"
                  : availability.kind === "absorbed_by_family"
                    ? "Covered by Family membership"
                    : `Get ${label.toLowerCase()} membership`}
            </span>
          ) : (
            <Link href={buildConfirmHref({ purchaseClubs: clubs })}>
              Get {label.toLowerCase()} membership
            </Link>
          )}
        </Button>
      )}
      {price.kind === "marginal" && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">Joint price applied.</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-[var(--destructive)]">{error}</p>
      )}
    </div>
  );
}

function BundleRow({
  bundleId,
  label,
  amountEur,
  description,
  theme,
  disabled,
}: {
  bundleId: RandwijckBundleId;
  label: string;
  amountEur: number;
  description: string;
  theme: ClubTheme;
  disabled?: boolean;
}) {
  const styles = clubTheme(theme);
  const params = new URLSearchParams();
  params.set("tier", "adult");
  params.set("clubs", "randwijck");
  params.set("randwijckBundle", bundleId);
  const href = `/portal/membership/confirm?${params.toString()}`;
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--card)] p-3.5 shadow-[var(--shadow-sm)]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className={cn("text-sm font-semibold", styles.accentText)}>
            {label}
          </div>
          <div className={cn("text-[11px]", styles.mutedText)}>
            {description}
          </div>
        </div>
        <div className="tabular font-display text-xl font-medium tracking-tight">
          {formatMembershipPrice(amountEur)}
        </div>
      </div>
      <Button
        asChild={!disabled}
        type="button"
        disabled={disabled}
        tone={theme === "joint" ? "joint" : theme}
        variant="outline"
        size="sm"
        className="mt-3 w-full"
      >
        {disabled ? (
          <span>Out of season</span>
        ) : (
          <Link href={href}>Pick this pass</Link>
        )}
      </Button>
    </div>
  );
}

function FamilyBlockedRow({
  label,
  sub,
  theme,
}: {
  label: string;
  sub: string;
  theme: ClubTheme;
}) {
  const styles = clubTheme(theme);
  return (
    <div
      className="rounded-[var(--radius-md)] bg-[var(--card)] p-3.5 opacity-70 shadow-[var(--shadow-sm)]"
      title="Family covers Randwijck only"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className={cn("text-sm font-semibold", styles.accentText)}>
            {label}
          </div>
          <div className={cn("text-[11px]", styles.mutedText)}>{sub}</div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          Randwijck only
        </Badge>
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
        Family memberships only cover Randwijck. Pick Adult or Youth here, or
        switch to the Randwijck column for Family.
      </p>
    </div>
  );
}

function clubLabelFor(slug: ClubSlug): string {
  return slug === "triaz" ? "Triaz" : "Randwijck";
}

function columnKeyForClubs(
  clubList: ClubSlug[],
): "triaz" | "randwijck" | "both" {
  if (clubList.length === 2) return "both";
  return clubList[0] === "randwijck" ? "randwijck" : "triaz";
}

function ChildPickerBody({
  pickerId,
  householdChildren,
  unlocked,
  selectedChildId,
  onSelectChild,
  confirmHref,
  onClose,
  clubsLabel,
}: {
  pickerId: string;
  householdChildren: HouseholdOwnership["householdMembers"];
  unlocked: Extract<CellAvailability, { kind: "unlocked" }> | null;
  selectedChildId: string | null;
  onSelectChild: (id: string) => void;
  confirmHref: string | null;
  onClose: () => void;
  clubsLabel: string;
}) {
  const eligibleIds = new Set(
    unlocked?.eligibleAssignees?.map((a) => a.personId) ?? [],
  );
  const coveredIds = new Set(
    unlocked?.coveredAssignees?.map((a) => a.personId) ?? [],
  );
  const hasChildren = householdChildren.length > 0;
  const hasEligible = (unlocked?.eligibleAssignees?.length ?? 0) > 0;

  return (
    <>
      <h4
        id={`${pickerId}-title`}
        className="font-display text-base font-medium tracking-tight text-[var(--foreground)]"
      >
        {!hasChildren
          ? "No child in your household yet"
          : hasEligible
            ? "Apply to which child?"
            : "Everyone is already covered"}
      </h4>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        {!hasChildren
          ? "Youth memberships need to be applied to a specific kid."
          : hasEligible
            ? `This membership will apply to ${clubsLabel}.`
            : "Every child in your household already has this coverage for those clubs."}
      </p>

      {!hasChildren ? (
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" tone="triaz" size="sm" asChild>
            <Link href="/portal/family?addChild=1">Add a child</Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <>
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
            {householdChildren.map((m) => {
              const id = m.personId;
              const label = `${m.firstName} ${m.lastName}`.trim();
              const eligible = eligibleIds.has(id);
              const covered = coveredIds.has(id);
              const disabledRow = covered || !eligible;

              return (
                <li key={id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-transparent px-2 py-2 transition-colors",
                      disabledRow
                        ? "cursor-not-allowed opacity-60"
                        : "hover:bg-[var(--surface-strong)]",
                    )}
                  >
                    <input
                      type="radio"
                      name={`child-picker-${pickerId}`}
                      className="shrink-0"
                      checked={selectedChildId === id && eligible}
                      disabled={disabledRow}
                      onChange={() => eligible && onSelectChild(id)}
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
                    {covered && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Already covered
                      </Badge>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              asChild={!!confirmHref}
              type="button"
              tone="triaz"
              size="sm"
              disabled={!confirmHref}
            >
              {confirmHref ? (
                <Link href={confirmHref}>Continue</Link>
              ) : (
                <span>Continue</span>
              )}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
