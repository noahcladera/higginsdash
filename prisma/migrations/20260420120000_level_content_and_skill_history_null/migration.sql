-- CreateEnum
CREATE TYPE "level_audience" AS ENUM ('kids', 'adults');

-- CreateTable
CREATE TABLE "level_content" (
    "skill_level" "skill_level" NOT NULL,
    "audience" "level_audience" NOT NULL,
    "title" TEXT NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT NOT NULL DEFAULT '',
    "video_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_person_id" UUID,

    CONSTRAINT "level_content_pkey" PRIMARY KEY ("skill_level")
);

-- CreateIndex
CREATE INDEX "level_content_audience_sort_order_idx" ON "level_content"("audience", "sort_order");

-- AddForeignKey
ALTER TABLE "level_content" ADD CONSTRAINT "level_content_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Allow clearing skill level in audit trail
ALTER TABLE "student_skill_history" ALTER COLUMN "to_level" DROP NOT NULL;
