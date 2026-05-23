-- CreateEnum
CREATE TYPE "public"."SpecificMeetingStatus" AS ENUM ('scheduled', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."SpecificMeetingInviteeStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateTable
CREATE TABLE "public"."SpecificMeeting" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "eventTypeId" INTEGER NOT NULL,
    "organizerId" INTEGER NOT NULL,
    "bookingId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timeZone" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "public"."SpecificMeetingStatus" NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "SpecificMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpecificMeetingInvitee" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "specificMeetingId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "responseToken" TEXT NOT NULL,
    "status" "public"."SpecificMeetingInviteeStatus" NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SpecificMeetingInvitee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecificMeeting_uid_key" ON "public"."SpecificMeeting"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "SpecificMeeting_bookingId_key" ON "public"."SpecificMeeting"("bookingId");

-- CreateIndex
CREATE INDEX "SpecificMeeting_eventTypeId_idx" ON "public"."SpecificMeeting"("eventTypeId");

-- CreateIndex
CREATE INDEX "SpecificMeeting_organizerId_idx" ON "public"."SpecificMeeting"("organizerId");

-- CreateIndex
CREATE INDEX "SpecificMeeting_uid_idx" ON "public"."SpecificMeeting"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "SpecificMeetingInvitee_uid_key" ON "public"."SpecificMeetingInvitee"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "SpecificMeetingInvitee_responseToken_key" ON "public"."SpecificMeetingInvitee"("responseToken");

-- CreateIndex
CREATE INDEX "SpecificMeetingInvitee_specificMeetingId_idx" ON "public"."SpecificMeetingInvitee"("specificMeetingId");

-- CreateIndex
CREATE INDEX "SpecificMeetingInvitee_email_idx" ON "public"."SpecificMeetingInvitee"("email");

-- CreateIndex
CREATE INDEX "SpecificMeetingInvitee_email_specificMeetingId_idx" ON "public"."SpecificMeetingInvitee"("email", "specificMeetingId");

-- AddForeignKey
ALTER TABLE "public"."SpecificMeeting" ADD CONSTRAINT "SpecificMeeting_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "public"."EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpecificMeeting" ADD CONSTRAINT "SpecificMeeting_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpecificMeeting" ADD CONSTRAINT "SpecificMeeting_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpecificMeetingInvitee" ADD CONSTRAINT "SpecificMeetingInvitee_specificMeetingId_fkey" FOREIGN KEY ("specificMeetingId") REFERENCES "public"."SpecificMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
