import { useCallback, useState } from "react";

import type { EventTypeSetupProps } from "@calcom/features/eventtypes/lib/types";
import { createPollAliasEmail, isPollAliasEmail } from "@calcom/features/polls/lib/poll-types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { TextAreaField, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";

type EventPollsTabProps = {
  eventType: EventTypeSetupProps["eventType"];
};

type PollItem = RouterOutputs["viewer"]["polls"]["listByEventType"][number];

type DraftOption = {
  id: number;
  startTime: string;
  endTime: string;
};

type DraftParticipant = {
  id: number;
  name: string;
  email: string;
};

type ParticipantIdentityMode = "NAME_AND_EMAIL" | "NAME_ONLY";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toDateTimeLocalInputValue = (date: Date) => {
  const dateWithoutTimezoneOffset = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return dateWithoutTimezoneOffset.toISOString().slice(0, 16);
};

const createOptionDraft = (id: number, eventLengthMinutes: number, daysFromNow: number): DraftOption => {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() + daysFromNow);
  startTime.setHours(10, 0, 0, 0);
  const endTime = new Date(startTime.getTime() + eventLengthMinutes * 60000);

  return {
    id,
    startTime: toDateTimeLocalInputValue(startTime),
    endTime: toDateTimeLocalInputValue(endTime),
  };
};

const createParticipantDraft = (id: number): DraftParticipant => ({
  id,
  name: "",
  email: "",
});

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

const getPollParticipantIdentityMode = (poll: PollItem): ParticipantIdentityMode => {
  if (
    poll.participants.length > 0 &&
    poll.participants.every((participant) => isPollAliasEmail(participant.email))
  ) {
    return "NAME_ONLY";
  }

  return "NAME_AND_EMAIL";
};

export const EventPollsTab = ({ eventType }: EventPollsTabProps) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const eventLengthMinutes = eventType.length || 30;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [finalizationMode, setFinalizationMode] = useState<"MANUAL" | "MAJORITY" | "UNANIMOUS">("MANUAL");
  const [visibility, setVisibility] = useState<"PUBLIC" | "INVITE_ONLY">("PUBLIC");
  const [participantIdentityMode, setParticipantIdentityMode] =
    useState<ParticipantIdentityMode>("NAME_AND_EMAIL");
  const [expiresAt, setExpiresAt] = useState("");
  const [optionDrafts, setOptionDrafts] = useState<DraftOption[]>([
    createOptionDraft(1, eventLengthMinutes, 1),
    createOptionDraft(2, eventLengthMinutes, 2),
  ]);
  const [participantDrafts, setParticipantDrafts] = useState<DraftParticipant[]>([]);

  const { data: polls, isPending } = trpc.viewer.polls.listByEventType.useQuery({
    eventTypeId: eventType.id,
  });

  const resetCreateForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setFinalizationMode("MANUAL");
    setVisibility("PUBLIC");
    setParticipantIdentityMode("NAME_AND_EMAIL");
    setExpiresAt("");
    setOptionDrafts([
      createOptionDraft(1, eventLengthMinutes, 1),
      createOptionDraft(2, eventLengthMinutes, 2),
    ]);
    setParticipantDrafts([]);
  }, [eventLengthMinutes]);

  const createPollMutation = trpc.viewer.polls.create.useMutation({
    onSuccess: async () => {
      showToast(t("poll_created_successfully"), "success");
      setIsCreateOpen(false);
      resetCreateForm();
      await utils.viewer.polls.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
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

  const addOptionDraft = () => {
    setOptionDrafts((previous) => {
      const nextId = previous.length > 0 ? Math.max(...previous.map((option) => option.id)) + 1 : 1;
      return [...previous, createOptionDraft(nextId, eventLengthMinutes, previous.length + 1)];
    });
  };

  const removeOptionDraft = (optionId: number) => {
    setOptionDrafts((previous) => {
      if (previous.length <= 1) return previous;
      return previous.filter((option) => option.id !== optionId);
    });
  };

  const addParticipantDraft = () => {
    setParticipantDrafts((previous) => {
      const nextId = previous.length > 0 ? Math.max(...previous.map((participant) => participant.id)) + 1 : 1;
      return [...previous, createParticipantDraft(nextId)];
    });
  };

  const removeParticipantDraft = (participantId: number) => {
    setParticipantDrafts((previous) => previous.filter((participant) => participant.id !== participantId));
  };

  const createPoll = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      showToast(t("poll_title_required"), "error");
      return;
    }

    const parsedOptions = optionDrafts.map((option) => {
      if (!option.startTime || !option.endTime) {
        return null;
      }

      const parsedStart = new Date(option.startTime);
      const parsedEnd = new Date(option.endTime);

      if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
        return null;
      }

      return {
        startTime: parsedStart,
        endTime: parsedEnd,
      };
    });

    if (parsedOptions.some((option) => !option)) {
      showToast(t("poll_invalid_option_dates"), "error");
      return;
    }

    const options = parsedOptions.filter((option): option is NonNullable<(typeof parsedOptions)[number]> =>
      Boolean(option)
    );
    if (options.length === 0) {
      showToast(t("poll_requires_one_option"), "error");
      return;
    }

    if (options.some((option) => option.endTime <= option.startTime)) {
      showToast(t("poll_option_end_after_start"), "error");
      return;
    }

    const hasOptionWithInvalidDuration = options.some((option) => {
      const durationMinutes = Math.round((option.endTime.getTime() - option.startTime.getTime()) / 60000);
      return durationMinutes !== eventLengthMinutes;
    });

    if (hasOptionWithInvalidDuration) {
      showToast(t("poll_option_duration_mismatch", { minutes: eventLengthMinutes }), "error");
      return;
    }

    const usesParticipantEmail = participantIdentityMode === "NAME_AND_EMAIL";

    const participants = participantDrafts
      .map((participant) => {
        const name = participant.name.trim();
        const email = participant.email.trim().toLowerCase();

        if (usesParticipantEmail) {
          return {
            id: participant.id,
            name,
            email,
          };
        }

        return {
          id: participant.id,
          name,
          email: createPollAliasEmail(eventType.id, participant.id),
        };
      })
      .filter((participant) => {
        if (usesParticipantEmail) {
          return participant.name || participant.email;
        }

        return participant.name;
      });

    if (usesParticipantEmail && participants.some((participant) => !participant.name || !participant.email)) {
      showToast(t("poll_participant_name_and_email_required"), "error");
      return;
    }

    if (!usesParticipantEmail && participants.some((participant) => !participant.name)) {
      showToast(t("poll_participant_name_required"), "error");
      return;
    }

    if (usesParticipantEmail && participants.some((participant) => !EMAIL_PATTERN.test(participant.email))) {
      showToast(t("poll_invalid_participant_email"), "error");
      return;
    }

    if (!usesParticipantEmail && visibility === "INVITE_ONLY") {
      showToast(t("poll_invite_only_requires_participant_email"), "error");
      return;
    }

    if (visibility === "INVITE_ONLY" && participants.length === 0) {
      showToast(t("poll_invite_only_requires_participants"), "error");
      return;
    }

    const timeZone = eventType.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    createPollMutation.mutate({
      eventTypeId: eventType.id,
      title: trimmedTitle,
      description: description.trim() || null,
      finalizationMode,
      visibility,
      timeZone,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      options,
      participants,
    });
  };

  return (
    <div className="stack-y-6">
      <div className="rounded-lg border border-subtle p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-emphasis text-base font-semibold">{t("polls")}</h3>
            <p className="text-default text-sm">{t("polls_tab_description")}</p>
          </div>
          <Button
            type="button"
            color="secondary"
            StartIcon="plus"
            onClick={() => setIsCreateOpen((open) => !open)}>
            {isCreateOpen ? t("cancel") : t("create_poll")}
          </Button>
        </div>

        {isCreateOpen ? (
          <div className="stack-y-4 rounded-lg border border-subtle p-4">
            <TextField
              label={t("poll_title")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />

            <TextAreaField
              name="pollDescription"
              label={t("poll_description")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-default mb-1 block text-sm font-medium">
                  {t("poll_finalization_mode")}
                </label>
                <select
                  className="border-default bg-default text-default h-9 w-full rounded-[10px] border px-3 text-sm"
                  value={finalizationMode}
                  onChange={(event) =>
                    setFinalizationMode(event.target.value as "MANUAL" | "MAJORITY" | "UNANIMOUS")
                  }>
                  <option value="MANUAL">{t("poll_finalization_manual")}</option>
                  <option value="MAJORITY">{t("poll_finalization_majority")}</option>
                  <option value="UNANIMOUS">{t("poll_finalization_unanimous")}</option>
                </select>
              </div>
              <div>
                <label className="text-default mb-1 block text-sm font-medium">{t("poll_visibility")}</label>
                <select
                  className="border-default bg-default text-default h-9 w-full rounded-[10px] border px-3 text-sm"
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as "PUBLIC" | "INVITE_ONLY")}>
                  <option value="PUBLIC">{t("poll_visibility_public")}</option>
                  <option value="INVITE_ONLY">{t("poll_visibility_invite_only")}</option>
                </select>
              </div>
            </div>

            <TextField
              type="datetime-local"
              label={t("poll_expires_at")}
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <p className="text-muted -mt-2 text-xs">{t("poll_expires_at_hint")}</p>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-default text-sm font-semibold">{t("poll_options")}</h4>
                <Button type="button" color="minimal" StartIcon="plus" onClick={addOptionDraft}>
                  {t("add_poll_option")}
                </Button>
              </div>
              <p className="text-muted mb-3 text-xs">
                {t("poll_option_duration_hint", { minutes: eventLengthMinutes })}
              </p>
              <div className="stack-y-3">
                {optionDrafts.map((option, index) => (
                  <div key={option.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <TextField
                      type="datetime-local"
                      label={t("poll_option_start", { number: index + 1 })}
                      value={option.startTime}
                      onChange={(event) =>
                        setOptionDrafts((previous) =>
                          previous.map((item) =>
                            item.id === option.id ? { ...item, startTime: event.target.value } : item
                          )
                        )
                      }
                    />
                    <TextField
                      type="datetime-local"
                      label={t("poll_option_end", { number: index + 1 })}
                      value={option.endTime}
                      onChange={(event) =>
                        setOptionDrafts((previous) =>
                          previous.map((item) =>
                            item.id === option.id ? { ...item, endTime: event.target.value } : item
                          )
                        )
                      }
                    />
                    <div className="flex items-end">
                      <Button
                        type="button"
                        color="minimal"
                        StartIcon="trash"
                        disabled={optionDrafts.length <= 1}
                        onClick={() => removeOptionDraft(option.id)}>
                        {t("remove")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-default text-sm font-semibold">{t("poll_participants")}</h4>
                <Button type="button" color="minimal" StartIcon="plus" onClick={addParticipantDraft}>
                  {t("add_participant")}
                </Button>
              </div>
              <div className="mb-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-default mb-1 block text-sm font-medium">
                    {t("poll_participant_identity_mode")}
                  </label>
                  <select
                    className="border-default bg-default text-default h-9 w-full rounded-[10px] border px-3 text-sm"
                    value={participantIdentityMode}
                    onChange={(event) => {
                      const nextIdentityMode = event.target.value as ParticipantIdentityMode;
                      setParticipantIdentityMode(nextIdentityMode);
                      if (nextIdentityMode === "NAME_ONLY" && visibility === "INVITE_ONLY") {
                        setVisibility("PUBLIC");
                      }
                    }}>
                    <option value="NAME_AND_EMAIL">{t("poll_participant_identity_name_and_email")}</option>
                    <option value="NAME_ONLY">{t("poll_participant_identity_name_only")}</option>
                  </select>
                </div>
              </div>
              <p className="text-muted mb-3 text-xs">{t("poll_participants_hint")}</p>
              {participantIdentityMode === "NAME_ONLY" ? (
                <p className="text-muted mb-3 text-xs">{t("poll_participant_identity_name_only_hint")}</p>
              ) : null}
              <div className="stack-y-3">
                {participantDrafts.map((participant) => (
                  <div
                    key={participant.id}
                    className={
                      participantIdentityMode === "NAME_AND_EMAIL"
                        ? "grid gap-3 md:grid-cols-[1fr_1fr_auto]"
                        : "grid gap-3 md:grid-cols-[1fr_auto]"
                    }>
                    <TextField
                      label={t("name")}
                      value={participant.name}
                      onChange={(event) =>
                        setParticipantDrafts((previous) =>
                          previous.map((item) =>
                            item.id === participant.id ? { ...item, name: event.target.value } : item
                          )
                        )
                      }
                    />
                    {participantIdentityMode === "NAME_AND_EMAIL" ? (
                      <TextField
                        type="email"
                        label={t("email")}
                        value={participant.email}
                        onChange={(event) =>
                          setParticipantDrafts((previous) =>
                            previous.map((item) =>
                              item.id === participant.id ? { ...item, email: event.target.value } : item
                            )
                          )
                        }
                      />
                    ) : null}
                    <div className="flex items-end">
                      <Button
                        type="button"
                        color="minimal"
                        StartIcon="trash"
                        onClick={() => removeParticipantDraft(participant.id)}>
                        {t("remove")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                color="secondary"
                onClick={() => {
                  resetCreateForm();
                  setIsCreateOpen(false);
                }}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                StartIcon="plus"
                loading={createPollMutation.isPending}
                disabled={createPollMutation.isPending}
                onClick={createPoll}>
                {t("create_poll")}
              </Button>
            </div>
          </div>
        ) : null}
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
                      <Badge variant="gray">
                        {t(
                          getPollParticipantIdentityMode(poll) === "NAME_ONLY"
                            ? "poll_participant_identity_name_only"
                            : "poll_participant_identity_name_and_email"
                        )}
                      </Badge>
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
