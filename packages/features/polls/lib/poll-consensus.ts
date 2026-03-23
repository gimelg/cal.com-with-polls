import type {
  PollAutoFinalizeResult,
  PollFinalizationMode,
  PollOptionSummary,
  PollVoteInput,
} from "./poll-types";

type BuildPollAutoFinalizeResultInput = {
  mode: PollFinalizationMode;
  participantCount: number;
  votes: PollVoteInput[];
};

const YES_WEIGHT = 2;
const IF_NEEDED_WEIGHT = 1;

function buildOptionSummaries(votes: PollVoteInput[]): PollOptionSummary[] {
  const summariesByOption = new Map<number, PollOptionSummary>();

  for (const vote of votes) {
    const current = summariesByOption.get(vote.optionId) ?? {
      optionId: vote.optionId,
      yesCount: 0,
      noCount: 0,
      ifNeededCount: 0,
      score: 0,
    };

    if (vote.voteType === "YES") {
      current.yesCount += 1;
      current.score += YES_WEIGHT;
    } else if (vote.voteType === "IF_NEEDED") {
      current.ifNeededCount += 1;
      current.score += IF_NEEDED_WEIGHT;
    } else {
      current.noCount += 1;
    }

    summariesByOption.set(vote.optionId, current);
  }

  return Array.from(summariesByOption.values()).sort((left, right) => {
    if (right.yesCount !== left.yesCount) return right.yesCount - left.yesCount;
    if (right.score !== left.score) return right.score - left.score;
    return left.optionId - right.optionId;
  });
}

function getMajorityThreshold(participantCount: number): number {
  return Math.floor(participantCount / 2) + 1;
}

function selectWinnerByMode(
  mode: Exclude<PollFinalizationMode, "MANUAL">,
  summaries: PollOptionSummary[],
  participantCount: number
): {
  winner: PollOptionSummary | null;
  threshold: number;
} {
  let threshold = getMajorityThreshold(participantCount);
  if (mode === "UNANIMOUS") {
    threshold = participantCount;
  }

  const winner = summaries.find((summary) => summary.yesCount >= threshold) ?? null;

  return {
    winner,
    threshold,
  };
}

export function buildPollAutoFinalizeResult({
  mode,
  participantCount,
  votes,
}: BuildPollAutoFinalizeResultInput): PollAutoFinalizeResult {
  const optionSummaries = buildOptionSummaries(votes);

  if (mode === "MANUAL") {
    return {
      shouldFinalize: false,
      winningOptionId: null,
      reason: "manual",
      optionSummaries,
    };
  }

  if (participantCount <= 0) {
    return {
      shouldFinalize: false,
      winningOptionId: null,
      reason: "no_participants",
      optionSummaries,
    };
  }

  const { winner } = selectWinnerByMode(mode, optionSummaries, participantCount);
  if (!winner) {
    return {
      shouldFinalize: false,
      winningOptionId: null,
      reason: "no_consensus",
      optionSummaries,
    };
  }

  let reason: "majority" | "unanimous" = "majority";
  if (mode === "UNANIMOUS") {
    reason = "unanimous";
  }

  return {
    shouldFinalize: true,
    winningOptionId: winner.optionId,
    reason,
    optionSummaries,
  };
}
