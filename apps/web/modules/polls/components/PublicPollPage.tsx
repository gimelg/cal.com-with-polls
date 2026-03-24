"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";

type PublicPollPageProps = {
  uid: string;
};

type PollItem = RouterOutputs["viewer"]["public"]["polls"]["getByUid"];

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

export const PublicPollPage = ({ uid }: PublicPollPageProps) => {
  const { t } = useLocale();

  const { data: poll, error, isPending } = trpc.viewer.public.polls.getByUid.useQuery({ uid });

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-subtle p-6 text-sm text-default">{t("loading")}</div>
      </div>
    );
  }

  if (error || !poll) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <EmptyScreen
          Icon="users"
          headline={t("booker_event_not_found")}
          description={error?.message || t("something_went_wrong")}
        />
      </div>
    );
  }

  const finalizedOption = poll.finalizedOptionId
    ? (poll.options.find((option) => option.id === poll.finalizedOptionId) ?? null)
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="rounded-lg border border-subtle p-6">
        <div className="mb-4">
          <h1 className="text-emphasis text-xl font-semibold">{poll.title}</h1>
          {poll.description ? <p className="text-default mt-2 text-sm">{poll.description}</p> : null}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant={getPollStatusVariant(poll.status)}>
            {t(`poll_status_${poll.status.toLowerCase()}`)}
          </Badge>
          <Badge variant="gray">{t(`poll_finalization_${poll.finalizationMode.toLowerCase()}`)}</Badge>
          <Badge variant="gray">{t(`poll_visibility_${poll.visibility.toLowerCase()}`)}</Badge>
        </div>

        <div className="mb-4 text-xs text-muted">
          <p>
            {t("poll_response_count", {
              participants: poll.participants.length,
              votes: poll.votes.length,
            })}
          </p>
          {poll.expiresAt ? (
            <p className="mt-1">
              {t("poll_expires_at")}: {formatDateTime(poll.expiresAt)}
            </p>
          ) : null}
        </div>

        <div className="mb-6">
          <h2 className="text-default mb-2 text-sm font-semibold">{t("poll_options")}</h2>
          <div className="stack-y-2">
            {poll.options.map((option, index) => {
              const voteCounts = getPollOptionVoteCounts(poll, option.id);
              const isFinalizedOption = poll.finalizedOptionId === option.id;

              return (
                <div
                  key={option.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2">
                  <div>
                    <p className="text-default text-sm font-medium">
                      {t("poll_option_number", { number: index + 1 })}
                    </p>
                    <p className="text-muted text-xs">
                      {formatDateTime(option.startTime)} - {formatDateTime(option.endTime)}
                    </p>
                    <p className="text-muted text-xs">
                      {t("poll_option_vote_breakdown", {
                        yes: voteCounts.yes,
                        ifNeeded: voteCounts.ifNeeded,
                        no: voteCounts.no,
                      })}
                    </p>
                  </div>
                  {isFinalizedOption ? <Badge variant="blue">{t("poll_winner")}</Badge> : null}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-default mb-2 text-sm font-semibold">{t("poll_participants")}</h2>
          <div className="flex flex-wrap gap-2">
            {poll.participants.length > 0 ? (
              poll.participants.map((participant) => (
                <Badge key={participant.id} variant="gray">
                  {participant.name}
                </Badge>
              ))
            ) : (
              <p className="text-muted text-xs">{t("poll_no_participants_yet")}</p>
            )}
          </div>
        </div>

        {poll.status === "FINALIZED" && finalizedOption ? (
          <p className="text-default mt-4 text-sm">
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
