// biome-ignore-all lint/nursery/useExplicitType: Service method return types are derived from repository and Prisma-generated types.
import {
  CalVideoLocationType,
  getLocationValueForDB,
  isAttendeeInputRequired,
  OrganizerDefaultConferencingAppType,
} from "@calcom/app-store/locations";
import { getRegularBookingService } from "@calcom/features/bookings/di/RegularBookingService.container";
import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import type { CreateRegularBookingData } from "@calcom/features/bookings/lib/dto/types";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { Prisma } from "@calcom/prisma/client";
import { CreationSource, SpecificMeetingInviteeStatus, SpecificMeetingStatus } from "@calcom/prisma/enums";
import { eventTypeLocations } from "@calcom/prisma/zod-utils";
import { SpecificMeetingRepository } from "../repositories/SpecificMeetingRepository";

type CreateSpecificMeetingInput = {
  organizerId: number;
  eventTypeId: number;
  title: string;
  description?: string | null;
  timeZone: string;
  startTime: Date;
  endTime: Date;
  participants: Array<{ name: string; email: string }>;
};

export class SpecificMeetingService {
  private readonly repository: SpecificMeetingRepository;

  constructor(repository = SpecificMeetingRepository.create()) {
    this.repository = repository;
  }

  async create(input: CreateSpecificMeetingInput) {
    if (input.participants.length === 0) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Specific meeting requires at least one participant");
    }

    if (input.endTime <= input.startTime) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "End time must be after start time");
    }

    const eventType = await this.repository.findOwnedEventType({
      eventTypeId: input.eventTypeId,
      organizerId: input.organizerId,
    });

    if (!eventType) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Event type not found");
    }

    const normalizedParticipants = input.participants.map((participant) => ({
      name: participant.name.trim(),
      email: participant.email.trim().toLowerCase(),
    }));

    const uniqueEmails = new Set(normalizedParticipants.map((participant) => participant.email));
    if (uniqueEmails.size !== normalizedParticipants.length) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Participant emails must be unique");
    }

    const meeting = await this.repository.createSpecificMeeting({
      organizerId: input.organizerId,
      eventTypeId: input.eventTypeId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      timeZone: input.timeZone,
      startTime: input.startTime,
      endTime: input.endTime,
      invitees: normalizedParticipants,
    });

    const [primaryParticipant, ...guestParticipants] = normalizedParticipants;
    const locationValue = this.resolveLocationValue(eventType.locations);
    const responses: Record<string, unknown> = {
      name: primaryParticipant.name,
      email: primaryParticipant.email,
      guests: guestParticipants.map((participant) => participant.email),
    };

    if (locationValue) {
      responses.location = {
        optionValue: locationValue,
        value: locationValue,
      };
    }

    const bookingData: CreateRegularBookingData & {
      idempotencyKey: string;
      responses: Record<string, unknown>;
    } = {
      eventTypeId: eventType.id,
      start: input.startTime.toISOString(),
      end: input.endTime.toISOString(),
      timeZone: input.timeZone,
      language: "en",
      idempotencyKey: `specific-meeting:${meeting.uid}`,
      metadata: {
        specificMeetingId: String(meeting.id),
        specificMeetingUid: meeting.uid,
      },
      responses,
      noEmail: false,
      creationSource: CreationSource.WEBAPP,
    };

    const booking = await getRegularBookingService().createBooking({
      bookingData,
      bookingMeta: {
        userId: input.organizerId,
        impersonatedByUserUuid: null,
      },
    });

    if (!booking?.id) {
      throw new ErrorWithCode(ErrorCode.InternalServerError, "Specific meeting booking could not be created");
    }

    await this.repository.attachBooking({
      uid: meeting.uid,
      bookingId: booking.id,
    });

    return await this.getForOrganizer({
      uid: meeting.uid,
      organizerId: input.organizerId,
    });
  }

  async getForOrganizer(input: { uid: string; organizerId: number }) {
    const meeting = await this.repository.findOwnedByUid(input);
    if (!meeting) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Specific meeting not found");
    }

    return {
      ...meeting,
      invitees: meeting.invitees.map((invitee) => ({
        ...invitee,
        responseUrl: `/meeting/${meeting.uid}?token=${invitee.responseToken}`,
      })),
    };
  }

  async listByEventType(input: { eventTypeId: number; organizerId: number }) {
    const meetings = await this.repository.listByEventType(input);

    return meetings.map((meeting) => ({
      ...meeting,
      invitees: meeting.invitees.map((invitee) => ({
        ...invitee,
        responseUrl: `/meeting/${meeting.uid}?token=${invitee.responseToken}`,
      })),
    }));
  }

  async cancel(input: {
    uid: string;
    organizerId: number;
    organizerEmail: string;
    organizerUuid: string;
  }) {
    const meeting = await this.repository.findOwnedByUid({
      uid: input.uid,
      organizerId: input.organizerId,
    });

    if (!meeting) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Specific meeting not found");
    }

    if (meeting.status === SpecificMeetingStatus.CANCELLED) {
      return {
        ...meeting,
        invitees: meeting.invitees.map((invitee) => ({
          ...invitee,
          responseUrl: `/meeting/${meeting.uid}?token=${invitee.responseToken}`,
        })),
      };
    }

    if (meeting.bookingId) {
      await handleCancelBooking({
        userId: input.organizerId,
        userUuid: input.organizerUuid,
        bookingData: {
          id: meeting.bookingId,
          cancellationReason: "Specific meeting cancelled by organizer",
          cancelledBy: input.organizerEmail,
        },
        actionSource: "WEBAPP",
        impersonatedByUserUuid: null,
      });
    }

    const cancelledMeeting = await this.repository.cancelSpecificMeeting({
      uid: input.uid,
    });

    return {
      ...cancelledMeeting,
      invitees: cancelledMeeting.invitees.map((invitee) => ({
        ...invitee,
        responseUrl: `/meeting/${cancelledMeeting.uid}?token=${invitee.responseToken}`,
      })),
    };
  }

  async getInviteeView(input: { uid: string; responseToken: string }) {
    const meeting = await this.repository.findInviteeContext(input);
    if (!meeting) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Specific meeting invite not found");
    }

    const invitee = meeting.invitees.find((item) => item.responseToken === input.responseToken);
    if (!invitee) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Specific meeting invite not found");
    }

    return {
      ...meeting,
      invitee,
      invitees: meeting.invitees.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        status: item.status,
        respondedAt: item.respondedAt,
      })),
    };
  }

  async respond(input: { uid: string; responseToken: string; response: "ACCEPTED" | "DECLINED" }) {
    const meeting = await this.repository.findInviteeContext({
      uid: input.uid,
      responseToken: input.responseToken,
    });

    if (!meeting) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Specific meeting invite not found");
    }

    if (meeting.status === SpecificMeetingStatus.CANCELLED) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Specific meeting is cancelled");
    }

    const invitee = meeting.invitees.find((item) => item.responseToken === input.responseToken);
    if (!invitee) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Specific meeting invite not found");
    }

    let status: SpecificMeetingInviteeStatus = SpecificMeetingInviteeStatus.DECLINED;
    if (input.response === "ACCEPTED") {
      status = SpecificMeetingInviteeStatus.ACCEPTED;
    }

    await this.repository.updateInviteeResponse({
      inviteeId: invitee.id,
      status,
      respondedAt: new Date(),
    });

    return await this.getInviteeView({
      uid: input.uid,
      responseToken: input.responseToken,
    });
  }

  private resolveLocationValue(locations: Prisma.JsonValue | null) {
    const parsedLocations = eventTypeLocations.safeParse(locations ?? []);
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

      throw new ErrorWithCode(
        ErrorCode.BadRequest,
        "Specific meetings require an event type location that does not need attendee input"
      );
    }

    const locationForBooking = getLocationValueForDB(locationWithoutAttendeeInput.type, parsedLocations.data);

    return locationForBooking.bookingLocation;
  }
}
