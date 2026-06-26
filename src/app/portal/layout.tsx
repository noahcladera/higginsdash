import { requireMember } from "@/lib/auth/require-member";
import { getRoleSwitchLinks } from "@/lib/auth/role-switch-links";
import { signOut } from "../admin/actions";
import {
  AppShell,
  type ShellNavGroup,
} from "@/components/portal/app-shell";
import { getPortalNavSections } from "@/lib/portal/nav-sections";
import { getMembershipsForHousehold } from "@/lib/portal/queries";
import { getHouseholdCreditBalanceCents } from "@/lib/credits/balance";
import { themeBySlug } from "@/lib/club-theme";
import { getCurrentOrg, splitBrandForWordmark } from "@/lib/tenant";
import { TermsProvider } from "@/components/tenant/terms-provider";
import {
  HomeIcon,
  CalendarIcon,
  TicketIcon,
  MembershipIcon,
  UserIcon,
  FamilyIcon,
  CardIcon,
  ClassIcon,
  TennisIcon,
  TrophyIcon,
  CompassIcon,
  InboxIcon,
} from "@/components/icons";

/*
 * Portal shell.
 *
 * Renders a sidebar with brand wordmark, identity card (avatar + name +
 * coverage subline), grouped nav and a small "switch context" panel for
 * users who also wear the admin or coach hat. On mobile the sidebar
 * collapses into a drawer triggered from the top bar.
 *
 * Identity subline shows the member's primary coverage so they always
 * know which club(s) they belong to without leaving the page they're on:
 *   "Member · Triaz + Randwijck"
 *   "Member · Triaz"
 *   "Choose a membership →"
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, person, householdId } = await requireMember();
  const displayName =
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    "Member";

  const [memberships, org, creditBalanceCents] = await Promise.all([
    getMembershipsForHousehold(householdId),
    getCurrentOrg(),
    householdId
      ? getHouseholdCreditBalanceCents(householdId)
      : Promise.resolve(0),
  ]);
  const brand = org.brand;
  const terms = org.terms;
  // Date-bounded: an "active" row whose `expiresOn` is in the past is
  // not really active. Same definition as `/portal/programs/page.tsx`
  // and the shared `getActiveMembershipCoverage` primitive — we read
  // `daysUntilExpiry` here rather than calling the primitive again
  // because we already loaded `getMembershipsForHousehold` for the
  // identity subline.
  const hasActiveMembership = memberships.some(
    (m) => m.status === "active" && m.daysUntilExpiry >= 0,
  );

  const sections = await getPortalNavSections({
    personId: person.id,
    householdId,
    isStudent: !!person.student,
    hasActiveMembership,
    creditBalanceCents,
  });

  const { subline, sublineHref } = describeCoverage(
    memberships,
    terms,
    hasActiveMembership,
  );
  const avatarTone = inferTone(memberships);

  const groups: ShellNavGroup[] = sections.groups.map((g) => ({
    label: g.label,
    items: g.items.map((it) => ({
      ...it,
      icon: iconFor(it.href),
    })),
  }));

  const switchLinks = getRoleSwitchLinks(
    {
      isAdmin: person.isAdmin,
      isCoachLike: !!(
        person.coach?.isActive || person.zzpCoach?.isActive
      ),
      isMember: true,
    },
    "portal",
    terms,
  );

  const wordmark = splitBrandForWordmark(brand);

  return (
    <TermsProvider value={terms}>
      <AppShell
        workspaceLabel={terms.member.plural}
        brandTitle={wordmark.title}
        brandSubline={wordmark.subline}
        brandLogoUrl={brand.logoUrl}
        groups={groups}
        identity={{
          name: displayName,
          subline,
          sublineHref,
          avatarTone,
          navAccentTone: avatarTone,
        }}
        accountMenu={{
          profileHref: "/portal/profile",
          securityHref: "/portal/profile/security",
        }}
        switchLinks={switchLinks}
        signOutAction={signOut}
      >
        {/*
         * Portal-scoped scroll-snap container. Doubling up `snap-y
         * snap-proximity` here (and on AppShell's <main>) ensures the
         * snap context is established whichever element actually owns
         * the vertical scroll on the user's viewport — desktop has the
         * sidebar pinned and content scrolling within main on tall
         * pages, mobile scrolls the body. Each <Section> in the portal
         * is a `snap-start` target by default, giving "soft stops"
         * without locking long pages from free drag-scrolling.
         */}
        <div className="snap-y snap-proximity">{children}</div>
      </AppShell>
    </TermsProvider>
  );
}

function iconFor(href: string): React.ReactNode {
  switch (href) {
    case "/portal":
      return <HomeIcon />;
    case "/portal/programs":
      return <CompassIcon />;
    case "/portal/book":
      return <CalendarIcon />;
    case "/portal/bookings":
      return <TicketIcon />;
    case "/portal/membership":
      return <MembershipIcon />;
    case "/portal/family":
      return <FamilyIcon />;
    case "/portal/payments":
      return <CardIcon />;
    case "/portal/credits":
      return <CardIcon />;
    case "/portal/classes":
      return <ClassIcon />;
    case "/portal/request-trial":
      return <ClassIcon />;
    case "/portal/inbox":
      return <InboxIcon />;
    case "/levels":
      return <TennisIcon />;
    default:
      return null;
  }
}

function describeCoverage(
  memberships: Awaited<ReturnType<typeof getMembershipsForHousehold>>,
  terms: { member: { singular: string }; membership: { singular: string } },
  hasActiveMembership: boolean,
): { subline: string; sublineHref?: string } {
  const active = memberships.filter((m) => m.status === "active");
  if (active.length === 0 || !hasActiveMembership) {
    return {
      subline: `Choose a ${terms.membership.singular.toLowerCase()} →`,
      sublineHref: "/portal/membership#buy",
    };
  }
  const slugs = new Set<string>();
  for (const m of active) for (const s of m.clubSlugs) slugs.add(s);
  const labels = Array.from(slugs).map((s) => themeBySlug(s).label);
  if (labels.length === 0) return { subline: terms.member.singular };
  if (labels.length === 1) {
    return { subline: `${terms.member.singular} · ${labels[0]}` };
  }
  return { subline: `${terms.member.singular} · ${labels.join(" + ")}` };
}

function inferTone(
  memberships: Awaited<ReturnType<typeof getMembershipsForHousehold>>,
): "triaz" | "randwijck" | "joint" | "neutral" {
  const active = memberships.filter((m) => m.status === "active");
  if (active.length === 0) return "neutral";
  const slugs = new Set<string>();
  for (const m of active) for (const s of m.clubSlugs) slugs.add(s);
  if (slugs.has("triaz") && slugs.has("randwijck")) return "joint";
  if (slugs.has("triaz")) return "triaz";
  if (slugs.has("randwijck")) return "randwijck";
  return "neutral";
}
