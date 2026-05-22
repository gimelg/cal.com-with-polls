import { createNextApiHandler } from "@calcom/trpc/server/createNextApiHandler";
import { specificMeetingsRouter } from "@calcom/trpc/server/routers/viewer/specificMeetings/_router";

export default createNextApiHandler(specificMeetingsRouter);
