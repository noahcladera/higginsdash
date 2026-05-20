-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurring_block_scope') THEN
    CREATE TYPE "recurring_block_scope" AS ENUM ('full', 'members_only');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "recurring_blocks"
  ADD COLUMN IF NOT EXISTS "scope" "recurring_block_scope" NOT NULL DEFAULT 'full';
