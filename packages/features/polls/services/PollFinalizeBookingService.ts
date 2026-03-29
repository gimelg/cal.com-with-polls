import {
  CalVideoLocationType,
  getLocationValueForDB,
  isAttendeeInputRequired,
  OrganizerDefaultConferencingAppType,
} from "@calcom/app-store/locations";
import { getRegularBookingService } from "@calcom/features/bookings/di/RegularBookingService.container";
import type { CreateRegularBookingData } from "@calcom/features/bookings/lib/dto/types";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { eventTypeLocations } from "@calcom/prisma/zod-utils";
import type { PollVoteType } from "../lib/poll-types";
import { isPollAliasEmail } from "../lib/poll-types";
import { PollRepository } from "../repositories/PollRepository";

type FinalizePollInput = {
  pollId: number;
  pollOptionId: number;
};

type FinalizePollOutput = {
  bookingId: number | null;
};

type PollBookingCreateResult = {
  id?: number | null;
  uid?: string | null;
};

type PollFinalizeBookingServiceDeps = {
  pollRepository?: PollRepository;
  createRegularBooking?: (input: {
    bookingData: CreateRegularBookingData;
    bookingMeta: {
      userId: number;
      impersonatedByUserUuid: null;
      skipAvailabilityCheck?: boolean;
    };
  }) => Promise<PollBookingCreateResult>;
  findBookingByIdempotencyKey?: (idempotencyKey: string) => Promise<{ id: number } | null>;
  findBookingByPollMetadata?: (input: {
    pollId: number;
    pollOptionId: number;
    organizerId: number;
  }) => Promise<{ id: number } | null>;
  findBookingByUid?: (uid: string) => Promise<{ id: number } | null>;
  isIdempotencyConflictError?: (error: unknown) => boolean;
  isBookingConflictError?: (error: unknown) => boolean;
};

const YES_OR_IF_NEEDED: PollVoteType[] = ["YES", "IF_NEEDED"];
const POLL_ATTENDEE_NAME = "Poll participants";

function defaultIsIdempotencyConflictError(error: unknown): boolean {
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) {
      continue;
    }

    visited.add(candidate);

    const knownRequestError = candidate as Partial<Prisma.PrismaClientKnownRequestError> & {
      code?: unknown;
      meta?: unknown;
      cause?: unknown;
    };

    if (knownRequestError.code === "P2002") {
      const serialized = JSON.stringify(knownRequestError.meta || candidate);
      if (serialized.includes("idempotencyKey") || serialized.includes("Booking_idempotencyKey_key")) {
        return true;
      }
    }

    if (knownRequestError.cause) {
      queue.push(knownRequestError.cause);
    }
  }

  return false;
}

function defaultIsBookingConflictError(error: unknown): boolean {
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) {
      continue;
    }

    visited.add(candidate);

    if (candidate instanceof ErrorWithCode && candidate.code === ErrorCode.BookingConflict) {
      return true;
    }

    const candidateError = candidate as {
      code?: unknown;
      message?: unknown;
      statusCode?: unknown;
      cause?: unknown;
    };

    if (
      candidateError.code === ErrorCode.BookingConflict ||
      candidateError.message === ErrorCode.BookingConflict
    ) {
      return true;
    }

    if (candidateError.statusCode === 409 && candidateError.message === ErrorCode.BookingConflict) {
      return true;
    }

    if (
      candidateError.statusCode === 400 &&
      candidateError.message === "An error occurred while querying the database."
    ) {
      return true;
    }

    if (candidateError.cause) {
      queue.push(candidateError.cause);
    }
  }

  return false;
}

export class PollFinalizeBookingService {
  private readonly pollRepository: PollRepository;
  private readonly createRegularBooking: NonNullable<PollFinalizeBookingServiceDeps["createRegularBooking"]>;
  private readonly findBookingByIdempotencyKey: NonNullable<
    PollFinalizeBookingServiceDeps["findBookingByIdempotencyKey"]
  >;
  private readonly findBookingByPollMetadata: NonNullable<
    PollFinalizeBookingServiceDeps["findBookingByPollMetadata"]
  >;
  private readonly findBookingByUid: NonNullable<PollFinalizeBookingServiceDeps["findBookingByUid"]>;
  private readonly isIdempotencyConflictError: NonNullable<
    PollFinalizeBookingServiceDeps["isIdempotencyConflictError"]
  >;
  private readonly isBookingConflictError: NonNullable<
    PollFinalizeBookingServiceDeps["isBookingConflictError"]
  >;

  constructor(deps?: PollFinalizeBookingServiceDeps) {
    this.pollRepository = deps?.pollRepository ?? PollRepository.create();
    this.createRegularBooking =
      deps?.createRegularBooking ??
      (async (
        input: Parameters<NonNullable<PollFinalizeBookingServiceDeps["createRegularBooking"]>>[0]
      ): Promise<PollBookingCreateResult> => {
        const regularBookingService = getRegularBookingService();
        return await regularBookingService.createBooking(input);
      });
    this.findBookingByIdempotencyKey =
      deps?.findBookingByIdempotencyKey ??
      (async (idempotencyKey: string): Promise<{ id: number } | null> => {
        return await prisma.booking.findUnique({
          where: {
            idempotencyKey,
          },
          select: {
            id: true,
          },
        });
      });
    this.findBookingByPollMetadata =
      deps?.findBookingByPollMetadata ??
      (async ({
        pollId,
        pollOptionId,
        organizerId,
      }: Parameters<NonNullable<PollFinalizeBookingServiceDeps["findBookingByPollMetadata"]>>[0]): Promise<{
        id: number;
      } | null> => {
        return await prisma.booking.findFirst({
          where: {
            userId: organizerId,
            metadata: {
              path: ["pollId"],
              equals: String(pollId),
            },
            AND: [
              {
                metadata: {
                  path: ["pollOptionId"],
                  equals: String(pollOptionId),
                },
              },
            ],
          },
          orderBy: {
            id: "desc",
          },
          select: {
            id: true,
          },
        });
      });
    this.findBookingByUid =
      deps?.findBookingByUid ??
      (async (uid: string): Promise<{ id: number } | null> => {
        return await prisma.booking.findUnique({
          where: {
            uid,
          },
          select: {
            id: true,
          },
        });
      });
    this.isIdempotencyConflictError = deps?.isIdempotencyConflictError ?? defaultIsIdempotencyConflictError;
    this.isBookingConflictError = deps?.isBookingConflictError ?? defaultIsBookingConflictError;
  }

  async createBookingForFinalizedPoll(input: FinalizePollInput): Promise<FinalizePollOutput> {
    const poll = await this.pollRepository.getPollFinalizeContextById(input.pollId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    const pollOption = poll.options.find((option) => option.id === input.pollOptionId);
    if (!pollOption) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Poll option does not belong to poll");
    }

    const participantIds = new Set(
      poll.votes
        .filter(
          (vote) => vote.pollOptionId === input.pollOptionId && YES_OR_IF_NEEDED.includes(vote.voteType)
        )
        .map((vote) => vote.participantId)
    );

    const participants = poll.participants.filter((participant) => participantIds.has(participant.id));
    if (participants.length === 0) {
      throw new ErrorWithCode(
        ErrorCode.BadRequest,
        "At least one participant must vote yes or if-needed for the finalized option"
      );
    }

    const [primaryParticipant, ...guestParticipants] = participants;
    const locationValue = this.resolveLocationValue(poll.eventType.locations);
    const idempotencyKey = `poll-finalize:${poll.id}:${pollOption.id}`;
    const normalizedEnd = new Date(pollOption.startTime.getTime() + poll.eventType.length * 60 * 1000);
    const shouldSuppressBookingEmails = participants.every((participant) =>
      isPollAliasEmail(participant.email)
    );

    const responses: Record<string, unknown> = {
      email: primaryParticipant.email,
      name: POLL_ATTENDEE_NAME,
      guests: guestParticipants.map((participant) => participant.email),
    };

    if (locationValue) {
      responses.location = {
        optionValue: locationValue,
        value: locationValue,
      };
    }

    const bookingData: CreateRegularBookingData & {
      responses: Record<string, unknown>;
      idempotencyKey: string;
    } = {
      eventTypeId: poll.eventTypeId,
      start: pollOption.startTime.toISOString(),
      end: normalizedEnd.toISOString(),
      timeZone: poll.timeZone,
      language: "en",
      metadata: {
        pollId: String(poll.id),
        pollUid: poll.uid,
        pollTitle: poll.title,
        pollOptionId: String(pollOption.id),
      },
      responses,
      idempotencyKey,
      noEmail: shouldSuppressBookingEmails,
    };

    try {
      const booking = await this.createRegularBooking({
        bookingData,
        bookingMeta: {
          userId: poll.organizerId,
          impersonatedByUserUuid: null,
          skipAvailabilityCheck: true,
        },
      });

      if (booking.id) {
        return { bookingId: booking.id };
      }

      if (booking.uid) {
        const bookingFromUid = await this.findBookingByUid(booking.uid);
        return {
          bookingId: bookingFromUid?.id ?? null,
        };
      }

      return { bookingId: null };
    } catch (error) {
      return await this.handleBookingCreationError({
        error,
        pollId: poll.id,
        pollOptionId: pollOption.id,
        organizerId: poll.organizerId,
        idempotencyKey,
      });
    }
  }

  private async handleBookingCreationError({
    error,
    pollId,
    pollOptionId,
    organizerId,
    idempotencyKey,
  }: {
    error: unknown;
    pollId: number;
    pollOptionId: number;
    organizerId: number;
    idempotencyKey: string;
  }): Promise<FinalizePollOutput> {
    const isIdempotencyConflict = this.isIdempotencyConflictError(error);
    const isBookingConflict = this.isBookingConflictError(error);

    console.warn("[polls] Booking creation failed during poll finalization", {
      pollId,
      pollOptionId,
      organizerId,
      isIdempotencyConflict,
      isBookingConflict,
    });

    const existingBooking = await this.findBookingByIdempotencyKey(idempotencyKey);
    if (existingBooking) {
      console.info("[polls] Reused existing booking after booking creation failure (idempotencyKey lookup)", {
        pollId,
        pollOptionId,
        bookingId: existingBooking.id,
        isIdempotencyConflict,
      });

      return {
        bookingId: existingBooking.id,
      };
    }

    const existingBookingByMetadata = await this.findBookingByPollMetadata({
      pollId,
      pollOptionId,
      organizerId,
    });
    if (existingBookingByMetadata) {
      console.info("[polls] Reused existing booking after booking creation failure (metadata lookup)", {
        pollId,
        pollOptionId,
        bookingId: existingBookingByMetadata.id,
        isIdempotencyConflict,
      });

      return {
        bookingId: existingBookingByMetadata.id,
      };
    }

    if (isBookingConflict) {
      console.warn("[polls] Poll finalization blocked by booking conflict", {
        pollId,
        pollOptionId,
        organizerId,
      });

      throw new ErrorWithCode(
        ErrorCode.BookingConflict,
        "Cannot finalize poll because the selected option conflicts with an existing booking. Choose a different option."
      );
    }

    console.error("[polls] Unable to recover booking after booking creation failure", {
      pollId,
      pollOptionId,
      isIdempotencyConflict,
      isBookingConflict,
    });

    throw error;
  }

  private resolveLocationValue(rawLocations: unknown): string {
    const parsedLocations = eventTypeLocations.safeParse(rawLocations ?? []);
    if (!parsedLocations.success || parsedLocations.data.length === 0) {
      return CalVideoLocationType;
    }

    const locationWithoutAttendeeInput = parsedLocations.data.find(
      (location) =>
        location.type !== OrganizerDefaultConferencingAppType && !isAttendeeInputRequired(location.type)
    );

    if (!locationWithoutAttendeeInput) {
      const onlyOrganizerDefaultConferencing = parsedLocations.data.every(
        (location) => location.type === OrganizerDefaultConferencingAppType
      );

      if (onlyOrganizerDefaultConferencing) {
        return CalVideoLocationType;
      }
    }

    if (!locationWithoutAttendeeInput) {
      throw new ErrorWithCode(
        ErrorCode.BadRequest,
        "Poll finalization requires an event type location that does not require attendee input"
      );
    }

    const locationForBooking = getLocationValueForDB(locationWithoutAttendeeInput.type, parsedLocations.data);
    return locationForBooking.bookingLocation;
  }
}
