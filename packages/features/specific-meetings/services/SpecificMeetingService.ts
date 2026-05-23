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
import { getHideBranding } from "@calcom/features/profile/lib/hideBranding";
import { getTranslation } from "@calcom/i18n/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { Prisma } from "@calcom/prisma/client";
import { CreationSource, SpecificMeetingInviteeStatus, SpecificMeetingStatus } from "@calcom/prisma/enums";
import { eventTypeLocations } from "@calcom/prisma/zod-utils";
import { sendSpecificMeetingBookingFailedEmail, sendSpecificMeetingConfirmationEmail } from "@calcom/emails/poll-email-service";
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

  async retryPendingBookingsForOrganizer(input: { organizerId: number }) {
    const meetings = await this.repository.findPendingBookingRetries(input);

    await Promise.allSettled(
      meetings.map(async (meeting) => {
        const booking = await this.tryCreateBookingForMeeting(meeting);
        if (!booking?.uid) {
          return;
        }

        await this.sendConfirmationEmails(meeting, booking.uid);
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

    let bookingUid: string | null = null;
    if (status === SpecificMeetingInviteeStatus.ACCEPTED && !meeting.bookingId) {
      const booking = await this.tryCreateBookingForMeeting(meeting);
      bookingUid = booking?.uid ?? null;
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

    if (status === SpecificMeetingInviteeStatus.ACCEPTED && bookingUid) {
      await this.sendConfirmationEmails(updatedMeeting, bookingUid);
    }

    await this.cancelBookingIfNoParticipantsRemain(updatedMeeting);

    return updatedMeeting;
  }

  private async tryCreateBookingForMeeting(meeting: Awaited<ReturnType<SpecificMeetingService["getInviteeView"]>>) {
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
        throw new ErrorWithCode(ErrorCode.InternalServerError, "Specific meeting booking could not be created");
      }

      await this.repository.attachBooking({
        uid: meeting.uid,
        bookingId: booking.id,
      });

      return booking;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Specific meeting booking could not be created";
      const failedMeeting = await this.repository.markBookingFailure({ uid: meeting.uid, reason });

      if (!failedMeeting.bookingFailureNotifiedAt) {
        await this.sendBookingFailureEmail(failedMeeting);
        await this.repository.markBookingFailureNotificationSent({ uid: meeting.uid });
      }

      return null;
    }
  }

  private async cancelBookingIfNoParticipantsRemain(
    meeting: Awaited<ReturnType<SpecificMeetingService["getInviteeView"]>>
  ) {
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

  private async sendBookingFailureEmail(
    meeting: Awaited<ReturnType<SpecificMeetingRepository["findInviteeContext"]>> extends infer T ? NonNullable<T> : never
  ) {
    const t = await getTranslation("en", "common");
    const appsLink = new URL("/apps/installed", WEBAPP_URL).toString();
    const meetingLink = new URL(`/event-types/${meeting.eventType.id}?tabName=specificMeetings`, WEBAPP_URL).toString();
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

  private async sendConfirmationEmails(
    meeting: Awaited<ReturnType<SpecificMeetingService["getInviteeView"]>>,
    bookingUid: string
  ) {
    const t = await getTranslation("en", "common");
    const meetingTime = new Intl.DateTimeFormat("en", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: meeting.timeZone,
    }).format(new Date(meeting.startTime));

    let hideBranding = false;
    try {
      hideBranding = await getHideBranding({ userId: meeting.organizer.id });
    } catch {}

    await Promise.allSettled(
      meeting.invitees
        .filter((currentInvitee) => currentInvitee.status === SpecificMeetingInviteeStatus.ACCEPTED)
        .map(async (currentInvitee) => {
          await sendSpecificMeetingConfirmationEmail({
            to: currentInvitee.email,
            organizerName: meeting.organizer.name || meeting.organizer.email,
            participantName: currentInvitee.name,
            meetingTitle: meeting.title,
            meetingDescription: meeting.description,
            meetingTime,
            meetingLink: new URL(`/meeting/${meeting.uid}?token=${currentInvitee.responseToken}`, WEBAPP_URL).toString(),
            cancelLink: new URL(`/booking/${bookingUid}?cancel=true&cancelledBy=${encodeURIComponent(currentInvitee.email)}`, WEBAPP_URL).toString(),
            rescheduleLink: new URL(`/reschedule/${bookingUid}?rescheduledBy=${encodeURIComponent(currentInvitee.email)}`, WEBAPP_URL).toString(),
            hideBranding,
            t,
          });
        })
    );
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
