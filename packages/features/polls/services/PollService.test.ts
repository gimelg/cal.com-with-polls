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
  getPollByIdAndOrganizerId,
  updateParticipant,
}: {
  getPollByUid?: ReturnType<typeof vi.fn>;
  getPollByIdAndOrganizerId?: ReturnType<typeof vi.fn>;
  updateParticipant?: ReturnType<typeof vi.fn>;
}) => {
  const pollRepository = {
    getPollByUid: getPollByUid ?? vi.fn(),
    getPollByIdAndOrganizerId: getPollByIdAndOrganizerId ?? vi.fn(),
    updateParticipant: updateParticipant ?? vi.fn(),
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
});
