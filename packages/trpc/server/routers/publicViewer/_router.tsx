import publicProcedure from "../../procedures/publicProcedure";
import { router } from "../../trpc";
import { ZUserEmailVerificationRequiredSchema } from "./checkIfUserEmailVerificationRequired.schema";
import { ZMarkHostAsNoShowInputSchema } from "./markHostAsNoShow.schema";
import { publicPollsRouter } from "./polls/_router";
import { event } from "./procedures/event";
import { publicSpecificMeetingsRouter } from "./specificMeetings/_router";
import { ZSubmitRatingInputSchema } from "./submitRating.schema";

// things that unauthenticated users can query about themselves
export const publicViewerRouter = router({
  countryCode: publicProcedure.query(async (opts) => {
    const { default: handler } = await import("./countryCode.handler");
    return handler(opts);
  }),
  submitRating: publicProcedure.input(ZSubmitRatingInputSchema).mutation(async (opts) => {
    const { default: handler } = await import("./submitRating.handler");
    return handler(opts);
  }),
  markHostAsNoShow: publicProcedure.input(ZMarkHostAsNoShowInputSchema).mutation(async (opts) => {
    const { default: handler } = await import("./markHostAsNoShow.handler");
    return handler(opts);
  }),
  event,

  checkIfUserEmailVerificationRequired: publicProcedure
    .input(ZUserEmailVerificationRequiredSchema)
    .query(async (opts) => {
      const { default: handler } = await import("./checkIfUserEmailVerificationRequired.handler");
      return handler(opts);
    }),
  polls: publicPollsRouter,
  specificMeetings: publicSpecificMeetingsRouter,
});
