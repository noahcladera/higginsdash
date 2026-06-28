import { getPortalNavSections, type PortalNavSectionsArgs } from "./nav-sections";
import { getCurrentOrg } from "@/lib/tenant";

export type MobileTabId =
  | "home"
  | "book"
  | "enroll"
  | "inbox"
  | "more";

export interface PortalMobileTab {
  id: MobileTabId;
  href?: string;
  label: string;
  badge?: number;
  opensSheet?: boolean;
}

/**
 * Bottom-tab destinations for the member portal on viewports < md.
 * Mirrors persona / feature gating from {@link getPortalNavSections}.
 */
export async function getPortalMobileTabs(
  args: PortalNavSectionsArgs,
): Promise<PortalMobileTab[]> {
  const [sections, org] = await Promise.all([
    getPortalNavSections(args),
    getCurrentOrg(),
  ]);
  const f = org.features;
  const t = org.terms;
  const hasActiveMembership = args.hasActiveMembership ?? true;
  const allItems = sections.groups.flatMap((g) => g.items);

  const tabs: PortalMobileTab[] = [
    { id: "home", href: "/portal", label: "Home" },
  ];

  if (hasActiveMembership && f.courtBookings) {
    tabs.push({ id: "book", href: "/portal/book", label: "Book" });
  }

  if (f.classes) {
    tabs.push({
      id: "enroll",
      href: "/portal/programs",
      label: capitalize(t.enrollment.singular),
    });
  }

  const inboxItem = allItems.find((i) => i.href === "/portal/inbox");
  if (inboxItem) {
    tabs.push({
      id: "inbox",
      href: "/portal/inbox",
      label: "Inbox",
      badge: inboxItem.badge,
    });
  }

  tabs.push({ id: "more", label: "More", opensSheet: true });

  return tabs;
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
