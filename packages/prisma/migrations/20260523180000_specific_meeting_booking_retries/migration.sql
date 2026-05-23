-- CreateEnum
CREATE TYPE "public"."SpecificMeetingBookingStatus" AS ENUM ('not_started', 'failed', 'completed');

-- AlterTable
ALTER TABLE "public"."SpecificMeeting"
ADD COLUMN "bookingStatus" "public"."SpecificMeetingBookingStatus" NOT NULL DEFAULT 'not_started',
ADD COLUMN "bookingFailureReason" TEXT,
ADD COLUMN "bookingFailureNotifiedAt" TIMESTAMP(3),
ADD COLUMN "bookingLastAttemptAt" TIMESTAMP(3);
