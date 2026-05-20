import type { ClubSlug } from "@/lib/pricing";

/**
 * Visual identity per club, used by the membership page so a Triaz
 * membership looks unmistakably "Triaz" (emerald, outdoor grass) and a
 * Randwijck membership looks unmistakably "Randwijck" (terracotta, clay).
 *
 * The third "joint" theme handles memberships that cover both clubs.
 *
 * Themes are keyed by a slug and resolved through
 * {@link themeBySlug} / {@link themeForClubs}. Adding a new club theme
 * means adding one entry to {@link CLUB_THEME_REGISTRY} — no call-site
 * changes needed. When the `clubs.theme_tokens` JSONB column lands in
 * Pass 2b the registry lookup becomes a DB read with this registry as
 * the seed / fallback.
 *
 * All values reference the design tokens in `globals.css` so the themes
 * update with light/dark mode and stay in sync with brand colors.
 *
 * `ClubTheme` is the narrow brand-key union used by the shared tone-aware
 * primitives (Badge, Avatar, ...). It stays small so those components can
 * keep enumerating tones. When a new tenant goes live we extend this
 * union (and matching tones on Badge/Avatar) in one place; the registry
 * below and the rest of the app already accept arbitrary slugs.
 */
export type ClubTheme = "triaz" | "randwijck" | "joint";

export interface ClubThemeStyles {
  label: string;
  /** Tailwind ring class for outlines / focus rings. */
  ring: string;
  /** Background tint for cards / pills. */
  bg: string;
  /** Border for outlined elements (hairline, tinted). */
  border: string;
  /** Solid button background. */
  buttonBg: string;
  /** Hover state for the solid button. */
  buttonBgHover: string;
  /** Text color used on top of the solid button. */
  buttonText: string;
  /** Color for headings / pills. */
  accentText: string;
  /** Subtle text used in copy ("includes 1 court" etc). */
  mutedText: string;
  /** Raw color value for inline borders (e.g. left rule). */
  rawColor: string;
}

/**
 * Build a theme styles object from a CSS-variable base name. The base
 * "triaz" expands to `var(--triaz)`, `var(--triaz-soft)`,
 * `var(--triaz-ink)`, and the matching tailwind tokens. This keeps the
 * registry declarative: add a token family in `globals.css`, then one
 * entry here.
 */
function themeFromTokens(args: {
  label: string;
  base: string;
}): ClubThemeStyles {
  const { label, base } = args;
  return {
    label,
    ring: `ring-[var(--${base})]/40`,
    bg: `bg-[var(--${base}-soft)]`,
    border: `border-[var(--${base})]/40`,
    buttonBg: `bg-[var(--${base})]`,
    buttonBgHover: "hover:brightness-110",
    buttonText: "text-white",
    accentText: `text-[var(--${base}-ink)]`,
    mutedText: `text-[var(--${base}-ink)]/75`,
    rawColor: `var(--${base})`,
  };
}

/**
 * Registry of per-slug club themes. The "joint" entry is the multi-club
 * coverage theme (used when a membership covers more than one club).
 *
 * Adding a club (or renaming one) is a one-line change here — every
 * consumer reads through {@link themeBySlug}.
 */
const CLUB_THEME_REGISTRY: Record<string, ClubThemeStyles> = {
  triaz: themeFromTokens({ label: "Triaz", base: "triaz" }),
  randwijck: themeFromTokens({ label: "Randwijck", base: "randwijck" }),
  joint: themeFromTokens({ label: "Both clubs", base: "joint" }),
};

/** Fallback used when a slug isn't registered — mirrors the joint theme. */
const DEFAULT_THEME: ClubThemeStyles = CLUB_THEME_REGISTRY.joint;

/** Lookup theme styles by slug (or coverage-shape key such as `"joint"`). */
export function themeBySlug(slug: string | ClubTheme): ClubThemeStyles {
  return CLUB_THEME_REGISTRY[slug] ?? DEFAULT_THEME;
}

/** Back-compat alias — the old name `clubTheme` is still used widely. */
export function clubTheme(theme: ClubTheme): ClubThemeStyles {
  return themeBySlug(theme);
}

/** Reduce a clubs[] coverage list to its theme key. */
export function themeForClubs(clubs: ClubSlug[]): ClubTheme {
  if (clubs.length >= 2) return "joint";
  if (clubs[0] === "randwijck") return "randwijck";
  if (clubs[0] === "triaz") return "triaz";
  return "joint";
}
