import { PollService } from "@calcom/features/polls/services/PollService";
import { z } from "zod";
import publicProcedure from "../../../procedures/publicProcedure";
import { router } from "../../../trpc";

const getPollSchema = z.object({
  uid: z.string().min(1),
});

const submitVoteSchema = z.object({
  pollUid: z.string().min(1),
  participant: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  votes: z
    .array(
      z.object({
        optionId: z.number().int().positive(),
        voteType: z.enum(["YES", "NO", "IF_NEEDED"]),
      })
    )
    .min(1),
});

export const publicPollsRouter = router({
  getByUid: publicProcedure.input(getPollSchema).query(async ({ input }) => {
    const pollService = new PollService();
    return await pollService.getPublicPollByUid(input.uid);
  }),
  submitVote: publicProcedure.input(submitVoteSchema).mutation(async ({ input }) => {
    const pollService = new PollService();
    return await pollService.submitVotes(input);
  }),
});
