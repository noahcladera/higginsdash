-- AlterTable
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketing_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_slug" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_images_org_slug_key_key" ON "marketing_images"("org_slug", "key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketing_images_org_slug_idx" ON "marketing_images"("org_slug");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "marketing_images" ADD CONSTRAINT "marketing_images_org_slug_fkey" FOREIGN KEY ("org_slug") REFERENCES "organizations"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
