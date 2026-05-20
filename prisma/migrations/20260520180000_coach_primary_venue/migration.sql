-- Optional default venue for staff coaches (nullable; safe for existing rows).

ALTER TABLE "coaches" ADD COLUMN "primary_venue_id" UUID;

ALTER TABLE "coaches" ADD CONSTRAINT "coaches_primary_venue_id_fkey" FOREIGN KEY ("primary_venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "coaches_primary_venue_id_idx" ON "coaches"("primary_venue_id");
