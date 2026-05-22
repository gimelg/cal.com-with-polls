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
  createdAt: true,
  updatedAt: true,
  bookingId: true,
  booking: {
    select: {
      uid: true,
    },
  },
  organizer: {
    select: {
      id: true,
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
    invitees: Array<{ name: string; email: string }>;
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
        booking: {
          select: {
            uid: true,
          },
        },
        organizer: {
          select: {
            id: true,
            name: true,
            email: true,
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
}
