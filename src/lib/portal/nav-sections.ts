import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { getMemberUnreadCount } from "@/lib/inbox/queries";
import { getCurrentOrg } from "@/lib/tenant";
import { householdHasLiveEnrollment } from "@/lib/portal/trial-eligibility";

export interface PortalNavItem {
  href: string;
  label: string;
  /** Optional helper text shown under the label on hover/aria. */
  hint?: string;
  /**
   * Visual emphasis hint — `"primary"` is for the headline CTA we want
   * non-members to click ("Get a membership"). The shell may render
   * primary items with a tinted background and a small dot.
   */
  emphasis?: "primary";
  /** Numeric badge (unread count). Hidden when 0/undefined. */
  badge?: number;
}

export interface PortalNavGroup {
  /** Uppercase tracker label rendered above the group in the sidebar. */
  label: string;
  items: PortalNavItem[];
}

export interface PortalNavSections {
  /** Always visible (kept for backward compat). */
  always: PortalNavItem[];
  /** Persona-specific items in the order they should appear. */
  conditional: PortalNavItem[];
  /** Grouped items used by the new AppShell sidebar. */
  groups: PortalNavGroup[];
}

// "Lesson credit" was previously a static nav entry. We deliberately
// surface credit only when there's a balance to spend (via the
// <CreditStrip> on overview / programs and the toggle inside
// <EnrollPanel>) — a permanent nav item with €0 was just noise.

export interface PortalNavSectionsArgs {
  personId: string;
  householdId: string | null;
  isStudent: boolean;
  /**
   * When false the sidebar pivots into "sales" mode — see the doc
   * comment above. Defaults to true so existing callers keep their
   * current behaviour until they pass through the real value.
   */
  hasActiveMembership?: boolean;
  /** Household credit balance in cents — surfaces Credits nav when > 0. */
  creditBalanceCents?: number;
}

/**
 * Compute the sidebar items for the portal based on who the viewer is.
 *
 * The new shell renders nav in two groups: "Play" (the day-to-day stuff)
 * and "Account" (settings & membership). Persona-specific items slot in
 * naturally:
 *
 *   - Parents (household has a child) OR households with an active
 *     family-tier membership → "My family" under Play.
 *   - Adult students → "My classes" under Play.
 *
 * Solo adults who haven't opted into a family see no sidebar item; they
 * can still reach /portal/family via the entry point on /portal/profile.
 *
 * Non-members (no active membership rows) get a re-shaped sidebar that
 * sells rather than serves: the Account group is renamed to "Get
 * started", "My membership" becomes "Get a membership", and the items
 * that require coverage to be useful (My bookings, Ladder) are hidden
 * until they're worth showing.
 */
// Public entry point. We keep the object-arg shape callers already use,
// then forward to a positional-arg, cached implementation. `React.cache`
// keys on Object.is for each argument, so an object literal would never
// dedupe across the layout and any same-request consumer.
export async function getPortalNavSections(
  args: PortalNavSectionsArgs,
): Promise<PortalNavSections> {
  return _getPortalNavSectionsCached(
    args.personId,
    args.householdId,
    args.isStudent,
    args.hasActiveMembership ?? true,
    args.creditBalanceCents ?? 0,
  );
}

const _getPortalNavSectionsCached = cache(_getPortalNavSections);

async function _getPortalNavSections(
  personId: string,
  householdId: string | null,
  isStudent: boolean,
  hasActiveMembership: boolean,
  creditBalanceCents: number,
): Promise<PortalNavSections> {
  const conditional: PortalNavItem[] = [];
  const [unreadCount, org, hasLiveEnrollment] = await Promise.all([
    getMemberUnreadCount(personId),
    getCurrentOrg(),
    householdHasLiveEnrollment({ personId, householdId }),
  ]);
  const f = org.features;
  const t = org.terms;
  const bookingsEnabled = f.courtBookings;
  const membershipsEnabled = f.memberships;
  const eventsEnabled = f.events;
  const inboxEnabled = f.inbox;
  const paymentsEnabled = f.payments;

  let hasStudentChild = false;
  if (householdId) {
    const [childCount, familyMembershipCount, studentChildCount] =
      await Promise.all([
        prisma.householdMember.count({
          where: {
            householdId,
            roleInHousehold: "child",
          },
        }),
        prisma.membership.count({
          where: {
            householdId,
            status: "active",
            coverageTier: "family",
            startsOn: { lte: new Date() },
            expiresOn: { gte: new Date() },
          },
        }),
        prisma.householdMember.count({
          where: {
            householdId,
            roleInHousehold: "child",
            person: { student: { isNot: null } },
          },
        }),
      ]);

    hasStudentChild = studentChildCount > 0;

    if (f.households && (childCount > 0 || familyMembershipCount > 0)) {
      conditional.push({
        href: "/portal/family",
        label: `My ${t.household.singular.toLowerCase()}`,
        hint: `Add or edit your ${t.student.plural.toLowerCase()} and see what's coming up`,
      });
    }
  }

  if (f.classes && (isStudent || hasStudentChild)) {
    conditional.push({
      href: "/portal/classes",
      label: `My ${t.class.plural.toLowerCase()}`,
      hint: isStudent
        ? `Your upcoming ${t.class.plural.toLowerCase()} and ${t.enrollment.plural.toLowerCase()}`
        : `Your ${t.student.plural.toLowerCase()}' upcoming ${t.class.plural.toLowerCase()} and ${t.enrollment.plural.toLowerCase()}`,
    });
  }

  const playItems: PortalNavItem[] = [
    { href: "/portal", label: "Overview" },
  ];
  if (f.classes) {
    playItems.push({
      href: "/portal/programs",
      label: capitalize(t.enrollment.singular),
      hint: `Find a ${t.class.singular.toLowerCase()} — browse ${t.program.plural.toLowerCase()} and ${t.enrollVerb.toLowerCase()}`,
    });
  }
  const trialIsPrimary =
    !hasActiveMembership && f.trialInterest && !hasLiveEnrollment;
  if (f.trialInterest && !hasLiveEnrollment) {
    playItems.push({
      href: "/portal/request-trial",
      label: "Request trial",
      hint: `Try a ${t.class.singular.toLowerCase()} before you ${t.enrollVerb.toLowerCase()}`,
      emphasis: trialIsPrimary ? "primary" : undefined,
    });
  }
  if (eventsEnabled) {
    playItems.push({
      href: "/portal/events",
      label: "Events",
      hint: "One-off events, tournaments and socials",
    });
  }
  playItems.push(...conditional);

  if (bookingsEnabled) {
    playItems.push({
      href: "/portal/book",
      label: `${t.bookVerb} a ${t.court.singular.toLowerCase()}`,
    });
  }
  if (hasActiveMembership && bookingsEnabled) {
    playItems.push({ href: "/portal/bookings", label: "My bookings" });
  }

  // Account group items
  const inboxItem: PortalNavItem = {
    href: "/portal/inbox",
    label: "Inbox",
    badge: unreadCount,
  };
  const membershipItem: PortalNavItem = {
    href: "/portal/membership",
    label: `My ${t.membership.singular.toLowerCase()}`,
  };
  const paymentsItem: PortalNavItem = {
    href: "/portal/payments",
    label: "Payments",
  };

  const accountItems: PortalNavItem[] = [];
  if (hasActiveMembership) {
    if (inboxEnabled) accountItems.push(inboxItem);
    if (membershipsEnabled) accountItems.push(membershipItem);
    if (paymentsEnabled) accountItems.push(paymentsItem);
  } else {
    if (membershipsEnabled) {
      accountItems.push({
        href: "/portal/membership#buy",
        label: `Get a ${t.membership.singular.toLowerCase()}`,
        hint: `Pick the right tier and ${t.club.plural.toLowerCase()}`,
        emphasis: trialIsPrimary ? undefined : "primary",
      });
    }
    if (inboxEnabled) accountItems.push(inboxItem);
    if (paymentsEnabled) accountItems.push(paymentsItem);
  }

  if (creditBalanceCents > 0) {
    accountItems.push({
      href: "/portal/credits",
      label: "Credits",
      hint: "Household lesson credit balance",
    });
  }

  const accountGroup: PortalNavGroup = {
    label: hasActiveMembership
      ? "Account"
      : membershipsEnabled
        ? "Get started"
        : "Account",
    items: accountItems,
  };

  const groups: PortalNavGroup[] = [
    { label: "Play", items: playItems },
    ...(accountGroup.items.length > 0 ? [accountGroup] : []),
  ];

  return {
    always: [...playItems, ...accountGroup.items],
    conditional,
    groups,
  };
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
