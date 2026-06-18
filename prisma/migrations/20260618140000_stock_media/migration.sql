-- CreateTable
CREATE TABLE "stock_media" (
    "id" UUID NOT NULL,
    "org_slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_path" TEXT NOT NULL,
    "region" TEXT,
    "domain" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_media_source_path_key" ON "stock_media"("source_path");

-- CreateIndex
CREATE INDEX "stock_media_org_slug_display_order_idx" ON "stock_media"("org_slug", "display_order");

-- AddForeignKey
ALTER TABLE "stock_media" ADD CONSTRAINT "stock_media_org_slug_fkey" FOREIGN KEY ("org_slug") REFERENCES "organizations"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
