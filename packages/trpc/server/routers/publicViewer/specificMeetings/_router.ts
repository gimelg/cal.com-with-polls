// biome-ignore-all lint/nursery/useExplicitType: Router types are inferred from the procedure builders.
import { SpecificMeetingService } from "@calcom/features/specific-meetings/services/SpecificMeetingService";
import { z } from "zod";
import publicProcedure from "../../../procedures/publicProcedure";
import { router } from "../../../trpc";

export const publicSpecificMeetingsRouter = router({
  getByUid: publicProcedure
    .input(
      z.object({
        uid: z.string().min(1),
        token: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const service = new SpecificMeetingService();
      return await service.getInviteeView({
        uid: input.uid,
        responseToken: input.token,
      });
    }),
  respond: publicProcedure
    .input(
      z.object({
        uid: z.string().min(1),
        token: z.string().min(1),
        response: z.enum(["ACCEPTED", "DECLINED"]),
      })
    )
    .mutation(async ({ input }) => {
      const service = new SpecificMeetingService();
      const response = await service.respond({
        uid: input.uid,
        responseToken: input.token,
        response: input.response,
      });

      return response;
    }),
});
