import { ADULT_LEVELS, type SkillLevelValue } from "@/lib/skill-levels";

/**
 * Derive a `class_series.name` from its parameters.
 *
 * The series name is no longer admin-typed by default — it's the
 * deterministic label produced from (audience, delivery mode, venue/
 * school, day, start time, season + year, age band or adult level
 * set, sub-group splits). This module is the single source of truth:
 * the create form renders a read-only preview from it, every server
 * action recomputes the name from the saved parameters, and the
 * `<ts>_class_series_name_override_and_levels` migration backfills
 * existing rows by reproducing the same logic in pure SQL.
 *
 * Shape:
 *   at_club  →  "{Season Year} · {Day} {HH:MM} {Venue} {kids|adults} {suffix}"
 *   pickup   →  "{Season Year} · {Day} {HH:MM} {School} pickup → {Venue} {suffix}"
 *   onsite   →  "{Season Year} · {Day} {HH:MM} {Venue} on-site {suffix}"
 *
 * Suffix rules (mutually exclusive — adults get level, everyone else
 * gets age):
 *   - Adults: each adult skill-level label (or each sub-group's
 *     labels) joined with " & " in displayOrder, e.g. `Intermediate`
 *     or `Beginner — Intermediate & Advanced`. Per-group label set
 *     collapses to its labels joined by `/` (e.g.
 *     `Beginner/Intermediate`). No level set on the series → no
 *     suffix; the audience word `adults` already disambiguates.
 *   - Kids / mixed: format the umbrella age band as `age 5-12` /
 *     `age 5+` / `age up to 12`; when 2+ sub-groups carry distinct
 *     bands, join each group's band with " & " (e.g.
 *     `age 7-9 & 10-12`).
 *
 * Manual overrides live on `class_series.name_override` — the server
 * short-circuits derivation when that column is non-null and stores
 * the override verbatim in `name`. This helper never sees the
 * override; the gate is `nameForSeries` in
 * `src/app/admin/classes/actions.ts`.
 *
 * The season prefix is dropped when no season is set; when the
 * season label already contains a 4-digit year, the year suffix is
 * suppressed.
 */

export type DeriveSeriesNameArgs = {
  audience: "kids" | "adults" | "mixed";
  /**
   * Translated from the form cascade's intermediate state by the
   * caller — this helper only knows about the persisted delivery mode.
   */
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueName: string | null;
  schoolName: string | null;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null;
  startTimeHHMM: string | null;
  /**
   * Optional season label ("Spring 2026", "Winter 2 2026", …). When
   * present the auto-name is prefixed with `${seasonLabel} · …`.
   */
  seasonName?: string | null;
  /** Optional starting year (e.g. 2026) appended when the season label lacks one. */
  startYear?: number | null;
  /** Series-level umbrella age band. Either side may be null. */
  seriesMinAge?: number | null;
  seriesMaxAge?: number | null;
  /**
   * Series-level eligible skill levels. Adults use this for the
   * trailing level suffix; kids/mixed ignore it.
   */
  seriesEligibleSkillLevels?: SkillLevelValue[];
  /**
   * Live sub-groups in display order. Pass an empty array (or omit)
   * for a single-group series; the helper will then fall back to the
   * series-level umbrella (age for kids/mixed, levels for adults).
   */
  groups?: Array<{
    minAge: number | null;
    maxAge: number | null;
    eligibleSkillLevels?: SkillLevelValue[];
  }>;
};

const DAY_SHORT: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const ADULT_LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  ADULT_LEVELS.map((l) => [l.value, l.label]),
);

export function deriveSeriesName(args: DeriveSeriesNameArgs): string {
  const day = args.dayOfWeek ? (DAY_SHORT[args.dayOfWeek] ?? "") : "";
  const time = args.startTimeHHMM ?? "";
  const audienceLabel = args.audience === "adults" ? "adults" : "kids";

  let core: string;
  if (args.deliveryMode === "at_club") {
    if (!args.venueName) return "";
    core = compact([day, time, args.venueName, audienceLabel].join(" "));
  } else if (args.deliveryMode === "pickup") {
    if (!args.schoolName || !args.venueName) return "";
    core = compact(
      [day, time, `${args.schoolName} pickup → ${args.venueName}`].join(" "),
    );
  } else {
    if (!args.venueName) return "";
    core = compact([day, time, `${args.venueName} on-site`].join(" "));
  }

  // Adults differentiate by skill level; everyone else by age band.
  const suffix =
    args.audience === "adults"
      ? buildLevelSuffix(
          args.seriesEligibleSkillLevels ?? [],
          args.groups ?? [],
        )
      : buildAgeSuffix(
          args.seriesMinAge ?? null,
          args.seriesMaxAge ?? null,
          args.groups ?? [],
        );
  if (suffix) core = `${core} ${suffix}`;

  const seasonLabel = buildSeasonLabel(args.seasonName, args.startYear);
  return seasonLabel ? `${seasonLabel} · ${core}` : core;
}

/**
 * @deprecated Use {@link deriveSeriesName}. Kept as an alias so any
 * forgotten import keeps building during the rollout; the next
 * cleanup pass deletes it.
 */
export const suggestSeriesName = deriveSeriesName;

function buildSeasonLabel(
  seasonName: string | null | undefined,
  startYear: number | null | undefined,
): string {
  const name = (seasonName ?? "").trim();
  if (!name) return "";
  if (/\b(19|20)\d{2}\b/.test(name)) return name;
  if (typeof startYear === "number" && Number.isFinite(startYear)) {
    return `${name} ${startYear}`;
  }
  return name;
}

/**
 * Format a single age band:
 *   (5, 12)    → "5-12"
 *   (5, null)  → "5+"
 *   (null, 12) → "up to 12"
 *   (null,null)→ ""
 */
function formatAgeBand(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}-${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `up to ${max}`;
  return "";
}

/**
 * Build the trailing "age …" suffix. Multi-group series with any
 * per-group bounds win over the series-level umbrella; otherwise
 * fall back to the series-level band.
 */
function buildAgeSuffix(
  seriesMin: number | null,
  seriesMax: number | null,
  groups: Array<{ minAge: number | null; maxAge: number | null }>,
): string {
  if (groups.length >= 2) {
    const bands = groups
      .map((g) => formatAgeBand(g.minAge, g.maxAge))
      .filter((b) => b !== "");
    if (bands.length > 0) return `age ${bands.join(" & ")}`;
  }
  const umbrella = formatAgeBand(seriesMin, seriesMax);
  return umbrella ? `age ${umbrella}` : "";
}

/**
 * Build the trailing adult level suffix. Mirrors {@link buildAgeSuffix}:
 * 2+ sub-groups with any non-empty level set win, joined with " & "
 * in `displayOrder`; each group's labels collapse to a `/`-joined
 * string (e.g. `Beginner/Intermediate`). Otherwise fall back to the
 * series-level umbrella levels. Empty everywhere → no suffix.
 */
function buildLevelSuffix(
  seriesLevels: SkillLevelValue[],
  groups: Array<{ eligibleSkillLevels?: SkillLevelValue[] }>,
): string {
  const formatGroupLabels = (levels: SkillLevelValue[]): string =>
    levels
      .map((l) => ADULT_LEVEL_LABEL[l])
      .filter((l): l is string => Boolean(l))
      .join("/");

  if (groups.length >= 2) {
    const perGroup = groups
      .map((g) => formatGroupLabels(g.eligibleSkillLevels ?? []))
      .filter((s) => s !== "");
    if (perGroup.length > 0) return perGroup.join(" & ");
  }
  const labels = seriesLevels
    .map((l) => ADULT_LEVEL_LABEL[l])
    .filter((l): l is string => Boolean(l));
  if (labels.length === 0) return "";
  return labels.join(" & ");
}

function compact(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
