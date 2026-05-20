-- Make ClassSeries.seasonId nullable: seasons are now pure naming labels.
-- The `seasons.default_excluded_dates` column remains in the DB but is no
-- longer read or merged by the server action. Excluded dates are per-class.

ALTER TABLE "class_series" ALTER COLUMN "season_id" DROP NOT NULL;
