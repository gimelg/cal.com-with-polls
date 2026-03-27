import { describe, expect, it, vi } from "vitest";
import type { PollFinalizeContext, PollRepository } from "../repositories/PollRepository";
import { PollFinalizeBookingService } from "./PollFinalizeBookingService";

const optionStart = new Date("2026-05-01T10:00:00.000Z");
const optionEnd = new Date("2026-05-01T10:30:00.000Z");

function buildPollContext(overrides?: Partial<PollFinalizeContext>): PollFinalizeContext {
  return {
    id: 1,
    uid: "poll_1",
    title: "Planning Poll",
    eventTypeId: 100,
    organizerId: 200,
    timeZone: "UTC",
    options: [
      {
        id: 11,
        startTime: optionStart,
        endTime: optionEnd,
        position: 0,
      },
    ],
    participants: [
      {
        id: 21,
        name: "Alice",
        email: "alice@example.com",
      },
      {
        id: 22,
        name: "Bob",
        email: "bob@example.com",
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
        participantId: 22,
        voteType: "IF_NEEDED",
      },
    ],
    eventType: {
      length: 30,
      locations: [
        {
          type: "integrations:daily_video",
        },
      ],
    },
    ...overrides,
  };
}

describe("PollFinalizeBookingService", () => {
  it("creates booking data from finalized poll option", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(buildPollContext()),
    };
    const createRegularBooking = vi.fn().mockResolvedValue({ id: 44 });

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking,
      findBookingByIdempotencyKey: vi.fn(),
      findBookingByUid: vi.fn(),
    });

    const result = await service.createBookingForFinalizedPoll({
      pollId: 1,
      pollOptionId: 11,
    });

    expect(result.bookingId).toBe(44);
    expect(createRegularBooking).toHaveBeenCalledTimes(1);
    expect(createRegularBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingMeta: {
          userId: 200,
          impersonatedByUserUuid: null,
          skipAvailabilityCheck: true,
        },
        bookingData: expect.objectContaining({
          eventTypeId: 100,
          start: optionStart.toISOString(),
          end: optionEnd.toISOString(),
          idempotencyKey: "poll-finalize:1:11",
          metadata: expect.objectContaining({
            pollUid: "poll_1",
            pollTitle: "Planning Poll",
          }),
          noEmail: false,
          responses: expect.objectContaining({
            email: "alice@example.com",
            name: "Poll participants",
            guests: ["bob@example.com"],
          }),
        }),
      })
    );
  });

  it("returns existing booking on idempotency conflict", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(buildPollContext()),
    };
    const createRegularBooking = vi.fn().mockRejectedValue(new Error("duplicate"));
    const findBookingByIdempotencyKey = vi.fn().mockResolvedValue({ id: 91 });

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking,
      findBookingByIdempotencyKey,
      findBookingByUid: vi.fn(),
      isIdempotencyConflictError: () => true,
    });

    const result = await service.createBookingForFinalizedPoll({
      pollId: 1,
      pollOptionId: 11,
    });

    expect(result.bookingId).toBe(91);
    expect(findBookingByIdempotencyKey).toHaveBeenCalledWith("poll-finalize:1:11");
  });

  it("falls back to booking lookup by poll metadata when idempotency key lookup misses", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(buildPollContext()),
    };
    const createRegularBooking = vi.fn().mockRejectedValue(new Error("duplicate"));
    const findBookingByIdempotencyKey = vi.fn().mockResolvedValue(null);
    const findBookingByPollMetadata = vi.fn().mockResolvedValue({ id: 93 });

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking,
      findBookingByIdempotencyKey,
      findBookingByPollMetadata,
      findBookingByUid: vi.fn(),
      isIdempotencyConflictError: () => true,
    });

    const result = await service.createBookingForFinalizedPoll({
      pollId: 1,
      pollOptionId: 11,
    });

    expect(result.bookingId).toBe(93);
    expect(findBookingByPollMetadata).toHaveBeenCalledWith({
      pollId: 1,
      pollOptionId: 11,
      organizerId: 200,
    });
  });

  it("recovers by metadata lookup even when error is not recognized as idempotency conflict", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(buildPollContext()),
    };
    const createRegularBooking = vi
      .fn()
      .mockRejectedValue(new Error("An error occurred while querying the database."));
    const findBookingByIdempotencyKey = vi.fn().mockResolvedValue(null);
    const findBookingByPollMetadata = vi.fn().mockResolvedValue({ id: 95 });

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking,
      findBookingByIdempotencyKey,
      findBookingByPollMetadata,
      findBookingByUid: vi.fn(),
      isIdempotencyConflictError: () => false,
    });

    const result = await service.createBookingForFinalizedPoll({
      pollId: 1,
      pollOptionId: 11,
    });

    expect(result.bookingId).toBe(95);
    expect(findBookingByPollMetadata).toHaveBeenCalledWith({
      pollId: 1,
      pollOptionId: 11,
      organizerId: 200,
    });
  });

  it("returns existing booking for prisma driverAdapter idempotency conflicts", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(buildPollContext()),
    };

    const createRegularBooking = vi.fn().mockRejectedValue({
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: {
        modelName: "Booking",
        driverAdapterError: {
          cause: {
            constraint: {
              fields: ['"idempotencyKey"'],
            },
          },
        },
      },
    });
    const findBookingByIdempotencyKey = vi.fn().mockResolvedValue({ id: 92 });

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking,
      findBookingByIdempotencyKey,
      findBookingByUid: vi.fn(),
    });

    const result = await service.createBookingForFinalizedPoll({
      pollId: 1,
      pollOptionId: 11,
    });

    expect(result.bookingId).toBe(92);
    expect(findBookingByIdempotencyKey).toHaveBeenCalledWith("poll-finalize:1:11");
  });

  it("recovers from wrapped prisma idempotency conflicts", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(buildPollContext()),
    };

    const wrappedError = new Error("An error occurred while querying the database.");
    (wrappedError as Error & { cause?: unknown }).cause = {
      code: "P2002",
      meta: {
        modelName: "Booking",
        driverAdapterError: {
          cause: {
            originalCode: "23505",
            originalMessage:
              'duplicate key value violates unique constraint "Booking_idempotencyKey_key"',
          },
        },
      },
    };

    const createRegularBooking = vi.fn().mockRejectedValue(wrappedError);
    const findBookingByIdempotencyKey = vi.fn().mockResolvedValue(null);
    const findBookingByPollMetadata = vi.fn().mockResolvedValue({ id: 94 });

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking,
      findBookingByIdempotencyKey,
      findBookingByPollMetadata,
      findBookingByUid: vi.fn(),
    });

    const result = await service.createBookingForFinalizedPoll({
      pollId: 1,
      pollOptionId: 11,
    });

    expect(result.bookingId).toBe(94);
    expect(findBookingByPollMetadata).toHaveBeenCalledWith({
      pollId: 1,
      pollOptionId: 11,
      organizerId: 200,
    });
  });

  it("throws when finalized option has no accepted participants", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(
        buildPollContext({
          votes: [
            {
              pollOptionId: 11,
              participantId: 21,
              voteType: "NO",
            },
          ],
        })
      ),
    };

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking: vi.fn(),
      findBookingByIdempotencyKey: vi.fn(),
      findBookingByUid: vi.fn(),
    });

    await expect(
      service.createBookingForFinalizedPoll({
        pollId: 1,
        pollOptionId: 11,
      })
    ).rejects.toThrow("At least one participant must vote yes or if-needed for the finalized option");
  });

  it("normalizes booking end time to event type length", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(
        buildPollContext({
          eventType: {
            length: 15,
            locations: [{ type: "integrations:daily_video" }],
          },
        })
      ),
    };
    const createRegularBooking = vi.fn().mockResolvedValue({ id: 45 });

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking,
      findBookingByIdempotencyKey: vi.fn(),
      findBookingByUid: vi.fn(),
    });

    await service.createBookingForFinalizedPoll({
      pollId: 1,
      pollOptionId: 11,
    });

    const expectedEnd = new Date(optionStart.getTime() + 15 * 60 * 1000).toISOString();

    expect(createRegularBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingData: expect.objectContaining({
          end: expectedEnd,
        }),
      })
    );
  });

  it("suppresses booking emails for name-only polls", async () => {
    const pollRepository = {
      getPollFinalizeContextById: vi.fn().mockResolvedValue(
        buildPollContext({
          participants: [
            {
              id: 21,
              name: "Participant One",
              email: "participant-100-21@poll.local",
            },
            {
              id: 22,
              name: "Participant Two",
              email: "participant-100-22@poll.local",
            },
          ],
        })
      ),
    };
    const createRegularBooking = vi.fn().mockResolvedValue({ id: 46 });

    const service = new PollFinalizeBookingService({
      pollRepository: pollRepository as unknown as PollRepository,
      createRegularBooking,
      findBookingByIdempotencyKey: vi.fn(),
      findBookingByUid: vi.fn(),
    });

    await service.createBookingForFinalizedPoll({
      pollId: 1,
      pollOptionId: 11,
    });

    expect(createRegularBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingData: expect.objectContaining({
          noEmail: true,
        }),
      })
    );
  });
});
