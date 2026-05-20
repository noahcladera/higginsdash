import { requireAdmin } from "@/lib/auth/require-admin";
import { isPlatformSupportEmail } from "@/lib/auth/require-platform-support";
import { getRoleSwitchLinks } from "@/lib/auth/role-switch-links";
import { AppShell, type ShellNavGroup } from "@/components/portal/app-shell";
import {
  HomeIcon,
  UserIcon,
  FamilyIcon,
  ClassIcon,
  MapPinIcon,
  CalendarIcon,
  TicketIcon,
  CardIcon,
  TrophyIcon,
  InboxIcon,
} from "@/components/icons";
import { signOut } from "./actions";
import {
  getAdminPendingCounts,
  getUnreadCount,
} from "@/lib/inbox/queries";
import { getCurrentOrg, splitBrandForWordmark } from "@/lib/tenant";
import { TermsProvider } from "@/components/tenant/terms-provider";

/**
 * Admin nav blueprint.
 *
 * Every group is gated by the right feature flag, and every label reads
 * from the active org's `terms` so a music-school tenant sees "Teachers"
 * and "Studios" where a tennis tenant sees "Coaches" and "Courts".
 *
 * Empty groups are filtered before being passed to AppShell so the
 * sidebar collapses cleanly when a tenant has most features off.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, person } = await requireAdmin();
  const displayName =
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    "Admin";

  const [unread, pending, org] = await Promise.all([
    getUnreadCount(person.id),
    getAdminPendingCounts(),
    getCurrentOrg(),
  ]);

  const switchLinks = getRoleSwitchLinks(
    {
      isAdmin: person.isAdmin,
      isCoachLike: !!(
        person.coach?.isActive || person.zzpCoach?.isActive
      ),
      isMember: !!person.student || !!person.householdMember,
    },
    "admin",
    org.terms,
  );

  const f = org.features;
  const t = org.terms;

  // ─── Overview ──────────────────────────────────────────────────────────
  const overviewItems: ShellNavGroup["items"] = [
    { href: "/admin", label: "Dashboard", icon: <HomeIcon size={16} /> },
  ];
  if (f.inbox) {
    overviewItems.push({
      href: "/admin/inbox",
      label: "Inbox",
      icon: <InboxIcon size={16} />,
      badge: unread,
    });
  }

  // ─── People ────────────────────────────────────────────────────────────
  const peopleItems: ShellNavGroup["items"] = [];
  if (f.coaches) {
    peopleItems.push({
      href: "/admin/coaches",
      label: t.coach.plural,
      icon: <UserIcon size={16} />,
    });
  }
  peopleItems.push({
    href: "/admin/people",
    label: "People",
    icon: <UserIcon size={16} />,
  });
  if (f.households) {
    peopleItems.push({
      href: "/admin/households",
      label: t.household.plural,
      icon: <FamilyIcon size={16} />,
    });
  }

  // ─── Programs ──────────────────────────────────────────────────────────
  const classesItems: ShellNavGroup["items"] = [];
  if (f.classes) {
    classesItems.push({
      href: "/admin/classes",
      label: t.class.plural,
      icon: <ClassIcon size={16} />,
    });
  }
  if (f.events) {
    classesItems.push({
      href: "/admin/events",
      label: "Events",
      icon: <CalendarIcon size={16} />,
    });
  }
  if (f.seasons) {
    classesItems.push({
      href: "/admin/seasons",
      label: t.season.plural,
      icon: <CalendarIcon size={16} />,
    });
  }
  if (f.coachSubs) {
    classesItems.push({
      href: "/admin/coach-subs",
      label: "Sub requests",
      icon: <TicketIcon size={16} />,
      badge: pending.coachSubs,
    });
  }
  if (f.classTransfers) {
    classesItems.push({
      href: "/admin/transfers",
      label: "Transfer requests",
      icon: <TicketIcon size={16} />,
      badge: pending.classTransfers,
    });
  }
  if (f.trialInterest) {
    classesItems.push({
      href: "/admin/trial-interest",
      label: "Trial requests",
      icon: <TicketIcon size={16} />,
      badge: pending.trialInterests,
    });
  }
  if (f.venues) {
    classesItems.push({
      href: "/admin/venues",
      label: t.venue.plural,
      icon: <MapPinIcon size={16} />,
    });
  }
  if (f.schoolPartnerships) {
    classesItems.push({
      href: "/admin/schools",
      label: "Schools",
      icon: <MapPinIcon size={16} />,
    });
  }

  // ─── Memberships ───────────────────────────────────────────────────────
  const membershipItems: ShellNavGroup["items"] = [];
  if (f.memberships) {
    membershipItems.push({
      href: "/admin/memberships/members",
      label: t.member.plural,
      icon: <UserIcon size={16} />,
    });
    membershipItems.push({
      href: "/admin/memberships/cancellations",
      label: "Cancellations",
      icon: <TicketIcon size={16} />,
      badge: pending.membershipCancellations,
    });
  }

  // ─── Bookings ──────────────────────────────────────────────────────────
  const bookingItems: ShellNavGroup["items"] = [];
  if (f.courtBookings) {
    bookingItems.push({
      href: "/admin/bookings",
      label: "Bookings",
      icon: <CalendarIcon size={16} />,
    });
    bookingItems.push({
      href: "/admin/bookings/deletions",
      label: "Deletion approvals",
      icon: <TicketIcon size={16} />,
      badge: pending.bookingDeletions,
    });
  }
  if (f.recurringBlocks) {
    bookingItems.push({
      href: "/admin/blocks",
      label: "Blocks",
      icon: <ClassIcon size={16} />,
      badge: pending.blockRequests,
    });
  }
  if (f.ladder) {
    bookingItems.push({
      href: "/admin/ladder",
      label: t.ladder.singular,
      icon: <TrophyIcon size={16} />,
    });
  }

  // ─── Catalog (spaces) ──────────────────────────────────────────────────
  const catalogItems: ShellNavGroup["items"] = [];
  if (f.courts) {
    catalogItems.push({
      href: "/admin/courts",
      label: t.court.plural,
      icon: <CardIcon size={16} />,
    });
  }

  // ─── Finance ───────────────────────────────────────────────────────────
  const financeItems: ShellNavGroup["items"] = [];
  if (f.payments) {
    financeItems.push({
      href: "/admin/payments",
      label: f.refunds ? "Payments & refunds" : "Payments",
      icon: <CardIcon size={16} />,
      badge: pending.refundFlags,
    });
  }
  if (f.coachPrivateLessonInvoicing) {
    financeItems.push({
      href: "/admin/private-lessons",
      label: t.privateLesson.plural,
      icon: <CardIcon size={16} />,
    });
  }

  // ─── Settings (always visible — admins live here) ──────────────────────
  const settingsItems: ShellNavGroup["items"] = [
    {
      href: "/admin/settings",
      label: "Settings",
      icon: <CardIcon size={16} />,
    },
  ];
  if (f.programs) {
    settingsItems.push({
      href: "/admin/programs",
      label: t.program.plural,
      icon: <ClassIcon size={16} />,
    });
  }
  if (isPlatformSupportEmail(user.email)) {
    settingsItems.push({
      href: "/admin/support",
      label: "Platform support",
      icon: <CardIcon size={16} />,
    });
  }

  const allGroups: ShellNavGroup[] = [
    { label: "Overview", items: overviewItems },
    { label: "People", items: peopleItems },
    { label: t.class.plural, items: classesItems },
    { label: t.membership.plural, items: membershipItems },
    { label: "Bookings", items: bookingItems },
    { label: "Catalog", items: catalogItems },
    { label: "Finance", items: financeItems },
    { label: "Settings", items: settingsItems },
  ];

  const groups = allGroups.filter((g) => g.items.length > 0);
  const wordmark = splitBrandForWordmark(org.brand);

  return (
    <TermsProvider value={t}>
      <AppShell
        workspaceLabel={`Admin · ${org.brand.shortName}`}
        brandTitle={wordmark.title}
        brandSubline={wordmark.subline}
        brandLogoUrl={org.brand.logoUrl}
        identity={{
          name: displayName,
          subline: user.email ?? "Admin operator",
          avatarTone: "joint",
        }}
        accountMenu={{
          profileHref: "/admin/profile",
          securityHref: "/admin/profile/security",
        }}
        signOutAction={signOut}
        switchLinks={switchLinks}
        groups={groups}
      >
        {children}
      </AppShell>
    </TermsProvider>
  );
}
