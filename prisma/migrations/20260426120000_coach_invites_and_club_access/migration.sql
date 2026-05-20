-- CreateEnum
CREATE TYPE "coach_invite_role" AS ENUM ('staff_coach', 'zzp_coach');

-- CreateTable
CREATE TABLE "coach_club_access" (
    "person_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_club_access_pkey" PRIMARY KEY ("person_id","club_id")
);

-- CreateTable
CREATE TABLE "coach_invites" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" "coach_invite_role" NOT NULL,
    "allowed_club_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_invites_token_key" ON "coach_invites"("token");

-- CreateIndex
CREATE INDEX "coach_invites_email_idx" ON "coach_invites"("email");

-- CreateIndex
CREATE INDEX "coach_invites_accepted_at_idx" ON "coach_invites"("accepted_at");

-- AddForeignKey
ALTER TABLE "coach_club_access" ADD CONSTRAINT "coach_club_access_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_club_access" ADD CONSTRAINT "coach_club_access_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_invites" ADD CONSTRAINT "coach_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_invites" ADD CONSTRAINT "coach_invites_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
