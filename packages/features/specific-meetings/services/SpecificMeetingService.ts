// biome-ignore-all lint/nursery/useExplicitType: Service method return types are derived from repository and Prisma-generated types.
import {
  CalVideoLocationType,
  getLocationValueForDB,
  isAttendeeInputRequired,
  OrganizerDefaultConferencingAppType,
} from "@calcom/app-store/locations";
import { sendSpecificMeetingBookingFailedEmail } from "@calcom/emails/poll-email-service";
import { getRegularBookingService } from "@calcom/features/bookings/di/RegularBookingService.container";
import type { CreateRegularBookingData } from "@calcom/features/bookings/lib/dto/types";
import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import { getHideBranding } from "@calcom/features/profile/lib/hideBranding";
import { getTranslation } from "@calcom/i18n/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
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

type InviteeMeeting = {
  id: number;
  uid: string;
  title: string;
  description: string | null;
  timeZone: string;
  startTime: Date;
  endTime: Date;
  status: SpecificMeetingStatus;
  bookingId: number | null;
  bookingFailureReason: string | null;
  bookingFailureNotifiedAt: Date | null;
  organizer: {
    id: number;
    uuid: string;
    name: string | null;
    email: string;
  };
  eventType: {
    id: number;
    locations: Prisma.JsonValue | null;
  };
  invitees: Array<{
    id: number;
    name: string;
    email: string;
    responseToken: string;
    status: SpecificMeetingInviteeStatus;
    respondedAt: Date | null;
  }>;
};

export class SpecificMeetingService {
  private readonly repository: SpecificMeetingRepository;

  constructor(repository = SpecificMeetingRepository.create()) {
    this.repository = repository;
  }

  async retryPendingBookingsForOrganizer(input: { organizerId: number }) {
    const meetings = await this.repository.findPendingBookingRetries(input);

    await Promise.allSettled(
      meetings.map(async (meeting) => {
        const booking = await this.tryCreateBookingForMeeting(meeting);
        if (!booking?.uid) {
          return;
        }

        return;
      })
    );
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

    await this.resolveLocationValue(eventType.locations);

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

  async cancel(input: { uid: string; organizerId: number; organizerEmail: string; organizerUuid: string }) {
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

  async delete(input: { uid: string; organizerId: number }) {
    const meeting = await this.repository.findOwnedByUid(input);
    if (!meeting) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Specific meeting not found");
    }

    const isPastMeeting = meeting.endTime < new Date();
    const hasNoAcceptedInvitees = !meeting.invitees.some(
      (invitee) => invitee.status === SpecificMeetingInviteeStatus.ACCEPTED
    );
    const allInviteesDeclined =
      meeting.invitees.length > 0 &&
      meeting.invitees.every((invitee) => invitee.status === SpecificMeetingInviteeStatus.DECLINED);

    if (
      meeting.status !== SpecificMeetingStatus.CANCELLED &&
      !isPastMeeting &&
      !(hasNoAcceptedInvitees && allInviteesDeclined)
    ) {
      throw new ErrorWithCode(
        ErrorCode.BadRequest,
        "Only cancelled, past, or no-meeting specific meetings can be deleted"
      );
    }

    return await this.repository.deleteSpecificMeeting({ uid: input.uid });
  }

  async resendInvite(input: { uid: string; organizerId: number; inviteeId: number }) {
    const meeting = await this.repository.findOwnedByUid({
      uid: input.uid,
      organizerId: input.organizerId,
    });

    if (!meeting) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Specific meeting not found");
    }

    const invitee = meeting.invitees.find((item) => item.id === input.inviteeId);
    if (!invitee) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Invitee not found");
    }

    if (invitee.status === SpecificMeetingInviteeStatus.ACCEPTED) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Accepted invitees cannot be resent");
    }

    if (invitee.status === SpecificMeetingInviteeStatus.DECLINED) {
      await this.repository.resetInviteeForResend({
        inviteeId: invitee.id,
        responseToken: crypto.randomUUID(),
      });
    }

    return await this.getForOrganizer({
      uid: input.uid,
      organizerId: input.organizerId,
    });
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
        responseToken: item.responseToken,
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

    if (status === SpecificMeetingInviteeStatus.ACCEPTED && !meeting.bookingId) {
      await this.tryCreateBookingForMeeting(meeting);
    }

    await this.repository.updateInviteeResponse({
      inviteeId: invitee.id,
      status,
      respondedAt: new Date(),
    });

    const updatedMeeting = await this.getInviteeView({
      uid: input.uid,
      responseToken: input.responseToken,
    });

    await this.cancelBookingIfNoParticipantsRemain(updatedMeeting);

    return updatedMeeting;
  }

  private async tryCreateBookingForMeeting(meeting: InviteeMeeting) {
    try {
      const [primaryInvitee, ...guestInvitees] = meeting.invitees;
      const locationValue = this.resolveLocationValue(meeting.eventType.locations);
      const responses: Record<string, unknown> = {
        name: primaryInvitee.name,
        email: primaryInvitee.email,
        guests: guestInvitees.map((participant) => participant.email),
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
        eventTypeId: meeting.eventType.id,
        start: meeting.startTime.toISOString(),
        end: meeting.endTime.toISOString(),
        timeZone: meeting.timeZone,
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
          userId: meeting.organizer.id,
          impersonatedByUserUuid: null,
        },
      });

      if (!booking?.id || !booking?.uid) {
        throw new ErrorWithCode(
          ErrorCode.InternalServerError,
          "Specific meeting booking could not be created"
        );
      }

      await this.repository.attachBooking({
        uid: meeting.uid,
        bookingId: booking.id,
      });

      return booking;
    } catch (error) {
      let reason = "Specific meeting booking could not be created";
      if (error instanceof Error) {
        reason = error.message;
      }
      const failedMeeting = await this.repository.markBookingFailure({ uid: meeting.uid, reason });

      if (!failedMeeting.bookingFailureNotifiedAt) {
        await this.sendBookingFailureEmail(failedMeeting);
        await this.repository.markBookingFailureNotificationSent({ uid: meeting.uid });
      }

      return null;
    }
  }

  private async cancelBookingIfNoParticipantsRemain(meeting: InviteeMeeting) {
    if (!meeting.bookingId || meeting.status === SpecificMeetingStatus.CANCELLED) {
      return;
    }

    const hasAcceptedInvitee = meeting.invitees.some(
      (currentInvitee) => currentInvitee.status === SpecificMeetingInviteeStatus.ACCEPTED
    );
    if (hasAcceptedInvitee) {
      return;
    }

    await handleCancelBooking({
      userId: meeting.organizer.id,
      userUuid: meeting.organizer.uuid,
      bookingData: {
        id: meeting.bookingId,
        cancellationReason: "Specific meeting no longer has participants",
        cancelledBy: meeting.organizer.email,
      },
      actionSource: "WEBAPP",
      impersonatedByUserUuid: null,
    });
  }

  private async sendBookingFailureEmail(meeting: InviteeMeeting) {
    const t = await getTranslation("en", "common");
    const appsLink = new URL("/apps/installed", WEBAPP_URL).toString();
    const meetingLink = new URL(
      `/event-types/${meeting.eventType.id}?tabName=specificMeetings`,
      WEBAPP_URL
    ).toString();
    const meetingTime = new Intl.DateTimeFormat("en", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: meeting.timeZone,
    }).format(new Date(meeting.startTime));

    let hideBranding = false;
    try {
      hideBranding = await getHideBranding({ userId: meeting.organizer.id });
    } catch {}

    await sendSpecificMeetingBookingFailedEmail({
      to: meeting.organizer.email,
      organizerName: meeting.organizer.name || meeting.organizer.email,
      meetingTitle: meeting.title,
      meetingTime,
      meetingLink,
      appsLink,
      failureReason: meeting.bookingFailureReason,
      hideBranding,
      t,
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
