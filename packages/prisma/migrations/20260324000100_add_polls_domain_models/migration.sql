-- CreateEnum
CREATE TYPE "public"."PollStatus" AS ENUM ('OPEN', 'CLOSED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PollFinalizationMode" AS ENUM ('MANUAL', 'MAJORITY', 'UNANIMOUS');

-- CreateEnum
CREATE TYPE "public"."PollVisibility" AS ENUM ('PUBLIC', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "public"."PollVoteType" AS ENUM ('YES', 'NO', 'IF_NEEDED');

-- CreateTable
CREATE TABLE "public"."Poll" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "eventTypeId" INTEGER NOT NULL,
    "organizerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timeZone" TEXT NOT NULL,
    "visibility" "public"."PollVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "public"."PollStatus" NOT NULL DEFAULT 'OPEN',
    "finalizationMode" "public"."PollFinalizationMode" NOT NULL DEFAULT 'MANUAL',
    "expiresAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" INTEGER,
    "finalizedOptionId" INTEGER,
    "finalizedBookingId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PollOption" (
    "id" SERIAL NOT NULL,
    "pollId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PollParticipant" (
    "id" SERIAL NOT NULL,
    "pollId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PollVote" (
    "id" SERIAL NOT NULL,
    "pollId" INTEGER NOT NULL,
    "pollOptionId" INTEGER NOT NULL,
    "participantId" INTEGER NOT NULL,
    "voteType" "public"."PollVoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Poll_uid_key" ON "public"."Poll"("uid");

-- CreateIndex
CREATE INDEX "Poll_eventTypeId_idx" ON "public"."Poll"("eventTypeId");

-- CreateIndex
CREATE INDEX "Poll_organizerId_idx" ON "public"."Poll"("organizerId");

-- CreateIndex
CREATE INDEX "Poll_status_idx" ON "public"."Poll"("status");

-- CreateIndex
CREATE INDEX "Poll_finalizedOptionId_idx" ON "public"."Poll"("finalizedOptionId");

-- CreateIndex
CREATE INDEX "Poll_finalizedBookingId_idx" ON "public"."Poll"("finalizedBookingId");

-- CreateIndex
CREATE INDEX "PollOption_pollId_idx" ON "public"."PollOption"("pollId");

-- CreateIndex
CREATE INDEX "PollOption_pollId_position_idx" ON "public"."PollOption"("pollId", "position");

-- CreateIndex
CREATE INDEX "PollParticipant_pollId_idx" ON "public"."PollParticipant"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "PollParticipant_pollId_email_key" ON "public"."PollParticipant"("pollId", "email");

-- CreateIndex
CREATE INDEX "PollVote_pollId_idx" ON "public"."PollVote"("pollId");

-- CreateIndex
CREATE INDEX "PollVote_participantId_idx" ON "public"."PollVote"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollOptionId_participantId_key" ON "public"."PollVote"("pollOptionId", "participantId");

-- AddForeignKey
ALTER TABLE "public"."Poll" ADD CONSTRAINT "Poll_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "public"."EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Poll" ADD CONSTRAINT "Poll_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Poll" ADD CONSTRAINT "Poll_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Poll" ADD CONSTRAINT "Poll_finalizedOptionId_fkey" FOREIGN KEY ("finalizedOptionId") REFERENCES "public"."PollOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Poll" ADD CONSTRAINT "Poll_finalizedBookingId_fkey" FOREIGN KEY ("finalizedBookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "public"."Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PollParticipant" ADD CONSTRAINT "PollParticipant_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "public"."Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "public"."Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PollVote" ADD CONSTRAINT "PollVote_pollOptionId_fkey" FOREIGN KEY ("pollOptionId") REFERENCES "public"."PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PollVote" ADD CONSTRAINT "PollVote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "public"."PollParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
