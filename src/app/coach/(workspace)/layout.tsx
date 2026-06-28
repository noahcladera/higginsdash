import { requireCoach } from "@/lib/auth/require-coach";
import { getRoleSwitchLinks } from "@/lib/auth/role-switch-links";
import { signOut } from "../../admin/actions";
import {
  AppShell,
  type ShellMobileTab,
} from "@/components/portal/app-shell";
import { getCoachShellNavGroups } from "@/lib/coach/nav-groups";
import { getCoachMobileTabs } from "@/lib/coach/mobile-tabs";
import { getUnreadCount } from "@/lib/inbox/queries";
import {
  getCurrentOrg,
  splitBrandForWordmark,
  requireFeature,
} from "@/lib/tenant";
import { TermsProvider } from "@/components/tenant/terms-provider";
import {
  HomeIcon,
  CalendarIcon,
  TicketIcon,
  InboxIcon,
  EllipsisVerticalIcon,
} from "@/components/icons";

/*
 * Authenticated coach shell — AppChrome + nav. Excludes `/coach/accept-invite`.
 *
 * 404s when the tenant has the "coaches" feature off — there's no coach
 * workspace to enter if there are no coaches.
 */
export default async function CoachWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("coaches");
  const { user, person } = await requireCoach();
  const org = await getCurrentOrg();
  const brand = org.brand;
  const terms = org.terms;
  const displayName =
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    terms.coach.role;

  const unreadCount = await getUnreadCount(person.id);
  const groups = getCoachShellNavGroups({ unreadCount, terms, features: org.features });
  const mobileTabDefs = await getCoachMobileTabs({ unreadCount });

  const mobileTabs: ShellMobileTab[] = mobileTabDefs.map((tab) => ({
    ...tab,
    icon: coachMobileTabIconFor(tab.id),
  }));

  const switchLinks = getRoleSwitchLinks(
    {
      isAdmin: person.isAdmin,
      isCoachLike: !!(
        person.coach?.isActive || person.zzpCoach?.isActive
      ),
      isMember: false,
    },
    "coach",
    org.terms,
  );

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
