import { requireCoach } from "@/lib/auth/require-coach";
import { getRoleSwitchLinks } from "@/lib/auth/role-switch-links";
import { signOut } from "../../admin/actions";
import { AppShell } from "@/components/portal/app-shell";
import { getCoachShellNavGroups } from "@/lib/coach/nav-groups";
import { getUnreadCount } from "@/lib/inbox/queries";
import {
  getCurrentOrg,
  splitBrandForWordmark,
  requireFeature,
} from "@/lib/tenant";
import { TermsProvider } from "@/components/tenant/terms-provider";

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
        identity={{
          name: displayName,
          subline: `${terms.coach.role} · ${brand.displayName}`,
          avatarTone: "triaz",
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
