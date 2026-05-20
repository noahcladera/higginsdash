-- Lock `class_series.name` to the canonical derived shape.
--
-- The TS source of truth lives in src/lib/classes/series-name.ts
-- (`deriveSeriesName`). Server actions recompute the name on every
-- create / location-edit / schedule-edit / naming-edit. This
-- migration mirrors the same logic in pure SQL and rewrites every
-- existing row so the change is visible immediately, then leaves a
-- COMMENT so future devs notice that the column is server-owned.
--
-- Shape:
--   at_club  →  "{Season Year} · {Day} {HH:MM} {Venue} {kids|adults}"
--   pickup   →  "{Season Year} · {Day} {HH:MM} {School} pickup → {Venue}"
--   onsite   →  "{Season Year} · {Day} {HH:MM} {Venue} on-site"
--
-- The season prefix is dropped when no season is set; when the season
-- label already contains a 4-digit year the year suffix is suppressed.

UPDATE "class_series" cs
SET    name = derived.full_name
FROM (
  SELECT
    cs.id,
    BTRIM(
      regexp_replace(
        CASE
          WHEN season_label <> '' THEN season_label || ' · ' || core
          ELSE core
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
      -- Day short label ("Mon", "Tue", …). Empty when day_of_week is null.
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
      -- HH:MM from the start_time (Time column).
      to_char(cs.start_time, 'HH24:MI') AS time_str,
      -- kids vs adults audience suffix (mixed → kids, matching the helper).
      CASE WHEN p.target_audience::text = 'adults' THEN 'adults' ELSE 'kids' END AS audience_label
  ) labels
  CROSS JOIN LATERAL (
    -- Core (everything after the optional `Season · ` prefix).
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
    -- Season prefix: empty when no season; reuse season name as-is when
    -- it already carries a 4-digit year; otherwise append starts_on's year.
    SELECT
      CASE
        WHEN se.name IS NULL OR BTRIM(se.name) = '' THEN ''
        WHEN se.name ~ '\m(19|20)\d{2}\M' THEN BTRIM(se.name)
        ELSE BTRIM(se.name) || ' ' || EXTRACT(YEAR FROM cs.starts_on)::text
      END AS season_label
  ) season_calc
  -- Skip rows we can't derive a non-empty name for (missing venue, etc.) —
  -- the helper bails out the same way and we don't want to clobber with ''.
  WHERE
    -- pickup needs both school + venue, every other mode just needs venue.
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
  'Auto-derived from program audience + delivery mode + venue/school + day/time + season. Written by the server only — see deriveSeriesName in src/lib/classes/series-name.ts.';
