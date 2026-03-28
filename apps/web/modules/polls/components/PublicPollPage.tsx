"use client";

import { createPollAliasEmailFromPollUid } from "@calcom/features/polls/lib/poll-types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useCallback, useEffect, useState } from "react";

type PublicPollPageProps = {
  uid: string;
  prefilledName?: string;
  prefilledEmail?: string;
};

type PollItem = RouterOutputs["viewer"]["public"]["polls"]["getByUid"];
type PollVoteType = "YES" | "NO" | "IF_NEEDED";
type VoteRecord = Record<number, PollVoteType>;
type SubmitFeedback = {
  type: "success" | "error";
  message: string;
};

type SuccessfulSubmission = {
  participantName: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TrpcBatchResult<T> = {
  result?: {
    data?: {
      json?: T;
    };
  };
  error?: {
    message?: string;
  };
};

type TrpcErrorResult = {
  error?: {
    message?: string;
    data?: {
      code?: string;
    };
  };
};

const getTrpcError = (payload: unknown): { message: string; code: string | null } | null => {
  const parseErrorResult = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    const error = (candidate as TrpcErrorResult).error;
    if (!error) {
      return null;
    }

    return {
      message: error.message || "",
      code: error.data?.code || null,
    };
  };

  if (Array.isArray(payload) && payload.length > 0) {
    return parseErrorResult(payload[0]);
  }

  return parseErrorResult(payload);
};

const getPollStatusVariant = (status: PollItem["status"]) => {
  if (status === "OPEN") return "green" as const;
  if (status === "CLOSED") return "orange" as const;
  if (status === "FINALIZED") return "blue" as const;
  return "gray" as const;
};

const getPollOptionVoteCounts = (poll: PollItem, optionId: number) => {
  let yes = 0;
  let no = 0;
  let ifNeeded = 0;

  for (const vote of poll.votes) {
    if (vote.pollOptionId !== optionId) continue;
    if (vote.voteType === "YES") yes += 1;
    if (vote.voteType === "NO") no += 1;
    if (vote.voteType === "IF_NEEDED") ifNeeded += 1;
  }

  return {
    yes,
    no,
    ifNeeded,
  };
};

const formatDateTime = (input: Date | string) => {
  return new Date(input).toLocaleString();
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: Keeping poll page logic and markup together avoids prop drilling across multiple tightly coupled sections.
export const PublicPollPage = ({ uid, prefilledName = "", prefilledEmail = "" }: PublicPollPageProps) => {
  const { t } = useLocale();

  const [participantName, setParticipantName] = useState(prefilledName);
  const [participantEmail, setParticipantEmail] = useState(prefilledEmail);
  const [votes, setVotes] = useState<VoteRecord>({});
  const [poll, setPoll] = useState<PollItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<SubmitFeedback | null>(null);
  const [successfulSubmission, setSuccessfulSubmission] = useState<SuccessfulSubmission | null>(null);

  const loadPoll = useCallback(async () => {
    try {
      setIsPending(true);
      setErrorMessage(null);

      const input = encodeURIComponent(
        JSON.stringify({
          0: {
            json: {
              uid,
            },
          },
        })
      );

      const response = await fetch(`/api/trpc/public/polls.getByUid?batch=1&input=${input}`);
      if (!response.ok) {
        setErrorMessage(t("something_went_wrong"));
        setPoll(null);
        setIsPending(false);
        return;
      }

      const payload = (await response.json()) as TrpcBatchResult<PollItem>[];
      const firstResult = payload[0];
      const pollResult = firstResult?.result?.data?.json ?? null;

      if (!pollResult) {
        setErrorMessage(firstResult?.error?.message || t("something_went_wrong"));
        setPoll(null);
        setIsPending(false);
        return;
      }

      setPoll(pollResult);
      setIsPending(false);
    } catch {
      setPoll(null);
      setErrorMessage(t("something_went_wrong"));
      setIsPending(false);
    }
  }, [t, uid]);

  useEffect(() => {
    setSuccessfulSubmission(null);
    setSubmitFeedback(null);
    void loadPoll();
  }, [loadPoll]);

  useEffect(() => {
    setParticipantName(prefilledName);
    setParticipantEmail(prefilledEmail);
  }, [prefilledName, prefilledEmail]);

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-subtle p-6 text-default text-lg sm:text-base">
          {t("loading")}
        </div>
      </div>
    );
  }

  if (errorMessage || !poll) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <EmptyScreen
          Icon="users"
          headline={t("booker_event_not_found")}
          description={errorMessage || t("something_went_wrong")}
        />
      </div>
    );
  }

  const finalizedOption = poll.finalizedOptionId
    ? (poll.options.find((option) => option.id === poll.finalizedOptionId) ?? null)
    : null;

  const pollIsExpired = Boolean(poll.expiresAt && new Date(poll.expiresAt) < new Date());

  let votingBlockedReason: string | null = null;
  if (poll.status === "FINALIZED") {
    votingBlockedReason = t("poll_vote_finalized");
  } else if (poll.status === "CLOSED") {
    votingBlockedReason = t("poll_vote_closed");
  } else if (poll.status === "CANCELLED") {
    votingBlockedReason = t("poll_vote_cancelled");
  } else if (pollIsExpired) {
    votingBlockedReason = t("poll_vote_expired");
  }

  const requiresParticipantEmail = poll.visibility === "INVITE_ONLY";

  const submitVotes = async () => {
    if (votingBlockedReason) {
      showToast(votingBlockedReason, "error");
      setSubmitFeedback({ type: "error", message: votingBlockedReason });
      return;
    }

    const trimmedName = participantName.trim();
    if (!trimmedName) {
      const message = t("poll_vote_requires_name");
      showToast(message, "error");
      setSubmitFeedback({ type: "error", message });
      return;
    }

    const trimmedEmail = participantEmail.trim().toLowerCase();
    if (requiresParticipantEmail && !trimmedEmail) {
      const message = t("poll_vote_requires_email");
      showToast(message, "error");
      setSubmitFeedback({ type: "error", message });
      return;
    }

    if (requiresParticipantEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      const message = t("poll_vote_invalid_email");
      showToast(message, "error");
      setSubmitFeedback({ type: "error", message });
      return;
    }

    const participantIdentityEmail = requiresParticipantEmail
      ? trimmedEmail
      : createPollAliasEmailFromPollUid(poll.uid, trimmedName);

    const votePayload = poll.options.map((option) => ({
      optionId: option.id,
      voteType: votes[option.id] ?? "NO",
    }));

    try {
      setIsSubmittingVote(true);
      setErrorMessage(null);
      setSubmitFeedback(null);

      const response = await fetch("/api/trpc/public/polls.submitVote", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            pollUid: poll.uid,
            participant: {
              name: trimmedName,
              email: participantIdentityEmail,
            },
            votes: votePayload,
          },
        }),
      });

      const payload = (await response.json()) as unknown;
      const trpcError = getTrpcError(payload);

      if (!response.ok || trpcError) {
        const isInviteOnlyEmailMismatch =
          requiresParticipantEmail &&
          (trpcError?.code === "FORBIDDEN" ||
            trpcError?.message.toLowerCase().includes("not invited") ||
            false);

        const message = isInviteOnlyEmailMismatch
          ? t("poll_vote_invite_only_email_not_found")
          : trpcError?.message || t("something_went_wrong");
        showToast(message, "error");
        setErrorMessage(message);
        setSubmitFeedback({ type: "error", message });
        setIsSubmittingVote(false);
        return;
      }

      const successMessage = t("poll_vote_submitted_success");
      showToast(successMessage, "success");
      setSubmitFeedback(null);
      setSuccessfulSubmission({ participantName: trimmedName });
      setIsSubmittingVote(false);
    } catch {
      const message = t("something_went_wrong");
      showToast(message, "error");
      setErrorMessage(message);
      setSubmitFeedback({ type: "error", message });
      setIsSubmittingVote(false);
    }
  };

  if (successfulSubmission) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <div className="mx-auto w-full max-w-2xl rounded-xl border border-subtle p-8 text-center sm:p-10">
          <p className="font-semibold text-2xl text-emphasis">{t("poll_vote_submitted_title")}</p>
          <p className="mt-3 text-default text-lg sm:text-base">
            {t("poll_vote_submitted_description", {
              participantName: successfulSubmission.participantName,
              pollTitle: poll.title,
            })}
          </p>
          <p className="mt-4 text-base text-muted sm:text-sm">{t("poll_vote_submitted_close_hint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="rounded-lg border border-subtle p-6">
        <div className="mb-4">
          <h1 className="font-semibold text-2xl text-emphasis">{poll.title}</h1>
          {poll.description ? (
            <p className="mt-2 text-default text-lg sm:text-base">{poll.description}</p>
          ) : null}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant={getPollStatusVariant(poll.status)}>
            {t(`poll_status_${poll.status.toLowerCase()}`)}
          </Badge>
          <Badge variant="gray">{t(`poll_finalization_${poll.finalizationMode.toLowerCase()}`)}</Badge>
          <Badge variant="gray">{t(`poll_visibility_${poll.visibility.toLowerCase()}`)}</Badge>
        </div>

        {poll.expiresAt ? (
          <div className="mb-4 text-base text-muted sm:text-sm">
            <p>
              {t("poll_expires_at")}: {formatDateTime(poll.expiresAt)}
            </p>
          </div>
        ) : null}

        <div className="mb-6">
          <h2 className="mb-2 font-semibold text-default text-lg sm:text-base">{t("poll_options")}</h2>
          <div className="stack-y-2">
            {poll.options.map((option, index) => {
              const voteCounts = getPollOptionVoteCounts(poll, option.id);
              const isFinalizedOption = poll.finalizedOptionId === option.id;

              return (
                <div
                  key={option.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2">
                  <div>
                    <p className="font-medium text-default text-lg sm:text-base">
                      {t("poll_option_number", { number: index + 1 })}
                    </p>
                    <p className="text-base text-muted sm:text-sm">
                      {formatDateTime(option.startTime)} - {formatDateTime(option.endTime)}
                    </p>
                    <p className="text-base text-muted sm:text-sm">
                      {t("poll_option_vote_breakdown", {
                        yes: voteCounts.yes,
                        ifNeeded: voteCounts.ifNeeded,
                        no: voteCounts.no,
                      })}
                    </p>

                    {!votingBlockedReason ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="lg"
                          className="text-lg sm:text-base"
                          color={votes[option.id] === "YES" ? "primary" : "minimal"}
                          onClick={() =>
                            setVotes((previous) => ({
                              ...previous,
                              [option.id]: "YES",
                            }))
                          }>
                          {t("yes")}
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          className="text-lg sm:text-base"
                          color={votes[option.id] === "IF_NEEDED" ? "primary" : "minimal"}
                          onClick={() =>
                            setVotes((previous) => ({
                              ...previous,
                              [option.id]: "IF_NEEDED",
                            }))
                          }>
                          {t("poll_vote_if_needed")}
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          className="text-lg sm:text-base"
                          color={votes[option.id] === "NO" ? "primary" : "minimal"}
                          onClick={() =>
                            setVotes((previous) => ({
                              ...previous,
                              [option.id]: "NO",
                            }))
                          }>
                          {t("no")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {isFinalizedOption ? <Badge variant="blue">{t("poll_winner")}</Badge> : null}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-default text-lg sm:text-base">
            {t("poll_respondents_so_far")}
          </h2>
          {poll.isAnonymous ? (
            <p className="text-base text-muted sm:text-sm">
              {t("poll_participant_count", { count: poll.participants.length })}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {poll.participants.length > 0 ? (
                poll.participants.map((participant) => (
                  <Badge key={participant.id} variant="gray">
                    {participant.name}
                  </Badge>
                ))
              ) : (
                <p className="text-base text-muted sm:text-sm">{t("poll_no_responses_yet")}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-md border border-subtle p-4">
          <h2 className="mb-2 font-semibold text-default text-lg sm:text-base">
            {t("poll_vote_section_title")}
          </h2>
          <p className="mb-3 text-base text-muted sm:text-sm">{t("poll_vote_section_description")}</p>

          {votingBlockedReason ? <p className="text-base text-default">{votingBlockedReason}</p> : null}

          {!votingBlockedReason ? (
            <div className="stack-y-3">
              <TextField
                label={t("poll_vote_name")}
                required
                placeholder={t("poll_vote_name_placeholder")}
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
              />
              {requiresParticipantEmail ? (
                <TextField
                  type="email"
                  label={t("poll_vote_email")}
                  required
                  placeholder={t("poll_vote_email_placeholder")}
                  value={participantEmail}
                  onChange={(event) => setParticipantEmail(event.target.value)}
                />
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="lg"
                  className="text-lg sm:text-base"
                  loading={isSubmittingVote}
                  disabled={isSubmittingVote}
                  onClick={() => {
                    void submitVotes();
                  }}>
                  {t("poll_vote_submit")}
                </Button>
              </div>
              {submitFeedback ? (
                <p
                  className={
                    submitFeedback.type === "error"
                      ? "text-base text-error sm:text-sm"
                      : "text-base text-success sm:text-sm"
                  }>
                  {submitFeedback.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {poll.status === "FINALIZED" && finalizedOption ? (
          <p className="mt-4 text-default text-lg sm:text-base">
            {t("poll_finalized_slot", {
              slot: `${formatDateTime(finalizedOption.startTime)} - ${formatDateTime(finalizedOption.endTime)}`,
              interpolation: {
                escapeValue: false,
              },
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
};
