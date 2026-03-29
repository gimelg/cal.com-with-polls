import type { PrismaClient } from "@calcom/prisma";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { PollFinalizationMode, PollVoteType } from "../lib/poll-types";

const pollDetailsSelect = {
  id: true,
  uid: true,
  title: true,
  description: true,
  status: true,
  visibility: true,
  isAnonymous: true,
  finalizationMode: true,
  organizerId: true,
  expiresAt: true,
  finalizedAt: true,
  finalizedById: true,
  finalizedOptionId: true,
  finalizedBookingId: true,
  options: {
    select: {
      id: true,
      startTime: true,
      endTime: true,
      position: true,
    },
    orderBy: {
      position: "asc" as const,
    },
  },
  participants: {
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: {
      id: "asc" as const,
    },
  },
  votes: {
    select: {
      pollOptionId: true,
      participantId: true,
      voteType: true,
    },
  },
} satisfies Prisma.PollSelect;

const pollFinalizeContextSelect = {
  id: true,
  uid: true,
  title: true,
  visibility: true,
  eventTypeId: true,
  organizerId: true,
  timeZone: true,
  options: {
    select: {
      id: true,
      startTime: true,
      endTime: true,
      position: true,
    },
    orderBy: {
      position: "asc" as const,
    },
  },
  participants: {
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: {
      id: "asc" as const,
    },
  },
  votes: {
    select: {
      pollOptionId: true,
      participantId: true,
      voteType: true,
    },
  },
  eventType: {
    select: {
      length: true,
      locations: true,
    },
  },
} satisfies Prisma.PollSelect;

const pollNotificationContextSelect = {
  id: true,
  uid: true,
  title: true,
  description: true,
  timeZone: true,
  organizer: {
    select: {
      id: true,
      name: true,
      email: true,
      locale: true,
      hideBranding: true,
    },
  },
  participants: {
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: {
      id: "asc" as const,
    },
  },
  options: {
    select: {
      id: true,
      startTime: true,
      endTime: true,
    },
  },
} satisfies Prisma.PollSelect;

type CreatePollInput = {
  eventTypeId: number;
  organizerId: number;
  title: string;
  description?: string | null;
  timeZone: string;
  visibility: "PUBLIC" | "INVITE_ONLY";
  isAnonymous: boolean;
  finalizationMode: PollFinalizationMode;
  expiresAt?: Date | null;
  options: { startTime: Date; endTime: Date; position: number }[];
  participants: { name: string; email: string }[];
};

export class PollRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  static create() {
    return new PollRepository(prisma);
  }

  async createPoll(input: CreatePollInput) {
    return await this.prismaClient.poll.create({
      data: {
        eventTypeId: input.eventTypeId,
        organizerId: input.organizerId,
        title: input.title,
        description: input.description ?? null,
        timeZone: input.timeZone,
        visibility: input.visibility,
        isAnonymous: input.isAnonymous,
        finalizationMode: input.finalizationMode,
        expiresAt: input.expiresAt ?? null,
        options: {
          create: input.options,
        },
        participants: {
          create: input.participants,
        },
      },
      select: pollDetailsSelect,
    });
  }

  async canUserCreatePollForEventType({ eventTypeId, userId }: { eventTypeId: number; userId: number }) {
    const eventType = await this.prismaClient.eventType.findFirst({
      where: {
        id: eventTypeId,
        OR: [
          {
            userId,
          },
          {
            team: {
              members: {
                some: {
                  userId,
                  accepted: true,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    return Boolean(eventType);
  }

  async getEventTypeLength(eventTypeId: number) {
    const eventType = await this.prismaClient.eventType.findUnique({
      where: {
        id: eventTypeId,
      },
      select: {
        length: true,
      },
    });

    return eventType?.length ?? null;
  }

  async getPollByUid(uid: string) {
    return await this.prismaClient.poll.findUnique({
      where: { uid },
      select: pollDetailsSelect,
    });
  }

  async getPollById(id: number) {
    return await this.prismaClient.poll.findUnique({
      where: { id },
      select: pollDetailsSelect,
    });
  }

  async getPollByUidAndOrganizerId(uid: string, organizerId: number) {
    return await this.prismaClient.poll.findFirst({
      where: {
        uid,
        organizerId,
      },
      select: pollDetailsSelect,
    });
  }

  async getPollsByEventTypeAndOrganizerId({
    eventTypeId,
    organizerId,
  }: {
    eventTypeId: number;
    organizerId: number;
  }) {
    return await this.prismaClient.poll.findMany({
      where: {
        eventTypeId,
        organizerId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: pollDetailsSelect,
    });
  }

  async getPollByIdAndOrganizerId(id: number, organizerId: number) {
    return await this.prismaClient.poll.findFirst({
      where: {
        id,
        organizerId,
      },
      select: pollDetailsSelect,
    });
  }

  async getPollFinalizeContextById(id: number) {
    return await this.prismaClient.poll.findUnique({
      where: { id },
      select: pollFinalizeContextSelect,
    });
  }

  async getPollNotificationContextById(id: number) {
    return await this.prismaClient.poll.findUnique({
      where: { id },
      select: pollNotificationContextSelect,
    });
  }

  async upsertParticipant({ pollId, email, name }: { pollId: number; email: string; name: string }) {
    return await this.prismaClient.pollParticipant.upsert({
      where: {
        pollId_email: {
          pollId,
          email,
        },
      },
      create: {
        pollId,
        email,
        name,
      },
      update: {
        name,
      },
      select: {
        id: true,
        pollId: true,
      },
    });
  }

  async upsertVote({
    pollId,
    pollOptionId,
    participantId,
    voteType,
  }: {
    pollId: number;
    pollOptionId: number;
    participantId: number;
    voteType: PollVoteType;
  }) {
    return await this.prismaClient.pollVote.upsert({
      where: {
        pollOptionId_participantId: {
          pollOptionId,
          participantId,
        },
      },
      create: {
        pollId,
        pollOptionId,
        participantId,
        voteType,
      },
      update: {
        voteType,
      },
      select: {
        id: true,
      },
    });
  }

  async deleteVotesForParticipant({
    pollId,
    participantId,
    optionIdsToKeep,
  }: {
    pollId: number;
    participantId: number;
    optionIdsToKeep: number[];
  }) {
    return await this.prismaClient.pollVote.deleteMany({
      where: {
        pollId,
        participantId,
        pollOptionId: {
          notIn: optionIdsToKeep,
        },
      },
    });
  }

  async finalizePoll({
    pollId,
    finalizedById,
    finalizedOptionId,
    finalizedBookingId,
  }: {
    pollId: number;
    finalizedById: number | null;
    finalizedOptionId: number;
    finalizedBookingId?: number | null;
  }) {
    return await this.prismaClient.poll.update({
      where: {
        id: pollId,
      },
      data: {
        status: "FINALIZED",
        finalizedAt: new Date(),
        finalizedById,
        finalizedOptionId,
        finalizedBookingId: finalizedBookingId ?? null,
      },
      select: pollDetailsSelect,
    });
  }

  async closePoll(pollId: number) {
    return await this.prismaClient.poll.update({
      where: {
        id: pollId,
      },
      data: {
        status: "CLOSED",
      },
      select: pollDetailsSelect,
    });
  }

  async reopenPoll(pollId: number) {
    return await this.prismaClient.poll.update({
      where: {
        id: pollId,
      },
      data: {
        status: "OPEN",
      },
      select: pollDetailsSelect,
    });
  }

  async cancelPoll(pollId: number) {
    return await this.prismaClient.poll.update({
      where: {
        id: pollId,
      },
      data: {
        status: "CANCELLED",
      },
      select: pollDetailsSelect,
    });
  }

  async updateParticipant({
    pollId,
    participantId,
    name,
    email,
  }: {
    pollId: number;
    participantId: number;
    name: string;
    email: string;
  }) {
    await this.prismaClient.pollParticipant.update({
      where: {
        id: participantId,
      },
      data: {
        name,
        email,
      },
      select: {
        id: true,
      },
    });

    return await this.prismaClient.poll.findUnique({
      where: {
        id: pollId,
      },
      select: pollDetailsSelect,
    });
  }

  async addParticipant({ pollId, name, email }: { pollId: number; name: string; email: string }) {
    await this.prismaClient.pollParticipant.create({
      data: {
        pollId,
        name,
        email,
      },
      select: {
        id: true,
      },
    });

    return await this.prismaClient.poll.findUnique({
      where: {
        id: pollId,
      },
      select: pollDetailsSelect,
    });
  }
}

export type PollDetails = Prisma.PollGetPayload<{
  select: typeof pollDetailsSelect;
}>;

export type PollFinalizeContext = Prisma.PollGetPayload<{
  select: typeof pollFinalizeContextSelect;
}>;

export type PollNotificationContext = Prisma.PollGetPayload<{
  select: typeof pollNotificationContextSelect;
}>;
