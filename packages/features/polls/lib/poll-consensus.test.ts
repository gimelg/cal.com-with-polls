import { describe, expect, it } from "vitest";
import { buildPollAutoFinalizeResult } from "./poll-consensus";
import type { PollVoteInput } from "./poll-types";

const votes: PollVoteInput[] = [
  { optionId: 1, participantId: 11, voteType: "YES" },
  { optionId: 1, participantId: 12, voteType: "YES" },
  { optionId: 1, participantId: 13, voteType: "NO" },
  { optionId: 2, participantId: 11, voteType: "YES" },
  { optionId: 2, participantId: 12, voteType: "IF_NEEDED" },
  { optionId: 2, participantId: 13, voteType: "YES" },
  { optionId: 3, participantId: 11, voteType: "YES" },
  { optionId: 3, participantId: 12, voteType: "YES" },
  { optionId: 3, participantId: 13, voteType: "YES" },
];

describe("buildPollAutoFinalizeResult", () => {
  it("does not auto finalize in manual mode", () => {
    const result = buildPollAutoFinalizeResult({
      mode: "MANUAL",
      participantCount: 3,
      votes,
    });

    expect(result.shouldFinalize).toBe(false);
    expect(result.reason).toBe("manual");
    expect(result.winningOptionId).toBeNull();
  });

  it("auto finalizes on majority mode", () => {
    const result = buildPollAutoFinalizeResult({
      mode: "MAJORITY",
      participantCount: 3,
      votes,
    });

    expect(result.shouldFinalize).toBe(true);
    expect(result.reason).toBe("majority");
    expect(result.winningOptionId).toBe(3);
  });

  it("auto finalizes on unanimous mode only for unanimous option", () => {
    const result = buildPollAutoFinalizeResult({
      mode: "UNANIMOUS",
      participantCount: 3,
      votes,
    });

    expect(result.shouldFinalize).toBe(true);
    expect(result.reason).toBe("unanimous");
    expect(result.winningOptionId).toBe(3);
  });

  it("returns no consensus if threshold is not met", () => {
    const result = buildPollAutoFinalizeResult({
      mode: "UNANIMOUS",
      participantCount: 4,
      votes,
    });

    expect(result.shouldFinalize).toBe(false);
    expect(result.reason).toBe("no_consensus");
    expect(result.winningOptionId).toBeNull();
  });
});
