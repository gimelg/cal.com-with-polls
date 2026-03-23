import { describe, expect, it, vi } from "vitest";
import type { PollFinalizeContext, PollRepository } from "../repositories/PollRepository";
import { PollFinalizeBookingService } from "./PollFinalizeBookingService";

const optionStart = new Date("2026-05-01T10:00:00.000Z");
const optionEnd = new Date("2026-05-01T10:30:00.000Z");

function buildPollContext(overrides?: Partial<PollFinalizeContext>): PollFinalizeContext {
  return {
    id: 1,
    uid: "poll_1",
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
          responses: expect.objectContaining({
            email: "alice@example.com",
            name: "Alice",
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
});
