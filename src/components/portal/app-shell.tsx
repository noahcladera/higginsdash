"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { cn, pickActiveHref } from "@/lib/utils";
import { navAccentClasses } from "@/lib/club-theme";
import { Wordmark } from "@/components/brand/wordmark";
import { Avatar } from "@/components/portal/avatar";
import { AuthErrorBanner } from "@/components/auth/auth-error-banner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ShellNavItem {
  href: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  /**
   * Visual emphasis hint — `"primary"` paints a tinted CTA background
   * so the link reads as the headline action in the sidebar (used for
   * "Get a membership" when the household has no coverage).
   */
  emphasis?: "primary";
  /**
   * Numeric badge rendered at the right edge (e.g. inbox unread count,
   * pending review queue size). Hidden when 0 / undefined.
   */
  badge?: number;
}

export interface ShellNavGroup {
  label: string;
  items: ShellNavItem[];
}

export interface ShellSwitchLink {
  href: string;
  label: string;
}

/** Account links opened from the sidebar identity menu. */
export interface ShellAccountMenu {
  profileHref: string;
  securityHref: string;
  /** Coaches only — staff & ZZP professional profile */
  professionalHref?: string;
}

export interface AppShellProps {
  /** Bold display label shown next to the wordmark (e.g. "Members"). */
  workspaceLabel: string;
  /**
   * Tenant-aware values for the wordmark. `brandTitle` is required —
   * server layouts always source it from `splitBrandForWordmark(brand)`
   * so the shell never has to guess at a default. `brandSubline` is
   * optional because a one-word brand may not need it.
   */
  brandTitle: string;
  brandSubline?: string;
  /**
   * Optional tenant-uploaded logo. When present, the wordmark renders
   * the image instead of the text + accent-dot wordmark on every
   * surface this shell drives (sidebar + mobile header + drawer).
   */
  brandLogoUrl?: string;
  /** Sidebar nav, grouped. */
  groups: ShellNavGroup[];
  /** Person identity card. */
  identity: {
    name: string;
    /** Subline under the name, e.g. "Member · Triaz + Randwijck". */
    subline?: string;
    /** When set, the subline renders as a link (e.g. non-member buy CTA). */
    sublineHref?: string;
    /** Tone for the avatar; defaults to derived from name. */
    avatarTone?: "triaz" | "randwijck" | "joint" | "neutral";
    /** Tone for primary nav emphasis — usually matches membership coverage. */
    navAccentTone?: "triaz" | "randwijck" | "joint" | "neutral";
  };
  /** Self-serve profile / security / coach professional — avatar dropdown. */
  accountMenu: ShellAccountMenu;
  /** Cross-portal links (admin, coach, member). Shown in the identity menu. */
  switchLinks?: ShellSwitchLink[];
  /** Sign-out form action — passed in from the server layout. */
  signOutAction: (formData?: FormData) => void | Promise<void>;
  children: React.ReactNode;
}

/*
 * AppShell — the chromed wrapper around every portal/coach page.
 *
 * Layout (≥ md):
 *   ┌──────────────────────────────────────────────┐
 *   │  Sidebar 17rem        │   Main content       │
 *   │  • Wordmark           │                      │
 *   │  • Identity menu      │   { children }       │
 *   │  • Grouped nav        │                      │
 *   └──────────────────────────────────────────────┘
 *
 * On < md, the sidebar collapses into a top bar with a drawer toggle.
 */
export function AppShell({
  workspaceLabel,
  brandTitle,
  brandSubline,
  brandLogoUrl,
  groups,
  identity,
  accountMenu,
  switchLinks = [],
  signOutAction,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen">
      {/* Mobile top bar */}
      <header
        data-print-hide
        className="glass-panel-strong sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden"
      >
        <Link href="/portal" className="flex items-center gap-2">
          <Wordmark
            size="sm"
            withSubline={false}
            title={brandTitle}
            subline={brandSubline}
            logoUrl={brandLogoUrl}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            {workspaceLabel}
          </span>
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg)] text-[var(--foreground)] shadow-[var(--highlight-inset-subtle)] hover:bg-[var(--surface-strong)]"
        >
          <MenuIcon />
        </button>
      </header>

      <div className="mx-auto flex max-w-[88rem] gap-0 md:gap-8 md:px-6 md:py-8">
        {/* Sidebar (desktop) */}
        <aside
          data-print-hide
          className="sticky top-8 hidden w-[17rem] shrink-0 self-start md:block"
        >
          <div className="glass-panel-strong rounded-[var(--radius-xl)] p-4">
            <SidebarBody
            workspaceLabel={workspaceLabel}
            brandTitle={brandTitle}
            brandSubline={brandSubline}
            brandLogoUrl={brandLogoUrl}
            groups={groups}
            identity={identity}
            accountMenu={accountMenu}
            switchLinks={switchLinks}
            signOutAction={signOutAction}
          />
          </div>
        </aside>

        {/* Main
         *
         * `snap-y snap-proximity` opts the portal in to "soft stop"
         * scroll-snap. Each <Section snap> below becomes a snap target.
         * Proximity (not mandatory) keeps drag-scrolling free; only a
         * flick that lands near a boundary nudges into place. */}
        <main className="main-ambient-bleed min-w-0 flex-1 snap-y snap-proximity px-4 py-6 sm:px-6 md:px-0 md:py-0">
          {/*
           * Surfaces denial codes from `requireAccess` redirects, e.g. a
           * member who tried to reach `/admin` lands on `/portal?error=
           * not_admin`. `signup_succeeded_signin_failed` only makes sense
           * at `/login`, so we exclude it here.
           */}
          <AuthErrorBanner
            only={[
              "not_admin",
              "not_coach",
              "not_member",
              "not_signed_in",
              "account_archived",
            ]}
          />
          {children}
        </main>
      </div>

      {/* Drawer (mobile) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--foreground)]/25 backdrop-blur-md md:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="glass-panel-strong absolute inset-y-0 left-0 w-[80%] max-w-[18rem] overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3">
              <Wordmark
                size="sm"
                title={brandTitle}
                subline={brandSubline}
                logoUrl={brandLogoUrl}
              />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg)] shadow-[var(--highlight-inset-subtle)] hover:bg-[var(--surface-strong)]"
              >
                <CloseIcon />
              </button>
            </div>
            <SidebarBody
              workspaceLabel={workspaceLabel}
              brandTitle={brandTitle}
              brandSubline={brandSubline}
              brandLogoUrl={brandLogoUrl}
              groups={groups}
              identity={identity}
              accountMenu={accountMenu}
              switchLinks={switchLinks}
              signOutAction={signOutAction}
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarBody({
  workspaceLabel,
  brandTitle,
  brandSubline,
  brandLogoUrl,
  groups,
  identity,
  accountMenu,
  switchLinks,
  signOutAction,
  compact = false,
}: {
  workspaceLabel: string;
  brandTitle: string;
  brandSubline?: string;
  brandLogoUrl?: string;
  groups: ShellNavGroup[];
  identity: AppShellProps["identity"];
  accountMenu: ShellAccountMenu;
  switchLinks: ShellSwitchLink[];
  signOutAction: AppShellProps["signOutAction"];
  compact?: boolean;
}) {
  const pathname = usePathname();
  const activeHref = pickActiveHref(
    pathname,
    groups.flatMap((g) => g.items.map((i) => i.href)),
  );
  const navAccent = navAccentClasses(
    identity.navAccentTone ?? identity.avatarTone ?? "triaz",
  );
  return (
    <div className="flex flex-col gap-6">
      {!compact && (
        <Link href="/portal" className="block">
          <div className="flex items-center gap-3">
            <Wordmark
              size="md"
              withSubline={false}
              title={brandTitle}
              subline={brandSubline}
              logoUrl={brandLogoUrl}
            />
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
            {workspaceLabel}
          </div>
        </Link>
      )}

      {/* Identity card — opens account menu */}
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          className="glass-panel w-full rounded-[var(--radius-lg)] p-4 text-left outline-none ring-offset-[var(--background)] transition-[box-shadow,transform] duration-[var(--duration-base)] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
        >
          <div className="flex items-center gap-3">
            <Avatar
              name={identity.name}
              tone={identity.avatarTone}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold leading-tight">
                {identity.name}
              </div>
              {identity.subline && (
                <div className="truncate text-xs text-[var(--muted-foreground)]">
                  {identity.sublineHref ? (
                    <Link
                      href={identity.sublineHref}
                      onClick={(e) => e.stopPropagation()}
                      className="underline-offset-4 hover:underline"
                    >
                      {identity.subline}
                    </Link>
                  ) : (
                    identity.subline
                  )}
                </div>
              )}
            </div>
            <ChevronDown
              className="size-4 shrink-0 text-[var(--muted-foreground)]"
              aria-hidden
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[14rem]" sideOffset={8}>
          <DropdownMenuItem asChild>
            <Link href={accountMenu.profileHref}>Edit profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={accountMenu.securityHref}>Security</Link>
          </DropdownMenuItem>
          {accountMenu.professionalHref && (
            <DropdownMenuItem asChild>
              <Link href={accountMenu.professionalHref}>Professional</Link>
            </DropdownMenuItem>
          )}
          {switchLinks.length > 0 && <DropdownMenuSeparator />}
          {switchLinks.map((s) => (
            <DropdownMenuItem key={s.href} asChild>
              <Link href={s.href}>{s.label}</Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="p-0 focus:bg-transparent"
            onSelect={(e) => e.preventDefault()}
          >
            <form action={signOutAction} className="w-full">
              <button
                type="submit"
                className="flex w-full cursor-default rounded-sm px-2 py-1.5 text-left text-sm text-destructive outline-none hover:bg-destructive/10"
              >
                Sign out
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Nav groups */}
      <nav className="flex flex-col gap-5">
        {groups.map((group, gi) => (
          <div key={gi}>
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                const primary = item.emphasis === "primary" && !active;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.hint}
                    /*
                     * `prefetch` is forced on for sidebar items so the
                     * RSC payload + loading.tsx for each destination
                     * is already cached by the time the user clicks.
                     * In dev, Next does not prefetch by default; in
                     * prod it only prefetches links in the viewport.
                     * Either way, marking the sidebar links as
                     * prefetch={true} cuts a few hundred ms off the
                     * perceived navigation cost on every click.
                     */
                    prefetch
                    /*
                     * Sidebar nav micro-interactions
                     * ------------------------------
                     * - `transition-[background,color]` paired with
                     *   `--duration-base` ensures the active-state
                     *   swap (when you navigate) cross-fades in
                     *   tone-locked with the rest of the language —
                     *   no hard cut between idle & selected.
                     * - The icon uses `group-hover:translate-x-0.5`
                     *   to gently lean toward the destination on
                     *   hover, telegraphing intent before the click.
                     */
                    className={cn(
                      "group inline-flex items-center gap-3 rounded-full px-3 py-2 text-sm",
                      "transition-[background-color,color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
                      active
                        ? "nav-active-glass font-medium"
                        : primary
                          ? cn(navAccent.primaryBg, navAccent.primaryText, "font-medium border border-[var(--glass-border-subtle)] shadow-[var(--highlight-inset-subtle)]", navAccent.primaryHover)
                          : "text-[var(--muted-foreground)] hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] hover:shadow-[var(--highlight-inset-subtle)]",
                    )}
                  >
                    {item.icon && (
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center",
                          "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] group-hover:translate-x-0.5",
                          active
                            ? ""
                            : primary
                              ? navAccent.primaryText
                              : "text-[var(--muted-foreground)]",
                        )}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span className="truncate">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span
                        aria-label={`${item.badge} unread`}
                        className={cn(
                          "ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                          active
                            ? "bg-[var(--background)]/40 text-[var(--foreground)]"
                            : cn(navAccent.badgeBg, "text-white"),
                        )}
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : primary ? (
                      <span
                        aria-hidden
                        className={cn("ml-auto h-1.5 w-1.5 rounded-full", navAccent.dot)}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
