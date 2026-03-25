import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { Prisma } from "@calcom/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PollService } from "./PollService";

type PollRecord = {
  id: number;
  uid: string;
  title: string;
  description: string | null;
  status: "OPEN" | "CLOSED" | "FINALIZED" | "CANCELLED";
  visibility: "PUBLIC" | "INVITE_ONLY";
  isAnonymous: boolean;
  finalizationMode: "MANUAL" | "MAJORITY" | "UNANIMOUS";
  organizerId: number;
  expiresAt: Date | null;
  finalizedAt: Date | null;
  finalizedById: number | null;
  finalizedOptionId: number | null;
  finalizedBookingId: number | null;
  options: Array<{
    id: number;
    startTime: Date;
    endTime: Date;
    position: number;
  }>;
  participants: Array<{
    id: number;
    name: string;
    email: string;
  }>;
  votes: Array<{
    pollOptionId: number;
    participantId: number;
    voteType: "YES" | "NO" | "IF_NEEDED";
  }>;
};

const buildPoll = (overrides?: Partial<PollRecord>): PollRecord => {
  return {
    id: 1,
    uid: "poll_1",
    title: "Team sync",
    description: null,
    status: "OPEN",
    visibility: "PUBLIC",
    isAnonymous: false,
    finalizationMode: "MANUAL",
    organizerId: 99,
    expiresAt: null,
    finalizedAt: null,
    finalizedById: null,
    finalizedOptionId: null,
    finalizedBookingId: null,
    options: [
      {
        id: 11,
        startTime: new Date("2026-04-01T10:00:00.000Z"),
        endTime: new Date("2026-04-01T10:30:00.000Z"),
        position: 0,
      },
    ],
    participants: [
      {
        id: 21,
        name: "Alex",
        email: "participant-1-21@poll.local",
      },
      {
        id: 22,
        name: "Bianca",
        email: "participant-1-22@poll.local",
      },
      {
        id: 23,
        name: "Chris",
        email: "participant-1-23@poll.local",
      },
    ],
    votes: [
      {
        pollOptionId: 11,
        participantId: 21,
        voteType: "YES",
      },
      {
        pollOptionId: 11,
        participantId: 23,
        voteType: "IF_NEEDED",
      },
    ],
    ...overrides,
  };
};

const buildService = ({
  getPollByUid,
  getPollById,
  getPollByIdAndOrganizerId,
  finalizePoll,
  updateParticipant,
  addParticipant,
  reopenPoll,
  cancelPoll,
}: {
  getPollByUid?: ReturnType<typeof vi.fn>;
  getPollById?: ReturnType<typeof vi.fn>;
  getPollByIdAndOrganizerId?: ReturnType<typeof vi.fn>;
  finalizePoll?: ReturnType<typeof vi.fn>;
  updateParticipant?: ReturnType<typeof vi.fn>;
  addParticipant?: ReturnType<typeof vi.fn>;
  reopenPoll?: ReturnType<typeof vi.fn>;
  cancelPoll?: ReturnType<typeof vi.fn>;
}) => {
  const pollRepository = {
    getPollByUid: getPollByUid ?? vi.fn(),
    getPollById: getPollById ?? vi.fn(),
    getPollByIdAndOrganizerId: getPollByIdAndOrganizerId ?? vi.fn(),
    finalizePoll: finalizePoll ?? vi.fn(),
    updateParticipant: updateParticipant ?? vi.fn(),
    addParticipant: addParticipant ?? vi.fn(),
    reopenPoll: reopenPoll ?? vi.fn(),
    cancelPoll: cancelPoll ?? vi.fn(),
  };

  const service = new PollService({
    pollRepository: pollRepository as never,
    pollFinalizeBookingService: {
      createBookingForFinalizedPoll: vi.fn(),
    } as never,
  });

  return {
    service,
    pollRepository,
  };
};

describe("PollService", () => {
  describe("getPublicPollByUid", () => {
    it("returns only participants who already responded", async () => {
      const poll = buildPoll();
      const { service } = buildService({
        getPollByUid: vi.fn().mockResolvedValue(poll),
      });

      const result = await service.getPublicPollByUid("poll_1");

      expect(result.participantCount).toBe(2);
      expect(result.participants).toEqual([
        { id: 21, name: "Alex" },
        { id: 23, name: "Chris" },
      ]);
      expect(result.participantIdentityMode).toBe("NAME_ONLY");
    });

    it("hides public participant names when poll is anonymous", async () => {
      const poll = buildPoll({ isAnonymous: true });
      const { service } = buildService({
        getPollByUid: vi.fn().mockResolvedValue(poll),
      });

      const result = await service.getPublicPollByUid("poll_1");

      expect(result.participantCount).toBe(2);
      expect(result.participants).toEqual([
        { id: 21, name: "" },
        { id: 23, name: "" },
      ]);
    });

    it("sets participant identity mode to NAME_AND_EMAIL for invite-only polls", async () => {
      const poll = buildPoll({ visibility: "INVITE_ONLY" });
      const { service } = buildService({
        getPollByUid: vi.fn().mockResolvedValue(poll),
      });

      const result = await service.getPublicPollByUid("poll_1");

      expect(result.participantIdentityMode).toBe("NAME_AND_EMAIL");
    });
  });

  describe("updatePollParticipantForOrganizer", () => {
    it("updates invite-only participant with normalized values", async () => {
      const poll = buildPoll({
        visibility: "INVITE_ONLY",
      });
      const updatedPoll = buildPoll({
        visibility: "INVITE_ONLY",
        participants: [
          {
            id: 21,
            name: "Alex Updated",
            email: "alex@example.com",
          },
        ],
      });

      const { service, pollRepository } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(poll),
        updateParticipant: vi.fn().mockResolvedValue(updatedPoll),
      });

      const result = await service.updatePollParticipantForOrganizer({
        pollId: poll.id,
        organizerId: poll.organizerId,
        participantId: 21,
        name: "  Alex Updated  ",
        email: "  ALEX@EXAMPLE.COM  ",
      });

      expect(result).toEqual(updatedPoll);
      expect(pollRepository.updateParticipant).toHaveBeenCalledWith({
        pollId: poll.id,
        participantId: 21,
        name: "Alex Updated",
        email: "alex@example.com",
      });
    });

    it("rejects updates for non invite-only polls", async () => {
      const poll = buildPoll({ visibility: "PUBLIC" });
      const { service } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(poll),
      });

      await expect(
        service.updatePollParticipantForOrganizer({
          pollId: poll.id,
          organizerId: poll.organizerId,
          participantId: 21,
          name: "Alex",
          email: "alex@example.com",
        })
      ).rejects.toThrow("Only invite-only polls support participant updates");
    });

    it("maps duplicate participant email conflict to bad request error", async () => {
      const poll = buildPoll({ visibility: "INVITE_ONLY" });
      const duplicateError = {
        code: "P2002",
      } as Prisma.PrismaClientKnownRequestError;

      const { service } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(poll),
        updateParticipant: vi.fn().mockRejectedValue(duplicateError),
      });

      try {
        await service.updatePollParticipantForOrganizer({
          pollId: poll.id,
          organizerId: poll.organizerId,
          participantId: 21,
          name: "Alex",
          email: "alex@example.com",
        });
        throw new Error("Expected updatePollParticipantForOrganizer to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorWithCode);
        const errorWithCode = error as ErrorWithCode;
        expect(errorWithCode.code).toBe(ErrorCode.BadRequest);
        expect(errorWithCode.message).toBe("A participant with this email already exists in this poll");
      }
    });
  });

  describe("addPollParticipantForOrganizer", () => {
    it("adds invite-only participant with normalized values", async () => {
      const poll = buildPoll({ visibility: "INVITE_ONLY" });
      const updatedPoll = buildPoll({
        visibility: "INVITE_ONLY",
        participants: [
          ...poll.participants,
          {
            id: 24,
            name: "Dana",
            email: "dana@example.com",
          },
        ],
      });

      const { service, pollRepository } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(poll),
        addParticipant: vi.fn().mockResolvedValue(updatedPoll),
      });

      const result = await service.addPollParticipantForOrganizer({
        pollId: poll.id,
        organizerId: poll.organizerId,
        name: "  Dana  ",
        email: "  DANA@EXAMPLE.COM  ",
      });

      expect(result).toEqual(updatedPoll);
      expect(pollRepository.addParticipant).toHaveBeenCalledWith({
        pollId: poll.id,
        name: "Dana",
        email: "dana@example.com",
      });
    });

    it("maps duplicate participant email conflict to bad request error", async () => {
      const poll = buildPoll({ visibility: "INVITE_ONLY" });
      const duplicateError = {
        code: "P2002",
      } as Prisma.PrismaClientKnownRequestError;

      const { service } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(poll),
        addParticipant: vi.fn().mockRejectedValue(duplicateError),
      });

      try {
        await service.addPollParticipantForOrganizer({
          pollId: poll.id,
          organizerId: poll.organizerId,
          name: "Dana",
          email: "dana@example.com",
        });
        throw new Error("Expected addPollParticipantForOrganizer to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorWithCode);
        const errorWithCode = error as ErrorWithCode;
        expect(errorWithCode.code).toBe(ErrorCode.BadRequest);
        expect(errorWithCode.message).toBe("A participant with this email already exists in this poll");
      }
    });
  });

  describe("reopenPollManually", () => {
    it("reopens a closed poll", async () => {
      const closedPoll = buildPoll({ status: "CLOSED" });
      const reopenedPoll = buildPoll({ status: "OPEN" });

      const { service, pollRepository } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(closedPoll),
        reopenPoll: vi.fn().mockResolvedValue(reopenedPoll),
      });

      const result = await service.reopenPollManually({
        pollId: closedPoll.id,
        organizerId: closedPoll.organizerId,
      });

      expect(result).toEqual(reopenedPoll);
      expect(pollRepository.reopenPoll).toHaveBeenCalledWith(closedPoll.id);
    });

    it("rejects reopening a finalized poll", async () => {
      const finalizedPoll = buildPoll({ status: "FINALIZED" });
      const { service } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(finalizedPoll),
      });

      await expect(
        service.reopenPollManually({
          pollId: finalizedPoll.id,
          organizerId: finalizedPoll.organizerId,
        })
      ).rejects.toThrow("Only closed polls can be reopened");
    });
  });

  describe("cancelPollManually", () => {
    it("cancels an open poll", async () => {
      const openPoll = buildPoll({ status: "OPEN" });
      const cancelledPoll = buildPoll({ status: "CANCELLED" });

      const { service, pollRepository } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(openPoll),
        cancelPoll: vi.fn().mockResolvedValue(cancelledPoll),
      });

      const result = await service.cancelPollManually({
        pollId: openPoll.id,
        organizerId: openPoll.organizerId,
      });

      expect(result).toEqual(cancelledPoll);
      expect(pollRepository.cancelPoll).toHaveBeenCalledWith(openPoll.id);
    });

    it("rejects cancelling a finalized poll", async () => {
      const finalizedPoll = buildPoll({ status: "FINALIZED" });
      const { service } = buildService({
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(finalizedPoll),
      });

      await expect(
        service.cancelPollManually({
          pollId: finalizedPoll.id,
          organizerId: finalizedPoll.organizerId,
        })
      ).rejects.toThrow("Finalized polls cannot be cancelled");
    });
  });

  describe("poll finalized notifications", () => {
    it("sends notifications after manual finalization", async () => {
      const openPoll = buildPoll({ status: "OPEN" });
      const finalizedPoll = buildPoll({ status: "FINALIZED", finalizedOptionId: 11 });
      const onPollFinalized = vi.fn().mockResolvedValue(undefined);

      const pollRepository = {
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(openPoll),
        getPollById: vi.fn().mockResolvedValue(openPoll),
        finalizePoll: vi.fn().mockResolvedValue(finalizedPoll),
      };

      const serviceWithNotifications = new PollService({
        pollRepository: pollRepository as never,
        onFinalize: vi.fn().mockResolvedValue({ bookingId: null }),
        onPollFinalized,
      });

      const result = await serviceWithNotifications.finalizePollManually({
        pollId: openPoll.id,
        organizerId: openPoll.organizerId,
        optionId: 11,
      });

      expect(result).toEqual(finalizedPoll);
      expect(onPollFinalized).toHaveBeenCalledWith({
        pollId: openPoll.id,
        pollOptionId: 11,
      });
    });

    it("does not fail finalization when notifications fail", async () => {
      const openPoll = buildPoll({ status: "OPEN" });
      const finalizedPoll = buildPoll({ status: "FINALIZED", finalizedOptionId: 11 });
      const pollRepository = {
        getPollByIdAndOrganizerId: vi.fn().mockResolvedValue(openPoll),
        getPollById: vi.fn().mockResolvedValue(openPoll),
        finalizePoll: vi.fn().mockResolvedValue(finalizedPoll),
      };

      const service = new PollService({
        pollRepository: pollRepository as never,
        onFinalize: vi.fn().mockResolvedValue({ bookingId: null }),
        onPollFinalized: vi.fn().mockRejectedValue(new Error("email send failed")),
      });

      const result = await service.finalizePollManually({
        pollId: openPoll.id,
        organizerId: openPoll.organizerId,
        optionId: 11,
      });

      expect(result).toEqual(finalizedPoll);
    });

    it("sends notifications after auto-finalization from vote submit", async () => {
      const startingPoll = buildPoll({
        status: "OPEN",
        finalizationMode: "MAJORITY",
        participants: [{ id: 21, name: "Alex", email: "alex@example.com" }],
        votes: [],
      });

      const refreshedPoll = buildPoll({
        status: "OPEN",
        finalizationMode: "MAJORITY",
        participants: [{ id: 21, name: "Alex", email: "alex@example.com" }],
        votes: [{ pollOptionId: 11, participantId: 21, voteType: "YES" }],
      });

      const finalizedPoll = buildPoll({
        status: "FINALIZED",
        finalizationMode: "MAJORITY",
        participants: [{ id: 21, name: "Alex", email: "alex@example.com" }],
        votes: [{ pollOptionId: 11, participantId: 21, voteType: "YES" }],
        finalizedOptionId: 11,
      });

      const onPollFinalized = vi.fn().mockResolvedValue(undefined);

      const pollRepository = {
        getPollByUid: vi.fn().mockResolvedValueOnce(startingPoll).mockResolvedValueOnce(refreshedPoll),
        deleteVotesForParticipant: vi.fn().mockResolvedValue(undefined),
        upsertVote: vi.fn().mockResolvedValue({ id: 1 }),
        getPollById: vi.fn().mockResolvedValue(refreshedPoll),
        finalizePoll: vi.fn().mockResolvedValue(finalizedPoll),
      };

      const service = new PollService({
        pollRepository: pollRepository as never,
        onFinalize: vi.fn().mockResolvedValue({ bookingId: null }),
        onPollFinalized,
      });

      await service.submitVotes({
        pollUid: startingPoll.uid,
        participant: {
          name: "Alex",
          email: "alex@example.com",
        },
        votes: [{ optionId: 11, voteType: "YES" }],
      });

      expect(onPollFinalized).toHaveBeenCalledWith({
        pollId: refreshedPoll.id,
        pollOptionId: 11,
      });
    });
  });
});
