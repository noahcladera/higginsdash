-- CreateTable
CREATE TABLE "coach_availability" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_availability_person_id_idx" ON "coach_availability"("person_id");

-- CreateIndex
CREATE INDEX "coach_availability_day_of_week_idx" ON "coach_availability"("day_of_week");

-- AddForeignKey
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
