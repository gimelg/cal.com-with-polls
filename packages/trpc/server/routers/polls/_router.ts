import { mergeRouters } from "../../trpc";
import { publicPollsRouter } from "../publicViewer/polls/_router";
import { pollsRouter as viewerPollsRouter } from "../viewer/polls/_router";

export const pollsRouter = mergeRouters(viewerPollsRouter, publicPollsRouter);
