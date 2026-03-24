export type PollFinalizationMode = "MANUAL" | "MAJORITY" | "UNANIMOUS";

export type PollVoteType = "YES" | "NO" | "IF_NEEDED";

export const POLL_ALIAS_EMAIL_DOMAIN = "@poll.local";

const normalizeAliasToken = (value: string) => {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "participant";
};

export const isPollAliasEmail = (email: string) => {
  return email.toLowerCase().endsWith(POLL_ALIAS_EMAIL_DOMAIN);
};

export const createPollAliasEmail = (eventTypeId: number, participantId: number) => {
  return `participant-${eventTypeId}-${participantId}${POLL_ALIAS_EMAIL_DOMAIN}`;
};

export const createPollAliasEmailFromPollUid = (pollUid: string, participantName: string) => {
  const token = normalizeAliasToken(participantName).slice(0, 24);
  const uid = normalizeAliasToken(pollUid).slice(0, 24);
  return `${token}-${uid}${POLL_ALIAS_EMAIL_DOMAIN}`;
};

export type PollVoteInput = {
  optionId: number;
  participantId: number;
  voteType: PollVoteType;
};

export type PollOptionSummary = {
  optionId: number;
  yesCount: number;
  noCount: number;
  ifNeededCount: number;
  score: number;
};

export type PollAutoFinalizeResult = {
  shouldFinalize: boolean;
  winningOptionId: number | null;
  reason: "manual" | "no_participants" | "no_consensus" | "majority" | "unanimous";
  optionSummaries: PollOptionSummary[];
};
