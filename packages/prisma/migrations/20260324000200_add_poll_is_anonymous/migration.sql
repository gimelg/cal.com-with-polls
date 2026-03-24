-- AlterTable
ALTER TABLE "public"."Poll"
ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
