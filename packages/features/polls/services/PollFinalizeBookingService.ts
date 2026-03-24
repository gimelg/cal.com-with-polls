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
import { isPollAliasEmail } from "../lib/poll-types";
import type { PollVoteType } from "../lib/poll-types";
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
  findBookingByUid?: (uid: string) => Promise<{ id: number } | null>;
  isIdempotencyConflictError?: (error: unknown) => boolean;
};

const YES_OR_IF_NEEDED: PollVoteType[] = ["YES", "IF_NEEDED"];
function defaultIsIdempotencyConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const knownRequestError = error as Prisma.PrismaClientKnownRequestError;
  if (knownRequestError.code !== "P2002") {
    return false;
  }

  const target = knownRequestError.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("idempotencyKey");
  }

  return target === "idempotencyKey";
}

export class PollFinalizeBookingService {
  private readonly pollRepository: PollRepository;
  private readonly createRegularBooking: NonNullable<PollFinalizeBookingServiceDeps["createRegularBooking"]>;
  private readonly findBookingByIdempotencyKey: NonNullable<
    PollFinalizeBookingServiceDeps["findBookingByIdempotencyKey"]
  >;
  private readonly findBookingByUid: NonNullable<PollFinalizeBookingServiceDeps["findBookingByUid"]>;
  private readonly isIdempotencyConflictError: NonNullable<
    PollFinalizeBookingServiceDeps["isIdempotencyConflictError"]
  >;

  constructor(deps?: PollFinalizeBookingServiceDeps) {
    this.pollRepository = deps?.pollRepository ?? PollRepository.create();
    this.createRegularBooking =
      deps?.createRegularBooking ??
      (async (input) => {
        const regularBookingService = getRegularBookingService();
        return await regularBookingService.createBooking(input);
      });
    this.findBookingByIdempotencyKey =
      deps?.findBookingByIdempotencyKey ??
      (async (idempotencyKey) => {
        return await prisma.booking.findUnique({
          where: {
            idempotencyKey,
          },
          select: {
            id: true,
          },
        });
      });
    this.findBookingByUid =
      deps?.findBookingByUid ??
      (async (uid) => {
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
      name: primaryParticipant.name.trim() || primaryParticipant.email,
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
      if (!this.isIdempotencyConflictError(error)) {
        throw error;
      }

      const existingBooking = await this.findBookingByIdempotencyKey(idempotencyKey);
      if (existingBooking) {
        return {
          bookingId: existingBooking.id,
        };
      }

      throw error;
    }
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
