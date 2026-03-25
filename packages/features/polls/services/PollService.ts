import { sendPollFinalizedEmail } from "@calcom/emails/poll-email-service";
import { getTranslation } from "@calcom/i18n/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { Prisma } from "@calcom/prisma/client";
import { buildPollAutoFinalizeResult } from "../lib/poll-consensus";
import type { PollAutoFinalizeResult, PollFinalizationMode, PollVoteType } from "../lib/poll-types";
import { isPollAliasEmail } from "../lib/poll-types";
import { PollRepository } from "../repositories/PollRepository";
import { PollFinalizeBookingService } from "./PollFinalizeBookingService";

type PollFinalizeCallbackInput = {
  pollId: number;
  pollOptionId: number;
};

type PollFinalizeCallbackOutput = {
  bookingId: number | null;
};

type PollFinalizedNotificationCallbackInput = {
  pollId: number;
  pollOptionId: number;
};

type PollServiceDeps = {
  pollRepository?: PollRepository;
  pollFinalizeBookingService?: PollFinalizeBookingService;
  onFinalize?: (input: PollFinalizeCallbackInput) => Promise<PollFinalizeCallbackOutput>;
  onPollFinalized?: (input: PollFinalizedNotificationCallbackInput) => Promise<void>;
};

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
  options: { startTime: Date; endTime: Date }[];
  participants: { name: string; email: string }[];
};

type SubmitVoteInput = {
  pollUid: string;
  participant: {
    name: string;
    email: string;
  };
  votes: {
    optionId: number;
    voteType: PollVoteType;
  }[];
};

export class PollService {
  private readonly pollRepository: PollRepository;
  private readonly onFinalize: (input: PollFinalizeCallbackInput) => Promise<PollFinalizeCallbackOutput>;
  private readonly onPollFinalized: (input: PollFinalizedNotificationCallbackInput) => Promise<void>;

  constructor(deps?: PollServiceDeps) {
    this.pollRepository = deps?.pollRepository ?? PollRepository.create();
    const pollFinalizeBookingService =
      deps?.pollFinalizeBookingService ??
      new PollFinalizeBookingService({
        pollRepository: this.pollRepository,
      });

    this.onFinalize =
      deps?.onFinalize ??
      (async (input) => {
        return await pollFinalizeBookingService.createBookingForFinalizedPoll(input);
      });

    this.onPollFinalized =
      deps?.onPollFinalized ??
      (async ({ pollId, pollOptionId }) => {
        const poll = await this.pollRepository.getPollNotificationContextById(pollId);
        if (!poll) {
          return;
        }

        const selectedOption = poll.options.find((option) => option.id === pollOptionId);
        if (!selectedOption) {
          return;
        }

        const organizerName = poll.organizer.name || poll.organizer.email;
        const organizerLocale = poll.organizer.locale || "en";
        const t = await getTranslation(organizerLocale, "common");
        const pollLink = new URL(`/poll/${poll.uid}`, WEBAPP_URL).toString();
        const selectedSlot = formatPollFinalizedSlot({
          startTime: selectedOption.startTime,
          endTime: selectedOption.endTime,
          timeZone: poll.timeZone,
          locale: organizerLocale,
        });

        const recipientEntries = [
          {
            email: poll.organizer.email,
            name: organizerName,
            role: "ORGANIZER" as const,
          },
          ...poll.participants
            .filter((participant) => !isPollAliasEmail(participant.email))
            .map((participant) => ({
              email: participant.email,
              name: participant.name,
              role: "PARTICIPANT" as const,
            })),
        ];

        const recipientsByEmail = new Map<string, (typeof recipientEntries)[number]>();
        for (const recipient of recipientEntries) {
          const normalizedEmail = recipient.email.toLowerCase();
          if (recipientsByEmail.has(normalizedEmail) && recipient.role !== "ORGANIZER") {
            continue;
          }

          recipientsByEmail.set(normalizedEmail, recipient);
        }

        const sendResults = await Promise.allSettled(
          Array.from(recipientsByEmail.values()).map(async (recipient) => {
            await sendPollFinalizedEmail({
              to: recipient.email,
              recipientName: recipient.name,
              recipientRole: recipient.role,
              pollTitle: poll.title,
              pollDescription: poll.description,
              selectedSlot,
              pollLink,
              t,
            });
          })
        );

        sendResults.forEach((result) => {
          if (result.status === "rejected") {
            console.error("Failed sending poll finalized email", result.reason);
          }
        });
      });
  }

  async createPoll(input: CreatePollInput) {
    this.validateCreatePollInput(input);

    const canManageEventType = await this.pollRepository.canUserCreatePollForEventType({
      eventTypeId: input.eventTypeId,
      userId: input.organizerId,
    });

    if (!canManageEventType) {
      throw new ErrorWithCode(
        ErrorCode.Forbidden,
        "You do not have access to create a poll for this event type"
      );
    }

    const eventTypeLength = await this.pollRepository.getEventTypeLength(input.eventTypeId);
    if (!eventTypeLength) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Event type not found");
    }

    const optionWithInvalidLength = input.options.find((option) => {
      const optionDurationInMinutes = Math.round(
        (option.endTime.getTime() - option.startTime.getTime()) / (1000 * 60)
      );

      return optionDurationInMinutes !== eventTypeLength;
    });

    if (optionWithInvalidLength) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Poll option duration must match the event type length");
    }

    return await this.pollRepository.createPoll({
      ...input,
      options: input.options.map((option, index) => ({
        ...option,
        position: index,
      })),
    });
  }

  async getPollByUid(uid: string) {
    const poll = await this.pollRepository.getPollByUid(uid);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    return poll;
  }

  async getPollByUidForOrganizer({ uid, organizerId }: { uid: string; organizerId: number }) {
    const poll = await this.pollRepository.getPollByUidAndOrganizerId(uid, organizerId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    return poll;
  }

  async getPollsByEventTypeForOrganizer({
    eventTypeId,
    organizerId,
  }: {
    eventTypeId: number;
    organizerId: number;
  }) {
    const canManageEventType = await this.pollRepository.canUserCreatePollForEventType({
      eventTypeId,
      userId: organizerId,
    });

    if (!canManageEventType) {
      throw new ErrorWithCode(ErrorCode.Forbidden, "You do not have access to this event type's polls");
    }

    return await this.pollRepository.getPollsByEventTypeAndOrganizerId({ eventTypeId, organizerId });
  }

  async getPublicPollByUid(uid: string) {
    const poll = await this.getPollByUid(uid);

    let participantIdentityMode: "NAME_AND_EMAIL" | "NAME_ONLY" = "NAME_ONLY";

    if (poll.visibility === "INVITE_ONLY") {
      participantIdentityMode = "NAME_AND_EMAIL";
    }

    const hasParticipantWithRealEmail = poll.participants.some(
      (participant) => !isPollAliasEmail(participant.email)
    );

    if (hasParticipantWithRealEmail) {
      participantIdentityMode = "NAME_AND_EMAIL";
    }

    const respondedParticipantIds = new Set(poll.votes.map((vote) => vote.participantId));
    const respondedParticipants = poll.participants.filter((participant) =>
      respondedParticipantIds.has(participant.id)
    );

    return {
      ...poll,
      participantIdentityMode,
      participantCount: respondedParticipants.length,
      participants: respondedParticipants.map((participant) => ({
        id: participant.id,
        name: poll.isAnonymous ? "" : participant.name,
      })),
    };
  }

  async submitVotes(input: SubmitVoteInput) {
    const poll = await this.pollRepository.getPollByUid(input.pollUid);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    if (poll.status !== "OPEN") {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Poll is not open for voting");
    }

    if (poll.expiresAt && poll.expiresAt < new Date()) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Poll has expired");
    }

    const optionIds = new Set(poll.options.map((option) => option.id));
    const submittedOptionIds = new Set<number>();
    for (const vote of input.votes) {
      if (!optionIds.has(vote.optionId)) {
        throw new ErrorWithCode(ErrorCode.BadRequest, "Vote references unknown poll option");
      }

      if (submittedOptionIds.has(vote.optionId)) {
        throw new ErrorWithCode(ErrorCode.BadRequest, "Duplicate votes for the same option are not allowed");
      }

      submittedOptionIds.add(vote.optionId);
    }

    const existingParticipant = poll.participants.find(
      (participant) => participant.email.toLowerCase() === input.participant.email.toLowerCase()
    );

    if (poll.visibility === "INVITE_ONLY" && !existingParticipant) {
      throw new ErrorWithCode(ErrorCode.Forbidden, "Participant is not invited to this poll");
    }

    let participant: { id: number; pollId: number };
    if (existingParticipant) {
      participant = {
        id: existingParticipant.id,
        pollId: poll.id,
      };
    } else {
      participant = await this.pollRepository.upsertParticipant({
        pollId: poll.id,
        email: input.participant.email,
        name: input.participant.name,
      });
    }

    const votedOptionIds = input.votes.map((vote) => vote.optionId);
    await this.pollRepository.deleteVotesForParticipant({
      pollId: poll.id,
      participantId: participant.id,
      optionIdsToKeep: votedOptionIds,
    });

    await Promise.all(
      input.votes.map((vote) =>
        this.pollRepository.upsertVote({
          pollId: poll.id,
          pollOptionId: vote.optionId,
          participantId: participant.id,
          voteType: vote.voteType,
        })
      )
    );

    const refreshedPoll = await this.pollRepository.getPollByUid(input.pollUid);
    if (!refreshedPoll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found after vote submission");
    }

    const consensus = buildPollAutoFinalizeResult({
      mode: refreshedPoll.finalizationMode,
      participantCount: refreshedPoll.participants.length,
      votes: refreshedPoll.votes.map((vote) => ({
        optionId: vote.pollOptionId,
        participantId: vote.participantId,
        voteType: vote.voteType,
      })),
    });

    if (consensus.shouldFinalize && consensus.winningOptionId) {
      const finalizedPoll = await this.finalizePollInternal({
        pollId: refreshedPoll.id,
        finalizedById: null,
        optionId: consensus.winningOptionId,
      });

      return {
        poll: finalizedPoll,
        consensus,
      };
    }

    return {
      poll: refreshedPoll,
      consensus,
    };
  }

  async finalizePollManually({
    pollId,
    organizerId,
    optionId,
  }: {
    pollId: number;
    organizerId: number;
    optionId: number;
  }) {
    const poll = await this.pollRepository.getPollByIdAndOrganizerId(pollId, organizerId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    if (poll.status !== "OPEN" && poll.status !== "CLOSED") {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Poll is already finalized or cancelled");
    }

    if (!poll.options.some((option) => option.id === optionId)) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Finalization option does not belong to poll");
    }

    return await this.finalizePollInternal({
      pollId,
      finalizedById: organizerId,
      optionId,
    });
  }

  async closePollManually({ pollId, organizerId }: { pollId: number; organizerId: number }) {
    const poll = await this.pollRepository.getPollByIdAndOrganizerId(pollId, organizerId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    if (poll.status === "OPEN") {
      return await this.pollRepository.closePoll(pollId);
    }

    if (poll.status === "CLOSED") {
      return poll;
    }

    throw new ErrorWithCode(ErrorCode.BadRequest, "Only open polls can be closed");
  }

  async reopenPollManually({ pollId, organizerId }: { pollId: number; organizerId: number }) {
    const poll = await this.pollRepository.getPollByIdAndOrganizerId(pollId, organizerId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    if (poll.status === "CLOSED") {
      return await this.pollRepository.reopenPoll(pollId);
    }

    if (poll.status === "OPEN") {
      return poll;
    }

    throw new ErrorWithCode(ErrorCode.BadRequest, "Only closed polls can be reopened");
  }

  async cancelPollManually({ pollId, organizerId }: { pollId: number; organizerId: number }) {
    const poll = await this.pollRepository.getPollByIdAndOrganizerId(pollId, organizerId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    if (poll.status === "OPEN" || poll.status === "CLOSED") {
      return await this.pollRepository.cancelPoll(pollId);
    }

    if (poll.status === "CANCELLED") {
      return poll;
    }

    throw new ErrorWithCode(ErrorCode.BadRequest, "Finalized polls cannot be cancelled");
  }

  async updatePollParticipantForOrganizer({
    pollId,
    organizerId,
    participantId,
    name,
    email,
  }: {
    pollId: number;
    organizerId: number;
    participantId: number;
    name: string;
    email: string;
  }) {
    const poll = await this.pollRepository.getPollByIdAndOrganizerId(pollId, organizerId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    if (poll.visibility !== "INVITE_ONLY") {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Only invite-only polls support participant updates");
    }

    if (poll.status !== "OPEN") {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Only open polls support participant updates");
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Participant name is required");
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Participant email is required");
    }

    const participant = poll.participants.find((candidate) => candidate.id === participantId);
    if (!participant) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Participant not found in this poll");
    }

    try {
      const updatedPoll = await this.pollRepository.updateParticipant({
        pollId,
        participantId,
        name: normalizedName,
        email: normalizedEmail,
      });

      if (!updatedPoll) {
        throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found after participant update");
      }

      return updatedPoll;
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError.code === "P2002") {
        throw new ErrorWithCode(
          ErrorCode.BadRequest,
          "A participant with this email already exists in this poll"
        );
      }

      throw error;
    }
  }

  async addPollParticipantForOrganizer({
    pollId,
    organizerId,
    name,
    email,
  }: {
    pollId: number;
    organizerId: number;
    name: string;
    email: string;
  }) {
    const poll = await this.pollRepository.getPollByIdAndOrganizerId(pollId, organizerId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    if (poll.visibility !== "INVITE_ONLY") {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Only invite-only polls support participant updates");
    }

    if (poll.status !== "OPEN") {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Only open polls support participant updates");
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Participant name is required");
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Participant email is required");
    }

    try {
      const updatedPoll = await this.pollRepository.addParticipant({
        pollId,
        name: normalizedName,
        email: normalizedEmail,
      });

      if (!updatedPoll) {
        throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found after participant creation");
      }

      return updatedPoll;
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError.code === "P2002") {
        throw new ErrorWithCode(
          ErrorCode.BadRequest,
          "A participant with this email already exists in this poll"
        );
      }

      throw error;
    }
  }

  private async finalizePollInternal({
    pollId,
    finalizedById,
    optionId,
  }: {
    pollId: number;
    finalizedById: number | null;
    optionId: number;
  }) {
    const poll = await this.pollRepository.getPollById(pollId);
    if (!poll) {
      throw new ErrorWithCode(ErrorCode.NotFound, "Poll not found");
    }

    if (poll.status === "FINALIZED") {
      if (poll.finalizedOptionId && poll.finalizedOptionId !== optionId) {
        throw new ErrorWithCode(
          ErrorCode.BadRequest,
          "Poll has already been finalized for a different option"
        );
      }

      return poll;
    }

    if (poll.status !== "OPEN" && poll.status !== "CLOSED") {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Poll is not in a finalizable state");
    }

    if (!poll.options.some((option) => option.id === optionId)) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Finalization option does not belong to poll");
    }

    const finalizeResponse = await this.onFinalize({ pollId, pollOptionId: optionId });

    const finalizedPoll = await this.pollRepository.finalizePoll({
      pollId,
      finalizedById,
      finalizedOptionId: optionId,
      finalizedBookingId: finalizeResponse.bookingId,
    });

    try {
      await this.onPollFinalized({
        pollId: finalizedPoll.id,
        pollOptionId: optionId,
      });
    } catch (error) {
      console.error("Poll finalized, but notification emails failed", error);
    }

    return finalizedPoll;
  }

  private validateCreatePollInput(input: CreatePollInput) {
    if (!input.title.trim()) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Poll title is required");
    }

    if (input.options.length === 0) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Poll requires at least one option");
    }

    if (input.visibility === "INVITE_ONLY" && input.participants.length === 0) {
      throw new ErrorWithCode(ErrorCode.BadRequest, "Invite-only polls require at least one participant");
    }

    if (input.visibility === "INVITE_ONLY" && input.isAnonymous) {
      throw new ErrorWithCode(
        ErrorCode.BadRequest,
        "Invite-only polls cannot be anonymous because participant emails are required"
      );
    }
  }
}

export function shouldAutoFinalize(result: PollAutoFinalizeResult) {
  return result.shouldFinalize && result.winningOptionId !== null;
}

function formatPollFinalizedSlot({
  startTime,
  endTime,
  timeZone,
  locale,
}: {
  startTime: Date;
  endTime: Date;
  timeZone: string;
  locale: string;
}) {
  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };

  const formattedStart = new Intl.DateTimeFormat(locale, dateFormatOptions).format(startTime);
  const formattedEnd = new Intl.DateTimeFormat(locale, dateFormatOptions).format(endTime);

  return `${formattedStart} - ${formattedEnd} (${timeZone})`;
}
