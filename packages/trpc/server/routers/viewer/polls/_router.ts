import { PollService } from "@calcom/features/polls/services/PollService";
import { z } from "zod";
import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";

const createPollSchema = z.object({
  eventTypeId: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().nullish(),
  timeZone: z.string().min(1),
  visibility: z.enum(["PUBLIC", "INVITE_ONLY"]),
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

export const pollsRouter = router({
  create: authedProcedure.input(createPollSchema).mutation(async ({ ctx, input }) => {
    const pollService = new PollService();
    return await pollService.createPoll({
      ...input,
      organizerId: ctx.user.id,
      description: input.description ?? null,
      expiresAt: input.expiresAt ?? null,
    });
  }),
  getByUid: authedProcedure.input(getPollSchema).query(async ({ ctx, input }) => {
    const pollService = new PollService();
    return await pollService.getPollByUidForOrganizer({ uid: input.uid, organizerId: ctx.user.id });
  }),
  finalizeManually: authedProcedure.input(manualFinalizeSchema).mutation(async ({ ctx, input }) => {
    const pollService = new PollService();
    return await pollService.finalizePollManually({
      pollId: input.pollId,
      organizerId: ctx.user.id,
      optionId: input.optionId,
    });
  }),
});
