import {
  HomeIcon,
  CalendarIcon,
  TicketIcon,
  ClockIcon,
  UsersIcon,
  TennisIcon,
  InboxIcon,
} from "@/components/icons";
import type { ShellNavGroup } from "@/components/portal/app-shell";
import type { FeatureFlags, Terms } from "@/lib/tenant";
import {
  BASE_FEATURE_FLAGS,
  DEFAULT_TERMS,
  decapitalize,
} from "@/lib/tenant";

/**
 * Coach sidebar groups. Shared by `src/app/coach/(workspace)/layout.tsx`
 * and the `/levels` shell for coach-only users.
 *
 * Items are gated by feature flags so a tenant without (e.g.) court
 * bookings or private-lesson invoicing doesn't see those entries.
 * Labels read from the active org's terminology so a teacher at a
 * music-school tenant sees "My lessons" instead of "My classes".
 */
export function getCoachShellNavGroups(opts?: {
  unreadCount?: number;
  terms?: Terms;
  features?: FeatureFlags;
}): ShellNavGroup[] {
  const t = opts?.terms ?? DEFAULT_TERMS;
  const f = opts?.features ?? BASE_FEATURE_FLAGS;

  const today: ShellNavGroup["items"] = [
    { href: "/coach", label: "Today", icon: <HomeIcon /> },
    { href: "/coach/calendar", label: "Calendar", icon: <CalendarIcon /> },
  ];
  if (f.courtBookings) {
    today.push({
      href: "/coach/bookings",
      label: "My bookings",
      icon: <TicketIcon />,
    });
  }
  if (f.inbox) {
    today.push({
      href: "/coach/inbox",
      label: "Inbox",
      icon: <InboxIcon />,
      badge: opts?.unreadCount,
    });
  }

  const workspace: ShellNavGroup["items"] = [];
  if (f.coachPrivateLessonInvoicing || f.courtBookings) {
    const labelBits: string[] = [];
    if (f.coachPrivateLessonInvoicing) labelBits.push(t.privateLesson.plural);
    if (f.courtBookings) labelBits.push(t.court.plural);
    workspace.push({
      href: "/coach/book",
      label: `${t.bookVerb} ${labelBits.join(" & ").toLowerCase()}`,
      icon: <CalendarIcon />,
    });
  }
  if (f.coachAvailability) {
    workspace.push({
      href: "/coach/availability",
      label: "My availability",
      icon: <ClockIcon />,
      hint: `Weekly windows when you are usually available (${decapitalize(t.enrollVerb)} / sessions)`,
    });
  }
  if (f.coachPrivateLessonInvoicing) {
    workspace.push({ href: "/coach/hours", label: "My hours", icon: <ClockIcon /> });
    workspace.push({
      href: "/coach/receipts",
      label: "Receipts",
      icon: <TicketIcon />,
      hint: `Print your ${t.privateLesson.singular.toLowerCase()} invoices`,
    });
  }

  const classes: ShellNavGroup["items"] = [];
  if (f.classes) {
    classes.push({
      href: "/coach/classes",
      label: `My ${t.class.plural.toLowerCase()}`,
      icon: <UsersIcon />,
      hint: `Rosters and ${t.student.singular.toLowerCase()} ${t.level.plural.toLowerCase()}`,
    });
  }
  if (f.levels) {
    classes.push({
      href: "/levels",
      label: `What's my ${t.level.singular.toLowerCase()}?`,
      icon: <TennisIcon />,
      hint: `${t.level.singular} descriptions for ${t.student.plural.toLowerCase()} and ${t.member.plural.toLowerCase()}`,
    });
  }

  return [
    { label: "Today", items: today },
    { label: "Workspace", items: workspace },
    { label: t.class.plural, items: classes },
  ].filter((g) => g.items.length > 0);
}
