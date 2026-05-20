-- Two changes in one migration:
--
--   1. Add the optional `class_series.name_override` column. Non-null
--      values are stored verbatim and the server skips the
--      `deriveSeriesName` derivation entirely. Null values mean the
--      auto-derived shape is in force.
--
--   2. Re-backfill `class_series.name` to its canonical derived shape,
--      this time with the adult-level branch (kids/mixed continue to
--      get the age suffix exactly like in
--      20260510120000_class_series_name_with_ages).
--
-- The TS source of truth lives in src/lib/classes/series-name.ts
-- (`deriveSeriesName`). Server actions recompute the name on every
-- write that mutates a name-driving input (program, season, location,
-- schedule, age band, sub-groups, eligible skill levels) — and gate
-- on `nameOverride` first via `nameForSeries` in
-- src/app/admin/classes/actions.ts. This migration brings every
-- existing row in line with the new shape so the on-disk data is
-- consistent immediately after `prisma migrate dev`.
--
-- Shape:
--   at_club  →  "{Season Year} · {Day} {HH:MM} {Venue} {kids|adults} {suffix}"
--   pickup   →  "{Season Year} · {Day} {HH:MM} {School} pickup → {Venue} {suffix}"
--   onsite   →  "{Season Year} · {Day} {HH:MM} {Venue} on-site {suffix}"
--
-- Suffix rules (mirrors `buildAgeSuffix` + `buildLevelSuffix`):
--   • Adults: 2+ non-archived sub-groups with any non-empty level set
--     → join each group's labels (`/`-joined) with ` & `; otherwise
--     fall back to the series-level levels (`&`-joined). Empty
--     everywhere → no suffix.
--   • Kids / mixed: 2+ non-archived sub-groups with any age bound →
--     join each band with ` & ` ("age 7-9 & 10-12"); otherwise the
--     series-level umbrella band ("age 5-12"). No bound → no suffix.

-- 1. Add the override column. Brand new, so no defaults to wrestle
--    with — null means "derive from parameters".
ALTER TABLE "class_series" ADD COLUMN "name_override" text;

-- 2. Re-backfill the derived name. `WHERE name_override IS NULL` is a
--    no-op today (column was just created) but keeps the SQL idempotent
--    so we can ship the same logic in any future re-run without
--    clobbering manual overrides.
UPDATE "class_series" cs
SET    name = derived.full_name
FROM (
  SELECT
    cs.id,
    BTRIM(
      regexp_replace(
        CASE
          WHEN season_label <> '' THEN season_label || ' · ' || core_with_suffix
          ELSE core_with_suffix
        END,
        '\s+',
        ' ',
        'g'
      )
    ) AS full_name
  FROM "class_series" cs
  LEFT JOIN "venues"   v  ON v.id  = cs.venue_id
  LEFT JOIN "schools"  sc ON sc.id = cs.school_id
  LEFT JOIN "seasons"  se ON se.id = cs.season_id
  LEFT JOIN "programs" p  ON p.id  = cs.program_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(
        CASE cs.day_of_week::text
          WHEN 'mon' THEN 'Mon'
          WHEN 'tue' THEN 'Tue'
          WHEN 'wed' THEN 'Wed'
          WHEN 'thu' THEN 'Thu'
          WHEN 'fri' THEN 'Fri'
          WHEN 'sat' THEN 'Sat'
          WHEN 'sun' THEN 'Sun'
          ELSE ''
        END,
        ''
      ) AS day_short,
      to_char(cs.start_time, 'HH24:MI') AS time_str,
      CASE WHEN p.target_audience::text = 'adults' THEN 'adults' ELSE 'kids' END AS audience_label,
      p.target_audience::text AS audience_raw
  ) labels
  CROSS JOIN LATERAL (
    -- Core (everything after the optional `Season · ` prefix, before
    -- the age/level suffix).
    SELECT
      CASE cs.delivery_mode::text
        WHEN 'at_club' THEN
          BTRIM(
            regexp_replace(
              concat_ws(' ', NULLIF(labels.day_short, ''), NULLIF(labels.time_str, ''), v.name, labels.audience_label),
              '\s+',
              ' ',
              'g'
            )
          )
        WHEN 'pickup' THEN
          BTRIM(
            regexp_replace(
              concat_ws(' ', NULLIF(labels.day_short, ''), NULLIF(labels.time_str, ''), sc.name || ' pickup → ' || v.name),
              '\s+',
              ' ',
              'g'
            )
          )
        WHEN 'onsite' THEN
          BTRIM(
            regexp_replace(
              concat_ws(' ', NULLIF(labels.day_short, ''), NULLIF(labels.time_str, ''), v.name || ' on-site'),
              '\s+',
              ' ',
              'g'
            )
          )
        ELSE ''
      END AS core
  ) core_calc
  CROSS JOIN LATERAL (
    -- Per-sub-group AGE bands (only when the series is actually split
    -- into 2+ live sub-groups). Each row is one band, sorted by the
    -- sub-group's display_order so the join order matches the UI.
    SELECT
      string_agg(
        CASE
          WHEN g.min_age IS NOT NULL AND g.max_age IS NOT NULL
            THEN g.min_age::text || '-' || g.max_age::text
          WHEN g.min_age IS NOT NULL THEN g.min_age::text || '+'
          WHEN g.max_age IS NOT NULL THEN 'up to ' || g.max_age::text
          ELSE NULL
        END,
        ' & '
        ORDER BY g.display_order
      ) AS group_age_suffix,
      COUNT(*) AS group_count
    FROM "class_series_groups" g
    WHERE g.class_series_id = cs.id
      AND g.archived_at IS NULL
  ) group_age_calc
  CROSS JOIN LATERAL (
    -- Series-level umbrella age band; only used when the per-group
    -- branch above produced nothing usable.
    SELECT
      CASE
        WHEN cs.min_age IS NOT NULL AND cs.max_age IS NOT NULL
          THEN cs.min_age::text || '-' || cs.max_age::text
        WHEN cs.min_age IS NOT NULL THEN cs.min_age::text || '+'
        WHEN cs.max_age IS NOT NULL THEN 'up to ' || cs.max_age::text
        ELSE ''
      END AS umbrella_band
  ) umbrella_calc
  CROSS JOIN LATERAL (
    -- Pick the effective age band. Multi-group series with any band
    -- win; otherwise fall back to the umbrella band; otherwise empty.
    SELECT
      CASE
        WHEN group_age_calc.group_count >= 2
             AND group_age_calc.group_age_suffix IS NOT NULL
             AND BTRIM(group_age_calc.group_age_suffix) <> ''
          THEN group_age_calc.group_age_suffix
        ELSE umbrella_calc.umbrella_band
      END AS effective_age_band
  ) age_calc
  CROSS JOIN LATERAL (
    -- Per-sub-group LEVEL labels (adults only). Each row collapses
    -- the group's level array to its labels joined by `/`; the
    -- per-group strings are then joined by ` & ` in display_order.
    -- Mirrors the TS `buildLevelSuffix` per-group branch.
    SELECT
      string_agg(
        per_group_label.labels,
        ' & '
        ORDER BY per_group_label.display_order
      ) AS group_level_suffix,
      COUNT(*) FILTER (
        WHERE per_group_label.labels IS NOT NULL AND per_group_label.labels <> ''
      ) AS group_with_levels_count,
      COUNT(*) AS group_count
    FROM (
      SELECT
        g.id,
        g.display_order,
        (
          SELECT string_agg(
            CASE lvl
              WHEN 'adult_beginner_beginner'     THEN 'Beginner — Beginner'
              WHEN 'adult_beginner_intermediate' THEN 'Beginner — Intermediate'
              WHEN 'adult_advanced_beginner'     THEN 'Beginner — Advanced'
              WHEN 'adult_intermediate'          THEN 'Intermediate'
              WHEN 'adult_advanced'              THEN 'Advanced'
              ELSE NULL
            END,
            '/'
            ORDER BY ord
          )
          FROM unnest(g.eligible_skill_levels::text[]) WITH ORDINALITY AS u(lvl, ord)
        ) AS labels
      FROM "class_series_groups" g
      WHERE g.class_series_id = cs.id
        AND g.archived_at IS NULL
    ) per_group_label
  ) group_level_calc
  CROSS JOIN LATERAL (
    -- Series-level umbrella level set (adults only). Plain ` & `
    -- join over the array in storage order.
    SELECT
      (
        SELECT string_agg(
          CASE lvl
            WHEN 'adult_beginner_beginner'     THEN 'Beginner — Beginner'
            WHEN 'adult_beginner_intermediate' THEN 'Beginner — Intermediate'
            WHEN 'adult_advanced_beginner'     THEN 'Beginner — Advanced'
            WHEN 'adult_intermediate'          THEN 'Intermediate'
            WHEN 'adult_advanced'              THEN 'Advanced'
            ELSE NULL
          END,
          ' & '
          ORDER BY ord
        )
        FROM unnest(cs.eligible_skill_levels::text[]) WITH ORDINALITY AS u(lvl, ord)
      ) AS series_level_suffix
  ) series_level_calc
  CROSS JOIN LATERAL (
    -- Pick the effective adult level suffix. Multi-group series with
    -- ≥1 group carrying levels win; otherwise series-level umbrella;
    -- otherwise empty.
    SELECT
      CASE
        WHEN group_level_calc.group_count >= 2
             AND group_level_calc.group_with_levels_count >= 1
             AND group_level_calc.group_level_suffix IS NOT NULL
             AND BTRIM(group_level_calc.group_level_suffix) <> ''
          THEN group_level_calc.group_level_suffix
        ELSE COALESCE(series_level_calc.series_level_suffix, '')
      END AS effective_level_suffix
  ) level_calc
  CROSS JOIN LATERAL (
    -- Adults get the level suffix, everyone else the age suffix.
    -- Both slot in after `core` exactly the same way.
    SELECT
      CASE
        WHEN labels.audience_raw = 'adults' THEN
          CASE
            WHEN level_calc.effective_level_suffix IS NULL OR level_calc.effective_level_suffix = ''
              THEN core_calc.core
            ELSE core_calc.core || ' ' || level_calc.effective_level_suffix
          END
        ELSE
          CASE
            WHEN age_calc.effective_age_band IS NULL OR age_calc.effective_age_band = ''
              THEN core_calc.core
            ELSE core_calc.core || ' age ' || age_calc.effective_age_band
          END
      END AS core_with_suffix
  ) core_with_suffix_calc
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN se.name IS NULL OR BTRIM(se.name) = '' THEN ''
        WHEN se.name ~ '\m(19|20)\d{2}\M' THEN BTRIM(se.name)
        ELSE BTRIM(se.name) || ' ' || EXTRACT(YEAR FROM cs.starts_on)::text
      END AS season_label
  ) season_calc
  -- Skip rows we can't derive a non-empty name for (missing venue,
  -- pickup with no school) — the helper bails out the same way.
  WHERE
    (
      cs.delivery_mode::text <> 'pickup'
      OR (sc.name IS NOT NULL AND v.name IS NOT NULL)
    )
    AND v.name IS NOT NULL
) derived
WHERE cs.id = derived.id
  AND derived.full_name <> ''
  AND derived.full_name IS DISTINCT FROM cs.name
  -- Manual overrides win — never clobber an admin-typed name.
  AND cs.name_override IS NULL;

-- Mirror the column comments so future schema dumps reflect the new
-- behaviour (override gate + adult-level branch).
COMMENT ON COLUMN "class_series"."name" IS
  'Auto-derived from program audience + delivery mode + venue/school + day/time + season + (adult level set OR age band, with per-sub-group splits joined by " & "). Server-only writer — gated by nameOverride via nameForSeries; helper lives in src/lib/classes/series-name.ts.';

COMMENT ON COLUMN "class_series"."name_override" IS
  'Optional manual-name escape hatch. Non-null disables auto-derivation: the server stores this string verbatim in `name` on every save. Null means the deterministic name (see deriveSeriesName) is in force.';
