-- Extend the auto-derived `class_series.name` to carry an
-- `age X-Y` suffix (or, for split classes, the per-sub-group bands
-- joined with ` & `).
--
-- The TS source of truth lives in src/lib/classes/series-name.ts
-- (`deriveSeriesName`). Server actions recompute the name on every
-- write that mutates a name-driving input (program, season, location,
-- schedule, age band, sub-groups). This migration backfills every
-- existing row so the on-disk shape catches up immediately.
--
-- Shape:
--   at_club  →  "{Season Year} · {Day} {HH:MM} {Venue} {kids|adults} age {band}"
--   pickup   →  "{Season Year} · {Day} {HH:MM} {School} pickup → {Venue} age {band}"
--   onsite   →  "{Season Year} · {Day} {HH:MM} {Venue} on-site age {band}"
--
-- Age suffix rules (mirrors `buildAgeSuffix` in the TS helper):
--   • 2+ non-archived sub-groups whose age bands aren't all empty →
--     join each band with ` & ` ("age 7-9 & 10-12").
--   • Otherwise fall back to the series-level umbrella band.
--   • If neither side has a bound, no suffix is appended.

UPDATE "class_series" cs
SET    name = derived.full_name
FROM (
  SELECT
    cs.id,
    BTRIM(
      regexp_replace(
        CASE
          WHEN season_label <> '' THEN season_label || ' · ' || core_with_age
          ELSE core_with_age
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
      CASE WHEN p.target_audience::text = 'adults' THEN 'adults' ELSE 'kids' END AS audience_label
  ) labels
  CROSS JOIN LATERAL (
    -- Core (everything after the optional `Season · ` prefix, before
    -- the age suffix).
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
    -- Per-sub-group age bands (only when the series is actually split
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
      ) AS group_suffix,
      COUNT(*) AS group_count
    FROM "class_series_groups" g
    WHERE g.class_series_id = cs.id
      AND g.archived_at IS NULL
  ) group_calc
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
        WHEN group_calc.group_count >= 2
             AND group_calc.group_suffix IS NOT NULL
             AND BTRIM(group_calc.group_suffix) <> ''
          THEN group_calc.group_suffix
        ELSE umbrella_calc.umbrella_band
      END AS effective_band
  ) age_calc
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN age_calc.effective_band IS NULL OR age_calc.effective_band = ''
          THEN core_calc.core
        ELSE core_calc.core || ' age ' || age_calc.effective_band
      END AS core_with_age
  ) core_with_age_calc
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
  AND derived.full_name IS DISTINCT FROM cs.name;

COMMENT ON COLUMN "class_series"."name" IS
  'Auto-derived from program audience + delivery mode + venue/school + day/time + season + age band (with per-sub-group bands joined by " & " when split). Written by the server only — see deriveSeriesName in src/lib/classes/series-name.ts.';
