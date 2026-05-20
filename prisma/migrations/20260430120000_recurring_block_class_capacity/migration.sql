-- AlterEnum
ALTER TYPE "recurring_block_purpose" ADD VALUE IF NOT EXISTS 'class_capacity';

-- AlterTable
ALTER TABLE "recurring_blocks" ADD COLUMN IF NOT EXISTS "class_series_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "recurring_blocks_class_series_id_idx" ON "recurring_blocks"("class_series_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurring_blocks_class_series_id_fkey'
  ) THEN
    ALTER TABLE "recurring_blocks" ADD CONSTRAINT "recurring_blocks_class_series_id_fkey"
      FOREIGN KEY ("class_series_id") REFERENCES "class_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
