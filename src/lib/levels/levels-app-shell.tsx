import { signOut } from "@/app/admin/actions";
import {
  AppShell,
  type ShellNavGroup,
  type ShellMobileTab,
} from "@/components/portal/app-shell";
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
  InboxIcon,
  EllipsisVerticalIcon,
} from "@/components/icons";
import { requireAuthenticated } from "@/lib/auth/require-authenticated";
import { getRoleSwitchLinks } from "@/lib/auth/role-switch-links";
import { getCoachShellNavGroups } from "@/lib/coach/nav-groups";
import { getCoachMobileTabs } from "@/lib/coach/mobile-tabs";
import { getLevelsShellKind } from "@/lib/levels/shell-kind";
import { getPortalNavSections } from "@/lib/portal/nav-sections";
import { getMembershipsForHousehold } from "@/lib/portal/queries";
import { householdHasAnyCoverage } from "@/lib/memberships/coverage";
import { getUnreadCount } from "@/lib/inbox/queries";
import { getCurrentOrg, splitBrandForWordmark } from "@/lib/tenant";
import { TermsProvider } from "@/components/tenant/terms-provider";

export async function LevelsAppShell({ children }: { children: React.ReactNode }) {
  // `requireAuthenticated` now flows through the unified `requireAccess`
  // pipeline, which means archived users go to /login?error=account_archived
  // (not the misleading ?error=not_member that this route used to emit) and
  // the resolved `person` already includes `zzpCoach` so the shell-kind
  // helper can classify ZZP-only coaches correctly.
  const { user, person, householdId } = await requireAuthenticated();
  const kind = getLevelsShellKind(person);

  const displayName =
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    "Member";

  const subject = {
    isAdmin: person.isAdmin,
    isCoachLike: !!(
      person.coach?.isActive || person.zzpCoach?.isActive
    ),
    isMember:
      !!person.student || person.isAdmin || householdId != null,
  };

  if (kind === "coach") {
    const [unreadCount, org] = await Promise.all([
      getUnreadCount(person.id),
      getCurrentOrg(),
    ]);
    const brand = org.brand;
    const terms = org.terms;
    const groups = getCoachShellNavGroups({
      unreadCount,
      terms,
      features: org.features,
    });
    const mobileTabDefs = await getCoachMobileTabs({ unreadCount });
    const mobileTabs: ShellMobileTab[] = mobileTabDefs.map((tab) => ({
      ...tab,
      icon: coachMobileTabIconFor(tab.id),
    }));
    const switchLinks = getRoleSwitchLinks(subject, "coach", terms);
    const wordmark = splitBrandForWordmark(brand);

    return (
      <TermsProvider value={terms}>
        <AppShell
          workspaceLabel={terms.coach.role}
          brandTitle={wordmark.title}
          brandSubline={wordmark.subline}
          brandLogoUrl={brand.logoUrl}
          groups={groups}
          mobileTabs={mobileTabs}
          homeHref="/coach"
          identity={{
            name: displayName,
            subline: `${terms.coach.role} · ${brand.displayName}`,
            avatarTone: "triaz",
            navAccentTone: "triaz",
          }}
          accountMenu={{
            profileHref: "/coach/profile",
            securityHref: "/coach/profile/security",
            professionalHref: "/coach/profile/professional",
          }}
          switchLinks={switchLinks}
          signOutAction={signOut}
        >
          {children}
        </AppShell>
      </TermsProvider>
    );
  }

  // Coverage gate goes through `householdHasAnyCoverage` (single source
  // of truth in coverage.ts) so an `active` row outside its
  // [startsOn, expiresOn] window doesn't light up the nav. The
  // `getMembershipsForHousehold` snapshot below is for display only —
  // theming, subline, expiry banners — and intentionally returns the
  // raw `status` string.
  const [memberships, hasActiveMembership, org] = await Promise.all([
    getMembershipsForHousehold(householdId),
    householdHasAnyCoverage(householdId),
    getCurrentOrg(),
  ]);
  const brand = org.brand;
  const terms = org.terms;

  const sections = await getPortalNavSections({
    personId: person.id,
    householdId,
    isStudent: !!person.student,
    hasActiveMembership,
  });

  const subline = describeCoverage(memberships, terms);
  const avatarTone = inferTone(memberships);

  const groups: ShellNavGroup[] = sections.groups.map((g) => ({
    label: g.label,
    items: g.items.map((it) => ({
      ...it,
      icon: iconForPortalNav(it.href),
    })),
  }));

  const switchLinks = getRoleSwitchLinks(subject, "portal", terms);
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
          avatarTone,
        }}
        accountMenu={{
          profileHref: "/portal/profile",
          securityHref: "/portal/profile/security",
        }}
        switchLinks={switchLinks}
        signOutAction={signOut}
      >
        {children}
      </AppShell>
    </TermsProvider>
  );
}

function iconForPortalNav(href: string): React.ReactNode {
  switch (href) {
    case "/portal":
      return <HomeIcon />;
    case "/portal/book":
      return <CalendarIcon />;
    case "/portal/bookings":
      return <TicketIcon />;
    case "/portal/membership":
      return <MembershipIcon />;
    case "/portal/profile":
      return <UserIcon />;
    case "/portal/family":
      return <FamilyIcon />;
    case "/portal/payments":
      return <CardIcon />;
    case "/portal/classes":
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
): string {
  const active = memberships.filter((m) => m.status === "active");
  if (active.length === 0) {
    return `Choose a ${terms.membership.singular.toLowerCase()} →`;
  }
  const slugs = new Set<string>();
  for (const m of active) for (const s of m.clubSlugs) slugs.add(s);
  if (slugs.has("triaz") && slugs.has("randwijck"))
    return `${terms.member.singular} · Triaz + Randwijck`;
  if (slugs.has("triaz")) return `${terms.member.singular} · Triaz`;
  if (slugs.has("randwijck")) return `${terms.member.singular} · Randwijck`;
  return terms.member.singular;
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

function coachMobileTabIconFor(id: string): React.ReactNode {
  switch (id) {
    case "today":
      return <HomeIcon />;
    case "calendar":
      return <CalendarIcon />;
    case "book":
      return <CalendarIcon />;
    case "inbox":
      return <InboxIcon />;
    case "more":
      return <EllipsisVerticalIcon />;
    default:
      return null;
  }
}
