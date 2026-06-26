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
  InboxIcon,
} from "@/components/icons";
import { signOut } from "./actions";
import {
  getAdminPendingCounts,
  getUnreadCount,
} from "@/lib/inbox/queries";
import { getCurrentOrg, splitBrandForWordmark } from "@/lib/tenant";
import { TermsProvider } from "@/components/tenant/terms-provider";
import { SavedFlash } from "@/components/feedback/saved-flash";
import { Suspense } from "react";

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
  const programItems: ShellNavGroup["items"] = [];
  if (f.classes) {
    programItems.push({
      href: "/admin/classes",
      label: t.class.plural,
      icon: <ClassIcon size={16} />,
    });
  }
  if (f.classes) {
    programItems.push({
      href: "/admin/medals",
      label: "Medals",
      icon: <TicketIcon size={16} />,
    });
  }
  if (f.events) {
    programItems.push({
      href: "/admin/events",
      label: "Events",
      icon: <CalendarIcon size={16} />,
    });
  }
  if (f.camps) {
    programItems.push({
      href: "/admin/camps",
      label: "Camps",
      icon: <CalendarIcon size={16} />,
    });
  }
  if (f.seasons) {
    programItems.push({
      href: "/admin/seasons",
      label: t.season.plural,
      icon: <CalendarIcon size={16} />,
    });
  }

  const requestItems: ShellNavGroup["items"] = [];
  if (f.classes) {
    requestItems.push({
      href: "/admin/enrollments/reviews",
      label: "Enrollment reviews",
      icon: <TicketIcon size={16} />,
      badge: pending.enrollmentReviews,
    });
  }
  if (f.coachSubs) {
    requestItems.push({
      href: "/admin/coach-subs",
      label: "Sub requests",
      icon: <TicketIcon size={16} />,
      badge: pending.coachSubs,
    });
  }
  if (f.classTransfers) {
    requestItems.push({
      href: "/admin/transfers",
      label: "Transfer requests",
      icon: <TicketIcon size={16} />,
      badge: pending.classTransfers,
    });
  }
  if (f.trialInterest) {
    requestItems.push({
      href: "/admin/trial-interest",
      label: "Trial requests",
      icon: <TicketIcon size={16} />,
      badge: pending.trialInterests,
    });
  }

  const spacesItems: ShellNavGroup["items"] = [];
  if (f.venues) {
    spacesItems.push({
      href: "/admin/venues",
      label: t.venue.plural,
      icon: <MapPinIcon size={16} />,
    });
  }
  if (f.schoolPartnerships) {
    spacesItems.push({
      href: "/admin/schools",
      label: t.school.plural,
      icon: <MapPinIcon size={16} />,
    });
  }
  if (f.courts) {
    spacesItems.push({
      href: "/admin/courts",
      label: t.court.plural,
      icon: <CardIcon size={16} />,
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
      href: "/admin?panel=schedule",
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
    { label: "Programs", items: programItems },
    { label: "Requests", items: requestItems },
    { label: "Spaces", items: spacesItems },
    { label: t.membership.plural, items: membershipItems },
    { label: "Bookings", items: bookingItems },
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
          avatarTone: "neutral",
          navAccentTone: "triaz",
        }}
        accountMenu={{
          profileHref: "/admin/profile",
          securityHref: "/admin/profile/security",
        }}
        signOutAction={signOut}
        switchLinks={switchLinks}
        groups={groups}
      >
        <Suspense fallback={null}>
          <SavedFlash />
        </Suspense>
        {children}
      </AppShell>
    </TermsProvider>
  );
}
