import { sendPollInviteEmail } from "@calcom/emails/poll-email-service";
import { PollService } from "@calcom/features/polls/services/PollService";
import { getTranslation } from "@calcom/i18n/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";

const createPollSchema = z.object({
  eventTypeId: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().nullish(),
  timeZone: z.string().min(1),
  visibility: z.enum(["PUBLIC", "INVITE_ONLY"]),
  isAnonymous: z.boolean().optional().default(false),
  finalizationMode: z.enum(["MANUAL", "MAJORITY", "UNANIMOUS"]),
  expiresAt: z.date().nullish(),
  options: z
    .array(
      z.object({
        startTime: z.date(),
        endTime: z.date(),
      })
    )
    .min(1),
  participants: z.array(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
    })
  ),
});

const manualFinalizeSchema = z.object({
  pollId: z.number().int().positive(),
  optionId: z.number().int().positive(),
});

const getPollSchema = z.object({
  uid: z.string().min(1),
});

const listPollsSchema = z.object({
  eventTypeId: z.number().int().positive(),
});

const closePollSchema = z.object({
  pollId: z.number().int().positive(),
});

const updateParticipantSchema = z.object({
  pollId: z.number().int().positive(),
  participantId: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email(),
});

const resendParticipantInviteSchema = z.object({
  pollUid: z.string().min(1),
  participantId: z.number().int().positive(),
});

const buildPollInviteLink = ({ pollUid, name, email }: { pollUid: string; name: string; email: string }) => {
  const pollLink = new URL(`/poll/${pollUid}`, WEBAPP_URL);
  pollLink.searchParams.set("name", name);
  pollLink.searchParams.set("email", email);
  return pollLink.toString();
};

export const pollsRouter = router({
  create: authedProcedure.input(createPollSchema).mutation(async ({ ctx, input }) => {
    const pollService = new PollService();
    const poll = await pollService.createPoll({
      ...input,
      organizerId: ctx.user.id,
      description: input.description ?? null,
      expiresAt: input.expiresAt ?? null,
    });

    if (poll.visibility === "INVITE_ONLY" && poll.participants.length > 0) {
      const organizerName = ctx.user.name || ctx.user.email;
      const t = await getTranslation(ctx.user.locale || "en", "common");

      const inviteResults = await Promise.allSettled(
        poll.participants.map(async (participant) => {
          await sendPollInviteEmail({
            to: participant.email,
            organizerName,
            participantName: participant.name,
            pollTitle: poll.title,
            pollDescription: poll.description,
            pollLink: buildPollInviteLink({
              pollUid: poll.uid,
              name: participant.name,
              email: participant.email,
            }),
            t,
          });
        })
      );

      inviteResults.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Failed sending poll invite email", result.reason);
        }
      });
    }

    return poll;
  }),
  updateParticipant: authedProcedure.input(updateParticipantSchema).mutation(async ({ ctx, input }) => {
    const pollService = new PollService();
    return await pollService.updatePollParticipantForOrganizer({
      pollId: input.pollId,
      organizerId: ctx.user.id,
      participantId: input.participantId,
      name: input.name,
      email: input.email,
    });
  }),
  resendParticipantInvite: authedProcedure
    .input(resendParticipantInviteSchema)
    .mutation(async ({ ctx, input }) => {
      const pollService = new PollService();
      const poll = await pollService.getPollByUidForOrganizer({
        uid: input.pollUid,
        organizerId: ctx.user.id,
      });

      if (poll.visibility !== "INVITE_ONLY") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only invite-only polls support participant invite emails",
        });
      }

      if (poll.status !== "OPEN") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only open polls support participant invite emails",
        });
      }

      const participant = poll.participants.find((candidate) => candidate.id === input.participantId);
      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Participant not found in this poll",
        });
      }

      const organizerName = ctx.user.name || ctx.user.email;
      const t = await getTranslation(ctx.user.locale || "en", "common");

      await sendPollInviteEmail({
        to: participant.email,
        organizerName,
        participantName: participant.name,
        pollTitle: poll.title,
        pollDescription: poll.description,
        pollLink: buildPollInviteLink({
          pollUid: poll.uid,
          name: participant.name,
          email: participant.email,
        }),
        t,
      });

      return {
        success: true,
      };
    }),
  getByUidForOrganizer: authedProcedure.input(getPollSchema).query(async ({ ctx, input }) => {
    const pollService = new PollService();
    return await pollService.getPollByUidForOrganizer({ uid: input.uid, organizerId: ctx.user.id });
  }),
  listByEventType: authedProcedure.input(listPollsSchema).query(async ({ ctx, input }) => {
    const pollService = new PollService();
    return await pollService.getPollsByEventTypeForOrganizer({
      eventTypeId: input.eventTypeId,
      organizerId: ctx.user.id,
    });
  }),
  finalizeManually: authedProcedure.input(manualFinalizeSchema).mutation(async ({ ctx, input }) => {
    const pollService = new PollService();
    return await pollService.finalizePollManually({
      pollId: input.pollId,
      organizerId: ctx.user.id,
      optionId: input.optionId,
    });
  }),
  close: authedProcedure.input(closePollSchema).mutation(async ({ ctx, input }) => {
    const pollService = new PollService();
    return await pollService.closePollManually({
      pollId: input.pollId,
      organizerId: ctx.user.id,
    });
  }),
});
