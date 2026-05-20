"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createEnrollment } from "@/lib/portal/enrollment-actions";
import {
  eventHasMemberPricingTier,
  resolveEventCheckoutPrice,
  type PricingTier,
} from "@/lib/classes/pricing-tiers";
import { computeEnrollmentPricing } from "@/lib/portal/enrollment-pricing";
import { startCheckout as beginCheckout } from "@/lib/payments/start-checkout";
import {
  getMollieAccountForMembership,
  getMollieAccountForOperations,
  MOLLIE_ACCOUNT_LABELS,
} from "@/lib/payments/mollie-accounts";
import { useActionFeedback } from "@/lib/feedback";

export interface EnrollCandidate {
  personId: string;
  displayName: string;
  relation: "you" | "child";
  age: number | null;
  /** Drives the membership tier price quoted in the breakdown. */
  ageBracket: "child" | "adult";
  /** True when this candidate already holds a membership covering the venue's club. */
  hasActiveMembership: boolean;
  /** Existing enrollment in this series (if any) so we can show status. */
  existing: { status: string; enrollmentId: string } | null;
  /** Whether this candidate is in the series' age band. */
  ageOk: boolean;
}

export interface EnrollGroup {
  id: string;
  name: string;
  minAge: number | null;
  maxAge: number | null;
  endTimeHHMM: string;
  slotsLeft: number;
  isFull: boolean;
}

/**
 * Right-rail enrollment widget on the series detail page.
 *
 * Shows live capacity, picks the right person to enroll (auto-selects
 * first eligible), and surfaces the result of the server action inline
 * — successful enrollments show a "go to my classes" link, failures
 * show the message verbatim from the server.
 */
export function EnrollPanel({
  seriesId,
  seriesName,
  slotsLeft,
  maxStudents,
  isFull,
  waitlistEnabled,
  waitlistedCount,
  enrollmentOpenNow,
  opensAt,
  closesAt,
  candidates,
  groups,
  pricePerSeries,
  isEvent = false,
  pricingTiers = null,
  /**
   * Sessions serialized as ISO strings — Server Components can't pass
   * Date instances across the boundary cleanly, and we only need the
   * `startsAt` here to recompute past/remaining counts.
   */
  sessionStartsAtIso,
  venueClubSlug,
  isReturningHousehold = false,
  householdCreditCents = 0,
  brandName,
  privateLessonLabel,
}: {
  seriesId: string;
  seriesName: string;
  slotsLeft: number;
  maxStudents: number;
  isFull: boolean;
  waitlistEnabled: boolean;
  waitlistedCount: number;
  enrollmentOpenNow: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  candidates: EnrollCandidate[];
  /**
   * Sub-groups for split classes. Single-group series pass an array of
   * length 1 — the panel skips the picker UI and auto-uses that group.
   */
  groups: EnrollGroup[];
  pricePerSeries: number | null;
  isEvent?: boolean;
  pricingTiers?: PricingTier[] | null;
  sessionStartsAtIso: string[];
  venueClubSlug: "triaz" | "randwijck" | null;
  /**
   * Whether the buying household has any prior membership row.
   * Returning members never get a prorated membership add-on; they
   * always pay the full annual rate. Defaults to `false` for safety.
   */
  isReturningHousehold?: boolean;
  /**
   * Lessons-only credit currently on file for the buying household
   * (EUR cents). Drives the optional "apply credit" toggle. Membership
   * add-on is never paid with credit (lessons-only policy).
   */
  householdCreditCents?: number;
  /** Tenant short brand (used in pitch / tooltip copy). */
  brandName: string;
  /** Tenant private-lesson singular label, plural form derived in copy. */
  privateLessonLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Step 1 of the two-step membership-then-lesson flow drops the user
  // back here with `?step=lesson`. Used to enable the second card and
  // (intentionally) NOT to auto-fire it — the parent must click again
  // so they see the second Mollie account label before paying.
  const lessonStepUnlocked = searchParams.get("step") === "lesson";
  const [checkoutPending, startCheckout] = useTransition();
  const [success, setSuccess] = useState<{
    status: "pending_payment" | "waitlist" | "active";
    isNew: boolean;
    name: string;
  } | null>(null);
  const { run, pending: enrollPending, error } = useActionFeedback<{
    enrollmentId: string;
    status: "pending_payment" | "waitlist" | "active";
    isNew: boolean;
  }>({
    success: (r) =>
      r.status === "waitlist"
        ? "Added to the waitlist"
        : r.status === "active"
          ? "Enrollment confirmed"
          : "Spot saved",
  });
  const pending = checkoutPending || enrollPending;

  const eligible = candidates.filter((c) => !c.existing && c.ageOk);
  const firstEligibleId = eligible[0]?.personId ?? candidates[0]?.personId ?? "";
  const [selectedId, setSelectedId] = useState<string>(firstEligibleId);
  // Heather feedback v1: parents can opt past the age band when their
  // child is "almost" the right age. The server caps how far they can
  // stray (±2 years) and stamps `requiresReview` so the office can
  // confirm before the lesson starts.
  const [ageOverrideAck, setAgeOverrideAck] = useState(false);

  const selected = candidates.find((c) => c.personId === selectedId);

  // Sub-group picker (split-class scaffolding). When the series has a
  // single group the picker is hidden and we auto-use that group's id.
  // For multi-group series we filter the visible options to the bands
  // the candidate's age falls into and auto-select the first match.
  const isSplit = groups.length > 1;
  const eligibleGroupsForSelected = useMemo(() => {
    if (!selected) return groups;
    return groups.filter((g) => candidateFitsGroup(selected, g));
  }, [groups, selected]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    groups[0]?.id ?? "",
  );
  // Whenever the candidate changes, snap the group selection to the
  // first eligible band for them (or null if none match).
  const autoGroupId =
    eligibleGroupsForSelected[0]?.id ?? groups[0]?.id ?? "";
  if (
    isSplit &&
    selectedGroupId &&
    !groups.find((g) => g.id === selectedGroupId)
  ) {
    setSelectedGroupId(autoGroupId);
  }
  const effectiveGroupId = isSplit
    ? selectedGroupId || autoGroupId
    : groups[0]?.id ?? "";

  // Re-compute the breakdown when the parent picks a different
  // candidate — membership coverage and age bracket vary per kid, so
  // the total can change. We recompute on every render with `now =
  // new Date()` because the only inputs that move quickly enough to
  // matter are time-based (a session crossing into "past" mid-page);
  // calling `Date.now()` once per render is plenty fast.
  const effectivePricePerSeries = useMemo(() => {
    if (!isEvent || !pricingTiers?.length) return pricePerSeries;
    if (!selected) return pricePerSeries;
    return resolveEventCheckoutPrice({
      pricePerSeries,
      pricingTiers,
      hasActiveMembership: selected.hasActiveMembership,
    }).amountEur;
  }, [isEvent, pricingTiers, pricePerSeries, selected]);

  const breakdown = useMemo(() => {
    if (!selected) return null;
    return computeEnrollmentPricing({
      pricePerSeries: effectivePricePerSeries,
      sessions: sessionStartsAtIso.map((iso) => ({ startsAt: new Date(iso) })),
      now: new Date(),
      venueClubSlug,
      hasActiveMembership: selected.hasActiveMembership,
      candidateAgeBracket: selected.ageBracket,
      isReturningHousehold,
      suppressMembershipAddOn:
        isEvent && eventHasMemberPricingTier(pricingTiers),
    });
  }, [
    selected,
    effectivePricePerSeries,
    sessionStartsAtIso,
    venueClubSlug,
    isReturningHousehold,
    isEvent,
    pricingTiers,
  ]);

  const showWaitlist = isFull && waitlistEnabled;

  // Credit toggle: only meaningful when the household has a positive
  // balance, the parent is going to actually pay (not waitlist), and
  // the lesson seat itself is non-free. Credit covers the lesson half
  // only — the membership add-on is paid in full per policy.
  const lessonChargeCents = breakdown?.payableLesson != null
    ? Math.round(breakdown.payableLesson * 100)
    : 0;
  const maxApplicableCents = Math.min(householdCreditCents, lessonChargeCents);
  const creditEligible = !showWaitlist && maxApplicableCents > 0;
  const [applyCredit, setApplyCredit] = useState(false);
  const creditCentsApplied = creditEligible && applyCredit ? maxApplicableCents : 0;
  const creditAppliedEur = creditCentsApplied / 100;
  const adjustedLessonAmount = Math.max(
    0,
    (breakdown?.payableLesson ?? 0) - creditAppliedEur,
  );
  const adjustedTotal = breakdown?.total != null
    ? Math.max(0, breakdown.total - creditAppliedEur)
    : null;

  // Only quote a total on the button when we're enrolling for real.
  // Waitlist sign-ups don't get billed until they're promoted.
  const buttonTotalLabel =
    !showWaitlist && adjustedTotal != null ? ` · €${adjustedTotal}` : "";
  const enrollAction =
    pending
      ? "Saving…"
      : showWaitlist
        ? "Join waitlist"
        : `Enroll${selected ? ` ${firstWord(selected.displayName)}` : ""}${buttonTotalLabel}`;

  function onEnroll() {
    setSuccess(null);
    if (!selected) return;
    if (selected.existing) return;
    if (!selected.ageOk && !ageOverrideAck) return;

    // Waitlist sign-ups + truly free classes go straight through; only
    // paid enrollments get the fake Mollie page in front.
    const goesToWaitlist = showWaitlist;
    const totalDue = !goesToWaitlist ? adjustedTotal : null;
    const skipCheckout = goesToWaitlist || totalDue == null || totalDue <= 0;

    if (skipCheckout) {
      const name = selected.displayName;
      const studentParam = encodeURIComponent(firstWord(name));
      run(async () => {
        const res = await createEnrollment({
          classSeriesId: seriesId,
          studentPersonId: selected.personId,
          groupId: effectiveGroupId || undefined,
          ageOverrideAck: !selected.ageOk ? true : undefined,
        });
        if (res.ok) {
          setSuccess({ status: res.status, isNew: res.isNew, name });
          // Land the parent on /portal/classes (where the class actually
          // lives) with query params the inline EnrollmentSuccessBanner
          // uses to render the friendly "see you on court" / waitlist
          // message. The toast still fires from useActionFeedback so
          // the redirect feels intentional.
          const params = new URLSearchParams({
            enrolled: "1",
            series: seriesId,
            student: studentParam,
          });
          if (res.status === "waitlist") params.set("waitlist", "1");
          router.push(`/portal/classes?${params.toString()}`);
        }
        return res;
      });
      return;
    }

    const studentParam = encodeURIComponent(firstWord(selected.displayName));
    startCheckout(() => {
      void beginCheckout(
        {
          amountEur: totalDue,
          description: `${seriesName} · ${selected.displayName}`,
          returnUrl: `/portal/classes?enrolled=1&series=${seriesId}&student=${studentParam}`,
          action: {
            kind: "enrollment_create",
            payload: {
              classSeriesId: seriesId,
              studentPersonId: selected.personId,
              groupId: effectiveGroupId || undefined,
              ageOverrideAck: !selected.ageOk ? true : undefined,
              creditCentsApplied: creditCentsApplied || undefined,
            },
          },
        },
        router,
      );
    });
  }

  const groupForSelected = isSplit
    ? groups.find((g) => g.id === effectiveGroupId) ?? null
    : null;
  const groupBlocksEnroll =
    isSplit &&
    (!effectiveGroupId ||
      eligibleGroupsForSelected.length === 0 ||
      (groupForSelected?.isFull ?? false));

  // Two-step checkout fires when the selected candidate needs a
  // membership to enroll (per-club coverage), the venue is one of our
  // mollie-routable clubs, the parent is going to actually pay (not
  // waitlist or free), and we have a non-zero membership add-on
  // quoted. Otherwise the single-button enroll handles it as today.
  const showTwoStepCheckout =
    !showWaitlist &&
    !!selected &&
    !selected.existing &&
    (selected.ageOk || ageOverrideAck) &&
    !selected.hasActiveMembership &&
    breakdown != null &&
    (breakdown.membershipAddOn ?? 0) > 0 &&
    venueClubSlug != null;

  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <CapacityHeader
        slotsLeft={slotsLeft}
        maxStudents={maxStudents}
        isFull={isFull}
        waitlistEnabled={waitlistEnabled}
        waitlistedCount={waitlistedCount}
      />

      {!enrollmentOpenNow && (
        <div className="rounded-md bg-[var(--warning-soft)] px-3 py-2 text-xs text-[oklch(0.42_0.13_75)]">
          {opensAt && opensAt > new Date()
            ? `Enrollment opens ${formatDate(opensAt)}.`
            : closesAt && closesAt < new Date()
              ? `Enrollment closed ${formatDate(closesAt)}.`
              : "Enrollment isn't open right now."}
        </div>
      )}

      {candidates.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          You don&apos;t have any students linked to your account yet — add a
          child on{" "}
          <Link
            href="/portal/family"
            className="underline-offset-4 hover:underline"
          >
            My family
          </Link>{" "}
          to enroll them.
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Who&apos;s joining?
          </legend>
          <div className="space-y-1">
            {candidates.map((c) => (
              <label
                key={c.personId}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                  selectedId === c.personId
                    ? "border-[var(--triaz)] bg-[var(--triaz-soft)]"
                    : "border-[var(--border)] hover:border-[var(--triaz)]/40",
                  (c.existing || !c.ageOk) && "opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="student"
                  value={c.personId}
                  checked={selectedId === c.personId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="accent-[var(--triaz)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-medium">{c.displayName}</span>
                    {c.relation === "you" && (
                      <Badge variant="outline" className="text-[10px]">
                        You
                      </Badge>
                    )}
                    {c.age != null && (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        ({c.age})
                      </span>
                    )}
                  </div>
                  {c.existing && (
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      Already enrolled · {c.existing.status.replace("_", " ")}
                    </div>
                  )}
                  {!c.ageOk && !c.existing && (
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      Outside the age range — request a review below to
                      enroll anyway.
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {isSplit && (
        <fieldset className="space-y-2">
          <legend className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Pick a group
          </legend>
          <div className="space-y-1">
            {groups.map((g) => {
              const fits = selected ? candidateFitsGroup(selected, g) : true;
              return (
                <label
                  key={g.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                    effectiveGroupId === g.id
                      ? "border-[var(--triaz)] bg-[var(--triaz-soft)]"
                      : "border-[var(--border)] hover:border-[var(--triaz)]/40",
                    (g.isFull || !fits) && "opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="group"
                    value={g.id}
                    checked={effectiveGroupId === g.id}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="accent-[var(--triaz)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-medium">{g.name}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        ends {g.endTimeHHMM}
                      </span>
                      {g.isFull && (
                        <Badge tone="warning" variant="soft" className="text-[10px]">
                          Full
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {ageBandLabel(g)}
                      {!g.isFull && ` · ${g.slotsLeft} spot${g.slotsLeft === 1 ? "" : "s"} left`}
                      {!fits && selected && " · outside your child's age band"}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {!showWaitlist &&
        breakdown &&
        selected &&
        !selected.existing &&
        (selected.ageOk || ageOverrideAck) && (
          <PricingBreakdown
            breakdown={breakdown}
            candidate={selected}
            creditAppliedEur={creditAppliedEur}
            brandName={brandName}
            privateLessonLabel={privateLessonLabel}
          />
        )}

      {creditEligible && selected && !selected.existing && (
        <CreditToggle
          checked={applyCredit}
          onChange={setApplyCredit}
          availableCents={householdCreditCents}
          willApplyCents={maxApplicableCents}
        />
      )}

      {selected && !selected.existing && !selected.ageOk && (
        <AgeOverrideAck
          checked={ageOverrideAck}
          onChange={setAgeOverrideAck}
          studentName={firstWord(selected.displayName)}
        />
      )}

      {success ? (
        <SuccessNotice success={success} seriesName={seriesName} />
      ) : showTwoStepCheckout && selected && breakdown ? (
        <TwoStepCheckout
          membershipAddOn={breakdown.membershipAddOn ?? 0}
          lessonAmount={adjustedLessonAmount}
          tier={selected.ageBracket === "child" ? "child" : "adult"}
          studentPersonId={selected.personId}
          studentDisplayName={selected.displayName}
          venueClubSlug={venueClubSlug!}
          seriesName={seriesName}
          seriesId={seriesId}
          groupId={effectiveGroupId || undefined}
          ageOverrideAck={!selected.ageOk ? true : undefined}
          pathname={pathname}
          lessonStepUnlocked={lessonStepUnlocked}
          disabled={
            pending ||
            !enrollmentOpenNow ||
            !!selected.existing ||
            (!selected.ageOk && !ageOverrideAck) ||
            groupBlocksEnroll
          }
          pending={pending}
          onLessonRun={(payload) => {
            const studentParam = encodeURIComponent(
              firstWord(selected.displayName),
            );
            startCheckout(() => {
              void beginCheckout(
                {
                  amountEur: payload.lessonAmount,
                  description: `${seriesName} · ${selected.displayName} (lesson only)`,
                  returnUrl: `/portal/classes?enrolled=1&series=${seriesId}&student=${studentParam}`,
                  mollieAccount: getMollieAccountForOperations(),
                  action: {
                    kind: "enrollment_create_lesson_only",
                    payload: {
                      classSeriesId: seriesId,
                      studentPersonId: selected.personId,
                      groupId: effectiveGroupId || undefined,
                      ageOverrideAck: !selected.ageOk ? true : undefined,
                      creditCentsApplied: creditCentsApplied || undefined,
                    },
                  },
                },
                router,
              );
            });
          }}
        />
      ) : (
        <Button
          tone="triaz"
          variant="solid"
          className="w-full"
          onClick={onEnroll}
          disabled={
            pending ||
            !enrollmentOpenNow ||
            (isFull && !waitlistEnabled) ||
            !selected ||
            !!selected?.existing ||
            (!selected?.ageOk && !ageOverrideAck) ||
            groupBlocksEnroll
          }
        >
          {enrollAction}
        </Button>
      )}

      {!showWaitlist && breakdown && breakdown.total != null && (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          The office sends one invoice covering both items.
        </p>
      )}

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      <p className="text-[11px] text-[var(--muted-foreground)]">
        Enrolling here saves the spot. The office follows up to confirm payment
        — you can withdraw anytime from{" "}
        <Link
          href="/portal/classes"
          className="underline-offset-4 hover:underline"
        >
          My classes
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * Two-card sequential checkout used when the parent must buy a
 * membership before the lesson fee is collectable.
 *
 * Card 1 — Membership: Pay button enabled. On click, fires
 * `startDemoCheckout({ kind: "membership_create", ... })` for the
 * single-club membership at the venue's club. Returns to the same
 * series page with `?step=lesson` appended so the second card knows
 * step 1 is done.
 *
 * Card 2 — Lesson: Pay button disabled until `lessonStepUnlocked` is
 * true (i.e. the URL has `?step=lesson`). On click, fires
 * `startDemoCheckout({ kind: "enrollment_create_lesson_only", ... })`
 * which short-circuits the membership-grant path on the server and
 * just bills the lesson seat.
 *
 * The two cards intentionally show their Mollie-account labels so the
 * demo audience can see the routing rule in action — Triaz vs Higgins.
 */
function TwoStepCheckout({
  membershipAddOn,
  lessonAmount,
  tier,
  studentPersonId,
  studentDisplayName,
  venueClubSlug,
  seriesName,
  seriesId,
  groupId,
  ageOverrideAck,
  pathname,
  lessonStepUnlocked,
  disabled,
  pending,
  onLessonRun,
}: {
  membershipAddOn: number;
  lessonAmount: number;
  tier: "child" | "adult";
  studentPersonId: string;
  studentDisplayName: string;
  venueClubSlug: "triaz" | "randwijck";
  seriesName: string;
  seriesId: string;
  groupId?: string;
  ageOverrideAck?: boolean;
  pathname: string;
  lessonStepUnlocked: boolean;
  disabled: boolean;
  pending: boolean;
  onLessonRun: (payload: { lessonAmount: number }) => void;
}) {
  const router = useRouter();
  const membershipAccount = getMollieAccountForMembership({
    clubSlug: venueClubSlug,
  });
  const lessonAccount = getMollieAccountForOperations();

  function payMembership() {
    const stepReturn = `${pathname}?step=lesson`;
    void beginCheckout(
      {
        amountEur: membershipAddOn,
        description: `${tier === "child" ? "Child" : "Adult"} membership · ${
          venueClubSlug === "triaz" ? "Triaz" : "Randwijck"
        } · ${studentDisplayName}`,
        returnUrl: stepReturn,
        mollieAccount: membershipAccount,
        action: {
          kind: "membership_create",
          payload: {
            tier,
            clubs: [venueClubSlug],
            assignedPersonId: studentPersonId,
          },
        },
      },
      router,
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        Two-step checkout
      </div>

      <StepCard
        stepNumber={1}
        title={`${venueClubSlug === "triaz" ? "Triaz" : "Randwijck"} ${
          tier === "child" ? "child" : "adult"
        } membership`}
        sub={`Required to take ${seriesName}.`}
        amount={membershipAddOn}
        accountLabel={MOLLIE_ACCOUNT_LABELS[membershipAccount]}
        completed={lessonStepUnlocked}
        ctaLabel={
          lessonStepUnlocked
            ? "Membership paid"
            : pending
              ? "Opening Mollie…"
              : `Pay (${MOLLIE_ACCOUNT_LABELS[membershipAccount]})`
        }
        disabled={disabled || lessonStepUnlocked || pending}
        onClick={payMembership}
      />

      <StepCard
        stepNumber={2}
        title={`Lesson · ${seriesName}`}
        sub={
          lessonStepUnlocked
            ? "Membership confirmed — pay the lesson to lock the spot."
            : "Unlocks once the membership is paid."
        }
        amount={lessonAmount}
        accountLabel={MOLLIE_ACCOUNT_LABELS[lessonAccount]}
        completed={false}
        ctaLabel={
          pending
            ? "Opening Mollie…"
            : `Pay (${MOLLIE_ACCOUNT_LABELS[lessonAccount]})`
        }
        disabled={disabled || !lessonStepUnlocked || pending}
        onClick={() => onLessonRun({ lessonAmount })}
      />

      <p className="text-[11px] text-[var(--muted-foreground)]">
        Two payments — the membership goes to {MOLLIE_ACCOUNT_LABELS[membershipAccount]}
        and the lesson goes to {MOLLIE_ACCOUNT_LABELS[lessonAccount]}. You&apos;ll
        get a receipt for each.
      </p>
    </div>
  );
}

function StepCard({
  stepNumber,
  title,
  sub,
  amount,
  accountLabel,
  completed,
  ctaLabel,
  disabled,
  onClick,
}: {
  stepNumber: number;
  title: string;
  sub: string;
  amount: number;
  accountLabel: string;
  completed: boolean;
  ctaLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-[var(--card)] p-3 shadow-[var(--shadow-sm)] transition-opacity",
        completed
          ? "border-[var(--success)]/40 opacity-90"
          : disabled
            ? "border-[var(--border)] opacity-60"
            : "border-[var(--border)]",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[10px] font-semibold tabular">
              {stepNumber}
            </span>
            <span className="text-sm font-semibold">{title}</span>
            {completed && (
              <Badge tone="success" variant="soft" className="text-[10px]">
                Paid
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
            {sub}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-lg font-medium tracking-tight tabular">
            €{amount}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            via {accountLabel}
          </div>
        </div>
      </div>
      <Button
        tone="triaz"
        variant="solid"
        size="sm"
        className="mt-3 w-full"
        onClick={onClick}
        disabled={disabled}
      >
        {ctaLabel}
      </Button>
    </div>
  );
}

function CapacityHeader({
  slotsLeft,
  maxStudents,
  isFull,
  waitlistEnabled,
  waitlistedCount,
}: {
  slotsLeft: number;
  maxStudents: number;
  isFull: boolean;
  waitlistEnabled: boolean;
  waitlistedCount: number;
}) {
  if (isFull) {
    return (
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-display text-2xl font-medium tracking-tight">
            Class is full
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {waitlistEnabled
              ? `${waitlistedCount} on the waitlist`
              : "Waitlist closed"}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between">
      <div>
        <div className="font-display text-2xl font-medium tracking-tight tabular">
          {slotsLeft} <span className="text-base">spot{slotsLeft === 1 ? "" : "s"} left</span>
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">
          out of {maxStudents}
        </div>
      </div>
    </div>
  );
}

function SuccessNotice({
  success,
  seriesName,
}: {
  success: { status: "pending_payment" | "waitlist" | "active"; isNew: boolean; name: string };
  seriesName: string;
}) {
  const tone =
    success.status === "waitlist"
      ? "warning"
      : success.status === "active"
        ? "success"
        : "triaz";
  const headline =
    success.status === "waitlist"
      ? `${success.name} is on the waitlist for ${seriesName}.`
      : success.status === "active"
        ? `${success.name} is enrolled in ${seriesName}.`
        : success.isNew
          ? `${success.name} is signed up for ${seriesName}.`
          : `${success.name} was already on the list — nothing to do.`;
  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
      <div className="flex items-center gap-2">
        <Badge tone={tone}>
          {success.status.replace("_", " ")}
        </Badge>
      </div>
      <p>{headline}</p>
      <Link
        href="/portal/classes"
        className="text-xs font-semibold text-[var(--triaz-ink)] underline-offset-4 hover:underline"
      >
        Go to My classes →
      </Link>
    </div>
  );
}

/**
 * Itemized "Your total" block. Reactive to candidate selection — when
 * the parent toggles between kids, membership status and age bracket
 * change which alters both the deduction and the add-on. We always
 * show the math so the parent never wonders where a number came from.
 */
function CreditToggle({
  checked,
  onChange,
  availableCents,
  willApplyCents,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  availableCents: number;
  willApplyCents: number;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-[var(--triaz)]"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          Apply €{(willApplyCents / 100).toFixed(2)} of household credit
        </span>
        <span className="block text-[11px] text-[var(--muted-foreground)]">
          You have €{(availableCents / 100).toFixed(2)} of lesson credit
          available. Membership add-ons are paid in full.
        </span>
      </span>
    </label>
  );
}

function PricingBreakdown({
  breakdown,
  candidate,
  creditAppliedEur,
  brandName,
  privateLessonLabel,
}: {
  breakdown: ReturnType<typeof computeEnrollmentPricing>;
  candidate: EnrollCandidate;
  creditAppliedEur: number;
  brandName: string;
  privateLessonLabel: string;
}) {
  if (breakdown.fullSeriesPrice == null) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted-foreground)]">
        No catalog price set for this series yet — the office will send
        a quote once you sign up.
      </div>
    );
  }

  const showProration =
    breakdown.pastSessions > 0 && breakdown.pricePerSession != null;
  const showMembershipLine = breakdown.membershipAddOn != null;

  return (
    <div className="space-y-2 rounded-md bg-[var(--surface)] p-3 text-sm shadow-[var(--shadow-sm)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        Your total
      </div>

      <Row
        label="Lesson series"
        sub={
          breakdown.pricePerSession != null
            ? `${breakdown.totalSessions} sessions · €${breakdown.pricePerSession.toFixed(0)} each`
            : undefined
        }
        value={`€${breakdown.fullSeriesPrice}`}
      />

      {showProration && (
        <Row
          label="Sessions already started"
          sub={`${breakdown.pastSessions} missed → ${breakdown.remainingSessions} remaining`}
          value={`−€${breakdown.missedDeduction}`}
          tone="muted"
        />
      )}

      <Divider />

      <Row
        label="Lesson price"
        value={
          breakdown.payableLesson != null
            ? `€${breakdown.payableLesson}`
            : "—"
        }
        emphasized={!showMembershipLine}
      />

      {showMembershipLine && (
        breakdown.membershipAddOn === 0 ? (
          <Row
            label="Membership"
            value={`Active for ${firstWord(candidate.displayName)}`}
            tone="muted"
          />
        ) : (
          <Row
            label={`Membership (${candidate.ageBracket === "child" ? "Child" : "Adult"})`}
            sub={`Required to take ${brandName} ${privateLessonLabel.toLowerCase()}s. Quoted as the single-club rate.`}
            value={`€${breakdown.membershipAddOn}`}
          />
        )
      )}

      {creditAppliedEur > 0 && (
        <Row
          label="Household credit"
          value={`−€${creditAppliedEur.toFixed(2)}`}
          tone="muted"
        />
      )}

      {breakdown.total != null && (
        <>
          <Divider />
          <Row
            label="Total"
            value={`€${Math.max(0, breakdown.total - creditAppliedEur).toFixed(creditAppliedEur > 0 ? 2 : 0)}`}
            emphasized
          />
        </>
      )}
    </div>
  );
}

function Row({
  label,
  sub,
  value,
  tone,
  emphasized,
}: {
  label: string;
  sub?: string;
  value: string;
  tone?: "muted";
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div
          className={cn(
            "text-sm",
            tone === "muted"
              ? "text-[var(--muted-foreground)]"
              : "text-[var(--foreground)]",
            emphasized && "font-semibold",
          )}
        >
          {label}
        </div>
        {sub && (
          <div className="text-[11px] text-[var(--muted-foreground)]">
            {sub}
          </div>
        )}
      </div>
      <div
        className={cn(
          "shrink-0 tabular text-sm tracking-tight",
          tone === "muted"
            ? "text-[var(--muted-foreground)]"
            : "text-[var(--foreground)]",
          emphasized && "font-display text-base font-medium",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <hr className="border-t border-[var(--border)]" />;
}

function AgeOverrideAck({
  checked,
  onChange,
  studentName,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  studentName: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-dashed border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[oklch(0.42_0.13_75)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[var(--triaz)]"
      />
      <span>
        <strong>Enroll anyway and ask the office to review.</strong>{" "}
        {studentName} is outside the recommended age band — we&apos;ll
        confirm the fit before the first lesson and move them to a better
        group if needed.
      </span>
    </label>
  );
}

function candidateFitsGroup(c: EnrollCandidate, g: EnrollGroup): boolean {
  if (c.age == null) return true;
  if (g.minAge != null && c.age < g.minAge) return false;
  if (g.maxAge != null && c.age > g.maxAge) return false;
  return true;
}

function ageBandLabel(g: EnrollGroup): string {
  if (g.minAge != null && g.maxAge != null) return `Ages ${g.minAge}–${g.maxAge}`;
  if (g.minAge != null) return `Ages ${g.minAge}+`;
  if (g.maxAge != null) return `Up to ${g.maxAge}`;
  return "All ages";
}

function firstWord(name: string): string {
  const trimmed = name.trim();
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}
