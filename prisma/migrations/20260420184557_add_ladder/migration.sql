-- Adult ladder system: seasons, entries (one per player per season),
-- per-entry availability windows, matches with score reporting + court
-- booking link, and monthly awards. See plan/adult-ladder-system.

-- CreateEnum
CREATE TYPE "ladder_entry_status" AS ENUM ('active', 'withdrawn');

-- CreateEnum
CREATE TYPE "ladder_match_status" AS ENUM (
    'proposed',
    'awaiting_opponent',
    'scheduled',
    'awaiting_confirmation',
    'played',
    'cancelled',
    'disputed'
);

-- CreateEnum
CREATE TYPE "ladder_award_kind" AS ENUM ('mvp', 'most_improved', 'iron_man');

-- CreateTable
CREATE TABLE "ladder_seasons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "join_deadline" DATE,
    "entry_fee_cents" INTEGER NOT NULL DEFAULT 1500,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "challenge_range" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ladder_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_entries" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "start_position" INTEGER NOT NULL,
    "peak_position" INTEGER NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_id" UUID,
    "status" "ladder_entry_status" NOT NULL DEFAULT 'active',
    "withdrawn_at" TIMESTAMPTZ(6),
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "last_played_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ladder_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_availability" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "club_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_matches" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "challenger_entry_id" UUID NOT NULL,
    "opponent_entry_id" UUID NOT NULL,
    "status" "ladder_match_status" NOT NULL DEFAULT 'awaiting_opponent',
    "proposed_slots" TIMESTAMPTZ(6)[],
    "scheduled_at" TIMESTAMPTZ(6),
    "court_booking_id" UUID,
    "winner_entry_id" UUID,
    "score_json" JSONB,
    "reported_by_person_id" UUID,
    "reported_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "swapped" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_reason" TEXT,
    "dispute_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ladder_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_awards" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "kind" "ladder_award_kind" NOT NULL,
    "person_id" UUID NOT NULL,
    "metric_value" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ladder_seasons_slug_key" ON "ladder_seasons"("slug");

-- CreateIndex
CREATE INDEX "ladder_seasons_is_active_idx" ON "ladder_seasons"("is_active");

-- CreateIndex
CREATE INDEX "ladder_entries_season_id_idx" ON "ladder_entries"("season_id");

-- CreateIndex
CREATE INDEX "ladder_entries_person_id_idx" ON "ladder_entries"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_entries_season_id_person_id_key" ON "ladder_entries"("season_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_entries_season_id_position_key" ON "ladder_entries"("season_id", "position");

-- CreateIndex
CREATE INDEX "ladder_availability_entry_id_idx" ON "ladder_availability"("entry_id");

-- CreateIndex
CREATE INDEX "ladder_availability_day_of_week_idx" ON "ladder_availability"("day_of_week");

-- CreateIndex
CREATE INDEX "ladder_matches_season_id_status_idx" ON "ladder_matches"("season_id", "status");

-- CreateIndex
CREATE INDEX "ladder_matches_challenger_entry_id_idx" ON "ladder_matches"("challenger_entry_id");

-- CreateIndex
CREATE INDEX "ladder_matches_opponent_entry_id_idx" ON "ladder_matches"("opponent_entry_id");

-- CreateIndex
CREATE INDEX "ladder_matches_scheduled_at_idx" ON "ladder_matches"("scheduled_at");

-- CreateIndex
CREATE INDEX "ladder_awards_season_id_month_idx" ON "ladder_awards"("season_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_awards_season_id_month_kind_key" ON "ladder_awards"("season_id", "month", "kind");

-- AddForeignKey
ALTER TABLE "ladder_entries" ADD CONSTRAINT "ladder_entries_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "ladder_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_entries" ADD CONSTRAINT "ladder_entries_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_entries" ADD CONSTRAINT "ladder_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_availability" ADD CONSTRAINT "ladder_availability_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "ladder_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_availability" ADD CONSTRAINT "ladder_availability_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_matches" ADD CONSTRAINT "ladder_matches_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "ladder_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_matches" ADD CONSTRAINT "ladder_matches_challenger_entry_id_fkey" FOREIGN KEY ("challenger_entry_id") REFERENCES "ladder_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_matches" ADD CONSTRAINT "ladder_matches_opponent_entry_id_fkey" FOREIGN KEY ("opponent_entry_id") REFERENCES "ladder_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_matches" ADD CONSTRAINT "ladder_matches_winner_entry_id_fkey" FOREIGN KEY ("winner_entry_id") REFERENCES "ladder_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_matches" ADD CONSTRAINT "ladder_matches_court_booking_id_fkey" FOREIGN KEY ("court_booking_id") REFERENCES "court_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_matches" ADD CONSTRAINT "ladder_matches_reported_by_person_id_fkey" FOREIGN KEY ("reported_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_awards" ADD CONSTRAINT "ladder_awards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "ladder_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_awards" ADD CONSTRAINT "ladder_awards_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
