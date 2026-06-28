import { getCoachShellNavGroups } from "./nav-groups";
import { getCurrentOrg } from "@/lib/tenant";

export type CoachMobileTabId =
  | "today"
  | "calendar"
  | "book"
  | "inbox"
  | "more";

export interface CoachMobileTab {
  id: CoachMobileTabId;
  href?: string;
  label: string;
  badge?: number;
  opensSheet?: boolean;
}

/**
 * Bottom-tab destinations for the coach portal on viewports < lg.
 * Primary tabs mirror the highest-traffic routes; everything else
 * lives in the More sheet (same pattern as the member portal).
 */
export async function getCoachMobileTabs(opts?: {
  unreadCount?: number;
}): Promise<CoachMobileTab[]> {
  const org = await getCurrentOrg();
  const f = org.features;
  const t = org.terms;

  const tabs: CoachMobileTab[] = [
    { id: "today", href: "/coach", label: "Today" },
    { id: "calendar", href: "/coach/calendar", label: "Calendar" },
  ];

  if (f.coachPrivateLessonInvoicing || f.courtBookings) {
    tabs.push({ id: "book", href: "/coach/book", label: t.bookVerb });
  }

  if (f.inbox) {
    tabs.push({
      id: "inbox",
      href: "/coach/inbox",
      label: "Inbox",
      badge: opts?.unreadCount,
    });
  }

  tabs.push({ id: "more", label: "More", opensSheet: true });

  return tabs;
}

/** Nav groups for the More sheet — excludes items already on the tab bar. */
export function getCoachMoreSheetGroups(opts?: {
  unreadCount?: number;
  terms?: Parameters<typeof getCoachShellNavGroups>[0] extends infer O
    ? O extends { terms?: infer T }
      ? T
      : never
    : never;
  features?: Parameters<typeof getCoachShellNavGroups>[0] extends infer O
    ? O extends { features?: infer F }
      ? F
      : never
    : never;
}) {
  const groups = getCoachShellNavGroups(opts);
  const tabHrefs = new Set([
    "/coach",
    "/coach/calendar",
    "/coach/book",
    "/coach/inbox",
  ]);

  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => !tabHrefs.has(item.href)),
    }))
    .filter((g) => g.items.length > 0);
}
