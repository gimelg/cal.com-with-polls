// biome-ignore-all lint/nursery/useExplicitType: Prisma select inference keeps repository return types aligned with the generated client.
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

const specificMeetingInviteeSelect = {
  id: true,
  uid: true,
  name: true,
  email: true,
  responseToken: true,
  status: true,
  required: true,
  respondedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SpecificMeetingInviteeSelect;

const specificMeetingSelect = {
  id: true,
  uid: true,
  title: true,
  description: true,
  timeZone: true,
  startTime: true,
  endTime: true,
  status: true,
  bookingStatus: true,
  bookingFailureReason: true,
  bookingFailureNotifiedAt: true,
  bookingLastAttemptAt: true,
  createdAt: true,
  updatedAt: true,
  bookingId: true,
  booking: {
    select: {
      id: true,
      uid: true,
      status: true,
    },
  },
  organizer: {
    select: {
      id: true,
      uuid: true,
      name: true,
      email: true,
    },
  },
  eventType: {
    select: {
      id: true,
      title: true,
      slug: true,
      length: true,
      locations: true,
      userId: true,
    },
  },
  invitees: {
    orderBy: {
      createdAt: "asc",
    },
    select: specificMeetingInviteeSelect,
  },
} satisfies Prisma.SpecificMeetingSelect;

export class SpecificMeetingRepository {
  static create() {
    return new SpecificMeetingRepository();
  }

  async findOwnedEventType(input: { eventTypeId: number; organizerId: number }) {
    return await prisma.eventType.findFirst({
      where: {
        id: input.eventTypeId,
        userId: input.organizerId,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        length: true,
        locations: true,
        userId: true,
        minimumBookingNotice: true,
        periodType: true,
        periodDays: true,
        periodEndDate: true,
        periodStartDate: true,
        periodCountCalendarDays: true,
        schedule: {
          select: {
            timeZone: true,
          },
        },
        user: {
          select: {
            defaultScheduleId: true,
            schedules: {
              select: {
                id: true,
                timeZone: true,
              },
            },
          },
        },
      },
    });
  }

  async createSpecificMeeting(input: {
    organizerId: number;
    eventTypeId: number;
    title: string;
    description: string | null;
    timeZone: string;
    startTime: Date;
    endTime: Date;
    invitees: Array<{ name: string; email: string; required: boolean }>;
  }) {
    return await prisma.specificMeeting.create({
      data: {
        organizerId: input.organizerId,
        eventTypeId: input.eventTypeId,
        title: input.title,
        description: input.description,
        timeZone: input.timeZone,
        startTime: input.startTime,
        endTime: input.endTime,
        invitees: {
          create: input.invitees.map((invitee) => ({
            name: invitee.name,
            email: invitee.email,
            required: invitee.required,
          })),
        },
      },
      select: specificMeetingSelect,
    });
  }

  async attachBooking(input: { uid: string; bookingId: number }) {
    return await prisma.specificMeeting.update({
      where: {
        uid: input.uid,
      },
      data: {
        bookingId: input.bookingId,
        bookingStatus: "COMPLETED",
        bookingFailureReason: null,
        bookingFailureNotifiedAt: null,
        bookingLastAttemptAt: new Date(),
      },
      select: specificMeetingSelect,
    });
  }

  async markBookingFailure(input: { uid: string; reason: string }) {
    return await prisma.specificMeeting.update({
      where: {
        uid: input.uid,
      },
      data: {
        bookingStatus: "FAILED",
        bookingFailureReason: input.reason,
        bookingLastAttemptAt: new Date(),
      },
      select: specificMeetingSelect,
    });
  }

  async markBookingFailureNotificationSent(input: { uid: string }) {
    return await prisma.specificMeeting.update({
      where: {
        uid: input.uid,
      },
      data: {
        bookingFailureNotifiedAt: new Date(),
      },
      select: specificMeetingSelect,
    });
  }

  async findOwnedByUid(input: { uid: string; organizerId: number }) {
    return await prisma.specificMeeting.findFirst({
      where: {
        uid: input.uid,
        organizerId: input.organizerId,
      },
      select: specificMeetingSelect,
    });
  }

  async listByEventType(input: { eventTypeId: number; organizerId: number }) {
    return await prisma.specificMeeting.findMany({
      where: {
        eventTypeId: input.eventTypeId,
        organizerId: input.organizerId,
      },
      orderBy: {
        startTime: "desc",
      },
      select: specificMeetingSelect,
    });
  }

  async findPendingBookingRetries(input: { organizerId: number }) {
    return await prisma.specificMeeting.findMany({
      where: {
        organizerId: input.organizerId,
        status: "SCHEDULED",
        bookingId: null,
        bookingStatus: "FAILED",
        invitees: {
          some: {
            status: "ACCEPTED",
          },
        },
      },
      orderBy: {
        startTime: "asc",
      },
      select: specificMeetingSelect,
    });
  }

  async cancelSpecificMeeting(input: { uid: string }) {
    return await prisma.specificMeeting.update({
      where: {
        uid: input.uid,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
      select: specificMeetingSelect,
    });
  }

  async deleteSpecificMeeting(input: { uid: string }) {
    return await prisma.specificMeeting.delete({
      where: {
        uid: input.uid,
      },
      select: specificMeetingSelect,
    });
  }

  async findInviteeContext(input: { uid: string; responseToken: string }) {
    return await prisma.specificMeeting.findFirst({
      where: {
        uid: input.uid,
        invitees: {
          some: {
            responseToken: input.responseToken,
          },
        },
      },
      select: {
        id: true,
        uid: true,
        title: true,
        description: true,
        timeZone: true,
        startTime: true,
        endTime: true,
        status: true,
        bookingStatus: true,
        bookingFailureReason: true,
        bookingFailureNotifiedAt: true,
        bookingLastAttemptAt: true,
        bookingId: true,
        booking: {
          select: {
            id: true,
            uid: true,
            status: true,
          },
        },
        organizer: {
          select: {
            id: true,
            uuid: true,
            name: true,
            email: true,
          },
        },
        eventType: {
          select: {
            id: true,
            locations: true,
          },
        },
        invitees: {
          orderBy: {
            createdAt: "asc",
          },
          select: specificMeetingInviteeSelect,
        },
      },
    });
  }

  async updateInviteeResponse(input: {
    inviteeId: number;
    status: Prisma.SpecificMeetingInviteeUncheckedUpdateInput["status"];
    respondedAt: Date;
  }) {
    return await prisma.specificMeetingInvitee.update({
      where: {
        id: input.inviteeId,
      },
      data: {
        status: input.status,
        respondedAt: input.respondedAt,
      },
      select: specificMeetingInviteeSelect,
    });
  }

  async resetInviteeForResend(input: { inviteeId: number; responseToken: string }) {
    return await prisma.specificMeetingInvitee.update({
      where: {
        id: input.inviteeId,
      },
      data: {
        status: "PENDING",
        respondedAt: null,
        responseToken: input.responseToken,
      },
      select: specificMeetingInviteeSelect,
    });
  }
}
