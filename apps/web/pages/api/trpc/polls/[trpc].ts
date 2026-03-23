import { createNextApiHandler } from "@calcom/trpc/server/createNextApiHandler";
import { pollsRouter } from "@calcom/trpc/server/routers/polls/_router";

export default createNextApiHandler(pollsRouter);
