-- AlterTable
ALTER TABLE "clubs" ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "clubs" SET "display_order" = 1 WHERE "slug" = 'triaz';
UPDATE "clubs" SET "display_order" = 2 WHERE "slug" = 'randwijck';

UPDATE "courts"
SET "name" = 'B. Borg'
WHERE "name" = 'Court 1'
  AND "club_id" = (SELECT "id" FROM "clubs" WHERE "slug" = 'randwijck');

UPDATE "courts"
SET "name" = 'J. Mcenroe'
WHERE "name" = 'Court 2'
  AND "club_id" = (SELECT "id" FROM "clubs" WHERE "slug" = 'randwijck');
