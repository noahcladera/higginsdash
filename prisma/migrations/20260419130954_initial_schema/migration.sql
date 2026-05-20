-- CreateEnum
CREATE TYPE "role_in_household" AS ENUM ('adult', 'child');

-- CreateEnum
CREATE TYPE "email_kind" AS ENUM ('personal', 'work', 'other');

-- CreateEnum
CREATE TYPE "skill_level" AS ENUM ('red_1', 'red_2', 'red_3', 'orange_1', 'orange_2', 'orange_3', 'green_1', 'green_2', 'yellow', 'adult_beginner_beginner', 'adult_beginner_intermediate', 'adult_advanced_beginner', 'adult_intermediate', 'adult_advanced');

-- CreateEnum
CREATE TYPE "student_enrollment_status" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "coach_employment_type" AS ENUM ('employee', 'freelancer');

-- CreateEnum
CREATE TYPE "club_ownership_type" AS ENUM ('owned', 'leased', 'shared');

-- CreateEnum
CREATE TYPE "court_surface" AS ENUM ('clay', 'grass', 'multi_use', 'hard', 'indoor_hard', 'other');

-- CreateEnum
CREATE TYPE "court_quality_tier" AS ENUM ('premium', 'standard', 'practice_only', 'walk_on_only');

-- CreateEnum
CREATE TYPE "membership_kind" AS ENUM ('individual', 'family');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('pending_payment', 'active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "program_target_audience" AS ENUM ('kids', 'adults', 'mixed');

-- CreateEnum
CREATE TYPE "class_type" AS ENUM ('group_lesson', 'high_performance', 'school_pickup', 'school_onsite', 'private_individual', 'private_small_group', 'camp', 'trial', 'event');

-- CreateEnum
CREATE TYPE "season_type" AS ENUM ('regular', 'camp', 'event_window', 'summer', 'holiday');

-- CreateEnum
CREATE TYPE "day_of_week" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');

-- CreateEnum
CREATE TYPE "class_series_visibility" AS ENUM ('public', 'members_only', 'private_invite', 'school_only');

-- CreateEnum
CREATE TYPE "class_series_status" AS ENUM ('draft', 'published', 'full', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "class_session_status" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "class_coach_role" AS ENUM ('lead', 'assistant');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('pending_payment', 'active', 'waitlist', 'withdrawn', 'completed');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('present', 'absent', 'late', 'excused');

-- CreateEnum
CREATE TYPE "court_booking_status" AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "court_booking_payment_status" AS ENUM ('not_required', 'pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "booking_start_time_constraint" AS ENUM ('any', 'on_the_hour', 'on_the_half_hour');

-- CreateEnum
CREATE TYPE "booking_partner_capture_mode" AS ENUM ('none', 'free_text', 'fk_member');

-- CreateEnum
CREATE TYPE "booking_confirmation_mode" AS ENUM ('member_decides', 'auto_email');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('open', 'pending', 'authorized', 'paid', 'failed', 'expired', 'canceled', 'refunded', 'charged_back');

-- CreateEnum
CREATE TYPE "school_partnership_type" AS ENUM ('pickup', 'onsite', 'both');

-- CreateEnum
CREATE TYPE "school_billing_model" AS ENUM ('parent_direct');

-- CreateEnum
CREATE TYPE "recurring_block_purpose" AS ENUM ('zzp_coach_rental', 'member_recurring', 'external_partner', 'other');

-- CreateEnum
CREATE TYPE "recurring_block_status" AS ENUM ('pending', 'approved', 'denied', 'active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('not_required', 'pending', 'sent', 'paid', 'waived');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('insert', 'update', 'delete');

-- CreateEnum
CREATE TYPE "audit_change_source" AS ENUM ('web_app', 'mobile_app', 'api', 'scheduled_job', 'webhook', 'migration', 'admin_console');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('email', 'sms', 'push', 'in_app');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('queued', 'sending', 'sent', 'failed', 'bounced');

-- CreateEnum
CREATE TYPE "mollie_refund_status" AS ENUM ('pending', 'processing', 'refunded', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "phone" TEXT,
    "password_hash" TEXT,
    "last_login_at" TIMESTAMPTZ(6),
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_addresses" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "kind" "email_kind" NOT NULL DEFAULT 'personal',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "primary_contact_person_id" UUID NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NL',
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role_in_household" "role_in_household" NOT NULL,
    "joined_household_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "person_id" UUID NOT NULL,
    "skill_level" "skill_level",
    "enrollment_status" "student_enrollment_status" NOT NULL DEFAULT 'active',
    "joined_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preferred_coach_person_id" UUID,
    "medical_notes" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "student_skill_history" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_level" "skill_level",
    "to_level" "skill_level" NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_person_id" UUID NOT NULL,
    "reason" TEXT,

    CONSTRAINT "student_skill_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaches" (
    "person_id" UUID NOT NULL,
    "employment_type" "coach_employment_type" NOT NULL,
    "default_hourly_rate" DECIMAL(10,2),
    "knltb_qualification" TEXT,
    "bio" TEXT,
    "photo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_on" DATE NOT NULL,
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "zzp_coaches" (
    "person_id" UUID NOT NULL,
    "business_name" TEXT,
    "vat_number" TEXT,
    "default_court_rental_rate" DECIMAL(10,2),
    "contract_start" DATE,
    "contract_end" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "zzp_coaches_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "kind" "membership_kind" NOT NULL,
    "starts_on" DATE NOT NULL,
    "expires_on" DATE NOT NULL,
    "status" "membership_status" NOT NULL,
    "price_paid" DECIMAL(10,2),
    "paid_at" TIMESTAMPTZ(6),
    "invoice_number" TEXT,
    "invoiced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownership_type" "club_ownership_type" NOT NULL,
    "address_line1" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NL',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courts" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "surface" "court_surface" NOT NULL,
    "quality_tier" "court_quality_tier" NOT NULL,
    "is_knltb_certified" BOOLEAN NOT NULL DEFAULT false,
    "is_bookable" BOOLEAN NOT NULL DEFAULT true,
    "is_lit" BOOLEAN NOT NULL DEFAULT false,
    "is_covered_or_indoor" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_clubs" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "target_audience" "program_target_audience" NOT NULL,
    "default_class_type" "class_type" NOT NULL,
    "description_public" TEXT,
    "description_internal" TEXT,
    "cover_image_url" TEXT,
    "is_publicly_listed" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "season_type" "season_type" NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "enrollment_opens_at" TIMESTAMPTZ(6),
    "enrollment_closes_at" TIMESTAMPTZ(6),
    "default_excluded_dates" DATE[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_series" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "class_type" "class_type" NOT NULL,
    "club_id" UUID,
    "default_court_id" UUID,
    "school_partnership_id" UUID,
    "venue_text" TEXT,
    "day_of_week" "day_of_week",
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "recurrence_rule" TEXT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "excluded_dates" DATE[],
    "max_students" INTEGER NOT NULL,
    "min_students" INTEGER,
    "waitlist_enabled" BOOLEAN NOT NULL DEFAULT true,
    "eligible_skill_levels" "skill_level"[],
    "min_age" INTEGER,
    "max_age" INTEGER,
    "visibility" "class_series_visibility" NOT NULL DEFAULT 'public',
    "enrollment_opens_at" TIMESTAMPTZ(6),
    "enrollment_closes_at" TIMESTAMPTZ(6),
    "price_per_session" DECIMAL(10,2),
    "price_per_series" DECIMAL(10,2),
    "default_coach_pay_rate" DECIMAL(10,2),
    "default_court_cost_per_session" DECIMAL(10,2),
    "status" "class_series_status" NOT NULL DEFAULT 'draft',
    "public_notes" TEXT,
    "internal_notes" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL,
    "class_series_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "court_id" UUID,
    "venue_text" TEXT,
    "status" "class_session_status" NOT NULL DEFAULT 'scheduled',
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_person_id" UUID,
    "makeup_session_id" UUID,
    "session_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_series_coaches" (
    "id" UUID NOT NULL,
    "class_series_id" UUID NOT NULL,
    "coach_person_id" UUID NOT NULL,
    "role" "class_coach_role" NOT NULL,
    "pay_rate_override" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_series_coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_session_coaches" (
    "id" UUID NOT NULL,
    "class_session_id" UUID NOT NULL,
    "coach_person_id" UUID NOT NULL,
    "role" "class_coach_role" NOT NULL,
    "is_substitute" BOOLEAN NOT NULL DEFAULT false,
    "substituting_for_person_id" UUID,
    "pay_rate_override" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_session_coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "class_series_id" UUID NOT NULL,
    "student_person_id" UUID NOT NULL,
    "status" "enrollment_status" NOT NULL DEFAULT 'pending_payment',
    "enrolled_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolled_by_person_id" UUID NOT NULL,
    "withdrawn_on" DATE,
    "withdrawal_reason" TEXT,
    "price_paid" DECIMAL(10,2),
    "payment_id" UUID,
    "internal_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "class_session_id" UUID NOT NULL,
    "student_person_id" UUID NOT NULL,
    "status" "attendance_status" NOT NULL,
    "notes" TEXT,
    "recorded_by_person_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_bookings" (
    "id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "booked_by_person_id" UUID NOT NULL,
    "booked_by_household_id" UUID NOT NULL,
    "needs_lights" BOOLEAN NOT NULL DEFAULT false,
    "price_charged" DECIMAL(10,2),
    "payment_id" UUID,
    "payment_status" "court_booking_payment_status" NOT NULL DEFAULT 'not_required',
    "status" "court_booking_status" NOT NULL DEFAULT 'confirmed',
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_person_id" UUID,
    "cancellation_reason" TEXT,
    "reminder_sent_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "court_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_booking_partners" (
    "id" UUID NOT NULL,
    "court_booking_id" UUID NOT NULL,
    "partner_name" TEXT NOT NULL,
    "person_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_booking_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_settings" (
    "club_id" UUID NOT NULL,
    "booking_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "start_time_constraint" "booking_start_time_constraint" NOT NULL DEFAULT 'on_the_hour',
    "opens_at_local_time" TIME(6) NOT NULL DEFAULT '09:00'::time,
    "closes_at_local_time" TIME(6) NOT NULL DEFAULT '22:00'::time,
    "earliest_booking_offset_minutes" INTEGER NOT NULL DEFAULT 10,
    "latest_booking_offset_days" INTEGER NOT NULL DEFAULT 7,
    "max_bookings_per_member_per_day" INTEGER NOT NULL DEFAULT 1,
    "cancellation_offset_minutes" INTEGER NOT NULL DEFAULT 10,
    "partner_capture_mode" "booking_partner_capture_mode" NOT NULL DEFAULT 'free_text',
    "min_partners" INTEGER NOT NULL DEFAULT 0,
    "max_partners" INTEGER NOT NULL DEFAULT 3,
    "allows_member_recurring_blocks" BOOLEAN NOT NULL DEFAULT false,
    "requires_payment" BOOLEAN NOT NULL DEFAULT false,
    "default_price_per_hour" DECIMAL(10,2),
    "confirmation_mode" "booking_confirmation_mode" NOT NULL DEFAULT 'member_decides',
    "daily_overview_email" TEXT,
    "reminder_offset_minutes" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("club_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "mollie_payment_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "payment_status" NOT NULL,
    "payment_method" TEXT,
    "description" TEXT NOT NULL,
    "paid_by_person_id" UUID NOT NULL,
    "paid_by_household_id" UUID NOT NULL,
    "mollie_checkout_url" TEXT,
    "mollie_webhook_payload" JSONB,
    "paid_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_lines" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "enrollment_id" UUID,
    "membership_id" UUID,
    "recurring_block_id" UUID,
    "court_booking_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_partnerships" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "partnership_type" "school_partnership_type" NOT NULL,
    "school_address" TEXT,
    "pickup_to_court_id" UUID,
    "onsite_venue_text" TEXT,
    "billing_model" "school_billing_model" NOT NULL DEFAULT 'parent_direct',
    "contact_person_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "relationship_started_on" DATE,
    "internal_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "school_partnerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_blocks" (
    "id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "requester_person_id" UUID NOT NULL,
    "requester_household_id" UUID,
    "purpose_type" "recurring_block_purpose" NOT NULL,
    "purpose_description" TEXT NOT NULL,
    "day_of_week" "day_of_week",
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "recurrence_rule" TEXT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "excluded_dates" DATE[],
    "status" "recurring_block_status" NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_person_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "denied_reason" TEXT,
    "price_quoted" DECIMAL(10,2),
    "invoice_status" "invoice_status" NOT NULL DEFAULT 'not_required',
    "invoice_number" TEXT,
    "invoice_sent_at" TIMESTAMPTZ(6),
    "payment_id" UUID,
    "activated_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_reason" TEXT,
    "cancelled_by_person_id" UUID,
    "internal_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recurring_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "table_name" TEXT NOT NULL,
    "row_id" UUID NOT NULL,
    "action" "audit_action" NOT NULL,
    "changed_by_person_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB,
    "after" JSONB,
    "change_source" "audit_change_source" NOT NULL DEFAULT 'web_app',
    "request_id" UUID,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_person_id" UUID NOT NULL,
    "recipient_email" TEXT,
    "recipient_phone" TEXT,
    "channel" "notification_channel" NOT NULL,
    "template_key" TEXT NOT NULL,
    "subject" TEXT,
    "body_text" TEXT NOT NULL,
    "body_html" TEXT,
    "related_table" TEXT,
    "related_row_id" UUID,
    "status" "notification_status" NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMPTZ(6),
    "failed_reason" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "mollie_refund_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "reason" TEXT NOT NULL,
    "processed_by_person_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mollie_status" "mollie_refund_status",
    "mollie_webhook_payload" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "people_archived_at_idx" ON "people"("archived_at");

-- CreateIndex
CREATE INDEX "people_last_name_first_name_idx" ON "people"("last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "email_addresses_address_key" ON "email_addresses"("address");

-- CreateIndex
CREATE INDEX "email_addresses_person_id_idx" ON "email_addresses"("person_id");

-- CreateIndex
CREATE INDEX "households_primary_contact_person_id_idx" ON "households"("primary_contact_person_id");

-- CreateIndex
CREATE INDEX "households_archived_at_idx" ON "households"("archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "household_members_person_id_key" ON "household_members"("person_id");

-- CreateIndex
CREATE INDEX "household_members_household_id_idx" ON "household_members"("household_id");

-- CreateIndex
CREATE INDEX "students_skill_level_idx" ON "students"("skill_level");

-- CreateIndex
CREATE INDEX "students_enrollment_status_idx" ON "students"("enrollment_status");

-- CreateIndex
CREATE INDEX "student_skill_history_student_id_changed_at_idx" ON "student_skill_history"("student_id", "changed_at");

-- CreateIndex
CREATE INDEX "coaches_is_active_idx" ON "coaches"("is_active");

-- CreateIndex
CREATE INDEX "coaches_archived_at_idx" ON "coaches"("archived_at");

-- CreateIndex
CREATE INDEX "zzp_coaches_is_active_idx" ON "zzp_coaches"("is_active");

-- CreateIndex
CREATE INDEX "zzp_coaches_archived_at_idx" ON "zzp_coaches"("archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_invoice_number_key" ON "memberships"("invoice_number");

-- CreateIndex
CREATE INDEX "memberships_household_id_idx" ON "memberships"("household_id");

-- CreateIndex
CREATE INDEX "memberships_status_idx" ON "memberships"("status");

-- CreateIndex
CREATE INDEX "memberships_expires_on_idx" ON "memberships"("expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");

-- CreateIndex
CREATE INDEX "courts_club_id_idx" ON "courts"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "courts_club_id_name_key" ON "courts"("club_id", "name");

-- CreateIndex
CREATE INDEX "membership_clubs_club_id_idx" ON "membership_clubs"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_clubs_membership_id_club_id_key" ON "membership_clubs"("membership_id", "club_id");

-- CreateIndex
CREATE UNIQUE INDEX "programs_slug_key" ON "programs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_slug_key" ON "seasons"("slug");

-- CreateIndex
CREATE INDEX "seasons_starts_on_ends_on_idx" ON "seasons"("starts_on", "ends_on");

-- CreateIndex
CREATE INDEX "class_series_program_id_idx" ON "class_series"("program_id");

-- CreateIndex
CREATE INDEX "class_series_season_id_idx" ON "class_series"("season_id");

-- CreateIndex
CREATE INDEX "class_series_club_id_idx" ON "class_series"("club_id");

-- CreateIndex
CREATE INDEX "class_series_status_idx" ON "class_series"("status");

-- CreateIndex
CREATE INDEX "class_series_starts_on_idx" ON "class_series"("starts_on");

-- CreateIndex
CREATE INDEX "class_sessions_class_series_id_idx" ON "class_sessions"("class_series_id");

-- CreateIndex
CREATE INDEX "class_sessions_starts_at_idx" ON "class_sessions"("starts_at");

-- CreateIndex
CREATE INDEX "class_sessions_status_idx" ON "class_sessions"("status");

-- CreateIndex
CREATE INDEX "class_sessions_court_id_idx" ON "class_sessions"("court_id");

-- CreateIndex
CREATE INDEX "class_series_coaches_coach_person_id_idx" ON "class_series_coaches"("coach_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_series_coaches_class_series_id_coach_person_id_key" ON "class_series_coaches"("class_series_id", "coach_person_id");

-- CreateIndex
CREATE INDEX "class_session_coaches_coach_person_id_idx" ON "class_session_coaches"("coach_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_session_coaches_class_session_id_coach_person_id_key" ON "class_session_coaches"("class_session_id", "coach_person_id");

-- CreateIndex
CREATE INDEX "enrollments_student_person_id_idx" ON "enrollments"("student_person_id");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_class_series_id_student_person_id_key" ON "enrollments"("class_series_id", "student_person_id");

-- CreateIndex
CREATE INDEX "attendance_student_person_id_idx" ON "attendance"("student_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_class_session_id_student_person_id_key" ON "attendance"("class_session_id", "student_person_id");

-- CreateIndex
CREATE INDEX "court_bookings_court_id_idx" ON "court_bookings"("court_id");

-- CreateIndex
CREATE INDEX "court_bookings_club_id_idx" ON "court_bookings"("club_id");

-- CreateIndex
CREATE INDEX "court_bookings_starts_at_idx" ON "court_bookings"("starts_at");

-- CreateIndex
CREATE INDEX "court_bookings_booked_by_person_id_idx" ON "court_bookings"("booked_by_person_id");

-- CreateIndex
CREATE INDEX "court_bookings_status_idx" ON "court_bookings"("status");

-- CreateIndex
CREATE INDEX "court_booking_partners_court_booking_id_idx" ON "court_booking_partners"("court_booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "court_booking_partners_court_booking_id_display_order_key" ON "court_booking_partners"("court_booking_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "payments_mollie_payment_id_key" ON "payments"("mollie_payment_id");

-- CreateIndex
CREATE INDEX "payments_paid_by_person_id_idx" ON "payments"("paid_by_person_id");

-- CreateIndex
CREATE INDEX "payments_paid_by_household_id_idx" ON "payments"("paid_by_household_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payment_lines_payment_id_idx" ON "payment_lines"("payment_id");

-- CreateIndex
CREATE INDEX "payment_lines_enrollment_id_idx" ON "payment_lines"("enrollment_id");

-- CreateIndex
CREATE INDEX "payment_lines_membership_id_idx" ON "payment_lines"("membership_id");

-- CreateIndex
CREATE INDEX "payment_lines_recurring_block_id_idx" ON "payment_lines"("recurring_block_id");

-- CreateIndex
CREATE INDEX "payment_lines_court_booking_id_idx" ON "payment_lines"("court_booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_partnerships_slug_key" ON "school_partnerships"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_blocks_invoice_number_key" ON "recurring_blocks"("invoice_number");

-- CreateIndex
CREATE INDEX "recurring_blocks_court_id_idx" ON "recurring_blocks"("court_id");

-- CreateIndex
CREATE INDEX "recurring_blocks_club_id_idx" ON "recurring_blocks"("club_id");

-- CreateIndex
CREATE INDEX "recurring_blocks_requester_person_id_idx" ON "recurring_blocks"("requester_person_id");

-- CreateIndex
CREATE INDEX "recurring_blocks_status_idx" ON "recurring_blocks"("status");

-- CreateIndex
CREATE INDEX "recurring_blocks_starts_on_ends_on_idx" ON "recurring_blocks"("starts_on", "ends_on");

-- CreateIndex
CREATE INDEX "audit_log_table_name_row_id_idx" ON "audit_log"("table_name", "row_id");

-- CreateIndex
CREATE INDEX "audit_log_changed_at_idx" ON "audit_log"("changed_at");

-- CreateIndex
CREATE INDEX "audit_log_changed_by_person_id_idx" ON "audit_log"("changed_by_person_id");

-- CreateIndex
CREATE INDEX "audit_log_request_id_idx" ON "audit_log"("request_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_person_id_idx" ON "notifications"("recipient_person_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_template_key_related_row_id_idx" ON "notifications"("template_key", "related_row_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_mollie_refund_id_key" ON "refunds"("mollie_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_processed_by_person_id_idx" ON "refunds"("processed_by_person_id");

-- AddForeignKey
ALTER TABLE "email_addresses" ADD CONSTRAINT "email_addresses_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_primary_contact_person_id_fkey" FOREIGN KEY ("primary_contact_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_preferred_coach_person_id_fkey" FOREIGN KEY ("preferred_coach_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skill_history" ADD CONSTRAINT "student_skill_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skill_history" ADD CONSTRAINT "student_skill_history_changed_by_person_id_fkey" FOREIGN KEY ("changed_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zzp_coaches" ADD CONSTRAINT "zzp_coaches_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courts" ADD CONSTRAINT "courts_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_clubs" ADD CONSTRAINT "membership_clubs_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_clubs" ADD CONSTRAINT "membership_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_default_court_id_fkey" FOREIGN KEY ("default_court_id") REFERENCES "courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_school_partnership_id_fkey" FOREIGN KEY ("school_partnership_id") REFERENCES "school_partnerships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_series_id_fkey" FOREIGN KEY ("class_series_id") REFERENCES "class_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_cancelled_by_person_id_fkey" FOREIGN KEY ("cancelled_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_makeup_session_id_fkey" FOREIGN KEY ("makeup_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_series_coaches" ADD CONSTRAINT "class_series_coaches_class_series_id_fkey" FOREIGN KEY ("class_series_id") REFERENCES "class_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_series_coaches" ADD CONSTRAINT "class_series_coaches_coach_person_id_fkey" FOREIGN KEY ("coach_person_id") REFERENCES "coaches"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session_coaches" ADD CONSTRAINT "class_session_coaches_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session_coaches" ADD CONSTRAINT "class_session_coaches_coach_person_id_fkey" FOREIGN KEY ("coach_person_id") REFERENCES "coaches"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session_coaches" ADD CONSTRAINT "class_session_coaches_substituting_for_person_id_fkey" FOREIGN KEY ("substituting_for_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_series_id_fkey" FOREIGN KEY ("class_series_id") REFERENCES "class_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_person_id_fkey" FOREIGN KEY ("student_person_id") REFERENCES "students"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolled_by_person_id_fkey" FOREIGN KEY ("enrolled_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_person_id_fkey" FOREIGN KEY ("student_person_id") REFERENCES "students"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_person_id_fkey" FOREIGN KEY ("recorded_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_booked_by_person_id_fkey" FOREIGN KEY ("booked_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_booked_by_household_id_fkey" FOREIGN KEY ("booked_by_household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_cancelled_by_person_id_fkey" FOREIGN KEY ("cancelled_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_partners" ADD CONSTRAINT "court_booking_partners_court_booking_id_fkey" FOREIGN KEY ("court_booking_id") REFERENCES "court_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_partners" ADD CONSTRAINT "court_booking_partners_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_person_id_fkey" FOREIGN KEY ("paid_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_household_id_fkey" FOREIGN KEY ("paid_by_household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_recurring_block_id_fkey" FOREIGN KEY ("recurring_block_id") REFERENCES "recurring_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_court_booking_id_fkey" FOREIGN KEY ("court_booking_id") REFERENCES "court_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_partnerships" ADD CONSTRAINT "school_partnerships_pickup_to_court_id_fkey" FOREIGN KEY ("pickup_to_court_id") REFERENCES "courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_requester_person_id_fkey" FOREIGN KEY ("requester_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_requester_household_id_fkey" FOREIGN KEY ("requester_household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_decided_by_person_id_fkey" FOREIGN KEY ("decided_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_cancelled_by_person_id_fkey" FOREIGN KEY ("cancelled_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_changed_by_person_id_fkey" FOREIGN KEY ("changed_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_person_id_fkey" FOREIGN KEY ("recipient_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_person_id_fkey" FOREIGN KEY ("processed_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
