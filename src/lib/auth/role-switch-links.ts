import type { ShellSwitchLink } from "@/components/portal/app-shell";
import type { PersonAccess } from "@/lib/auth/person-access";
import { DEFAULT_TERMS, type Terms } from "@/lib/tenant/terms";

/** The three shell flavours that surface cross-portal links. */
export type ShellContext = "admin" | "coach" | "portal";

/**
 * Subset of `PersonAccess` flags the helper actually uses. Lets layouts
 * pass either a full `PersonAccess` or a hand-built object built from
 * legacy guards (`requireMember`, `requireAdmin`) without an extra fetch.
 */
export interface RoleSwitchSubject {
  isAdmin: boolean;
  isCoachLike: boolean;
  isMember: boolean;
}

/**
 * Cross-portal navigation links shown in the identity dropdown of every
 * shell (admin, coach, member, levels-as-coach, levels-as-portal). Computed
 * from the resolved role flags so all shells stay in sync — fixes the bug
 * where ZZP-only coaches never saw a "Coach workspace" link in the levels
 * portal-shell branch because the old code keyed on `coach.isActive` only.
 *
 * Rules (each link only shown if the person can actually enter that portal):
 *   - `/portal` link requires admin OR (member AND not coach-like). A
 *     non-admin coach is bounced from `/portal` to `/coach`, so we don't
 *     advertise it to them.
 *   - `/coach` link requires admin OR coach-like (staff or ZZP).
 *   - `/admin` link requires admin.
 *
 * Order is fixed: Portal → Coach → Admin (with the current shell's link
 * removed). Predictable and avoids per-layout drift.
 */
export function getRoleSwitchLinks(
  subject: RoleSwitchSubject,
  current: ShellContext,
  terms?: Terms,
): ShellSwitchLink[] {
  const t = terms ?? DEFAULT_TERMS;
  const canPortal =
    subject.isAdmin || (subject.isMember && !subject.isCoachLike);
  const canCoach = subject.isAdmin || subject.isCoachLike;
  const canAdmin = subject.isAdmin;

  const links: ShellSwitchLink[] = [];
  if (canPortal && current !== "portal") {
    links.push({ href: "/portal", label: "Member portal" });
  }
  if (canCoach && current !== "coach") {
    links.push({ href: "/coach", label: `${t.coach.role} workspace` });
  }
  if (canAdmin && current !== "admin") {
    links.push({ href: "/admin", label: "Admin dashboard" });
  }
  return links;
}

/**
 * Convenience overload for call sites that have a `PersonAccess` in hand.
 */
export function getRoleSwitchLinksForAccess(
  access: PersonAccess,
  current: ShellContext,
): ShellSwitchLink[] {
  return getRoleSwitchLinks(
    {
      isAdmin: access.isAdmin,
      isCoachLike: access.isCoachLike,
      isMember: access.isMember,
    },
    current,
  );
}
