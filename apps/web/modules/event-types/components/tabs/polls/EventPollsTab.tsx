import type { EventTypeSetupProps } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { showToast } from "@calcom/ui/components/toast";

type EventPollsTabProps = {
  eventType: EventTypeSetupProps["eventType"];
};

type PollItem = RouterOutputs["viewer"]["polls"]["listByEventType"][number];

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

const getPollStatusVariant = (status: PollItem["status"]) => {
  if (status === "OPEN") return "green" as const;
  if (status === "CLOSED") return "orange" as const;
  if (status === "FINALIZED") return "blue" as const;
  return "gray" as const;
};

export const EventPollsTab = ({ eventType }: EventPollsTabProps) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  const { data: polls, isPending } = trpc.viewer.polls.listByEventType.useQuery({
    eventTypeId: eventType.id,
  });

  const finalizePollMutation = trpc.viewer.polls.finalizeManually.useMutation({
    onSuccess: async () => {
      showToast(t("poll_finalized_successfully"), "success");
      await utils.viewer.polls.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const closePollMutation = trpc.viewer.polls.close.useMutation({
    onSuccess: async () => {
      showToast(t("poll_closed_successfully"), "success");
      await utils.viewer.polls.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  return (
    <div className="stack-y-6">
      <div className="rounded-lg border border-subtle p-6">
        <div>
          <h3 className="text-emphasis text-base font-semibold">{t("polls")}</h3>
          <p className="text-default text-sm">{t("polls_tab_description")}</p>
        </div>
      </div>

      {isPending ? (
        <div className="rounded-lg border border-subtle p-6 text-sm text-default">{t("loading")}</div>
      ) : polls && polls.length > 0 ? (
        <div className="stack-y-4">
          {polls.map((poll) => {
            const finalizedOption = poll.finalizedOptionId
              ? (poll.options.find((option) => option.id === poll.finalizedOptionId) ?? null)
              : null;

            return (
              <div key={poll.id} className="rounded-lg border border-subtle p-6">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-emphasis text-base font-semibold">{poll.title}</h4>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant={getPollStatusVariant(poll.status)}>
                        {t(`poll_status_${poll.status.toLowerCase()}`)}
                      </Badge>
                      <Badge variant="gray">
                        {t(`poll_finalization_${poll.finalizationMode.toLowerCase()}`)}
                      </Badge>
                      <Badge variant="gray">{t(`poll_visibility_${poll.visibility.toLowerCase()}`)}</Badge>
                    </div>
                    <p className="text-muted mt-2 text-xs">
                      {t("poll_response_count", {
                        participants: poll.participants.length,
                        votes: poll.votes.length,
                      })}
                    </p>
                  </div>
                  {poll.status === "OPEN" ? (
                    <Button
                      type="button"
                      color="secondary"
                      StartIcon="lock"
                      loading={closePollMutation.isPending}
                      disabled={closePollMutation.isPending}
                      onClick={() => closePollMutation.mutate({ pollId: poll.id })}>
                      {t("close_poll")}
                    </Button>
                  ) : null}
                </div>

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
                            {new Date(option.startTime).toLocaleString()} -{" "}
                            {new Date(option.endTime).toLocaleString()}
                          </p>
                          <p className="text-muted text-xs">
                            {t("poll_option_vote_breakdown", {
                              yes: voteCounts.yes,
                              ifNeeded: voteCounts.ifNeeded,
                              no: voteCounts.no,
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {isFinalizedOption ? <Badge variant="blue">{t("poll_winner")}</Badge> : null}
                          {poll.status === "OPEN" || poll.status === "CLOSED" ? (
                            <Button
                              type="button"
                              color="minimal"
                              loading={finalizePollMutation.isPending}
                              disabled={finalizePollMutation.isPending}
                              onClick={() =>
                                finalizePollMutation.mutate({
                                  pollId: poll.id,
                                  optionId: option.id,
                                })
                              }>
                              {t("finalize_with_option")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {poll.status === "FINALIZED" && finalizedOption ? (
                  <p className="text-default mt-3 text-sm">
                    {t("poll_finalized_slot", {
                      slot: `${new Date(finalizedOption.startTime).toLocaleString()} - ${new Date(
                        finalizedOption.endTime
                      ).toLocaleString()}`,
                      interpolation: {
                        escapeValue: false,
                      },
                    })}
                  </p>
                ) : null}

                <p className="text-muted mt-2 text-xs">{t("poll_uid_hint", { uid: poll.uid })}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyScreen
          Icon="users"
          headline={t("no_polls_created")}
          description={t("no_polls_created_description")}
        />
      )}
    </div>
  );
};
