import { Dialog } from "@calcom/features/components/controlled-dialog";
import type { EventTypeSetupProps } from "@calcom/features/eventtypes/lib/types";
import { createPollAliasEmail, isPollAliasEmail } from "@calcom/features/polls/lib/poll-types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { ConfirmationDialogContent } from "@calcom/ui/components/dialog";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { CheckboxField, TextAreaField, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useCallback, useState } from "react";

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

type ParticipantEditDraft = {
  name: string;
  email: string;
};

type AddParticipantDraft = {
  name: string;
  email: string;
};

type ResendInviteTarget = {
  pollUid: string;
  participantId: number;
  participantName: string;
  participantEmail: string;
};

type CancelPollTarget = {
  pollId: number;
  pollTitle: string;
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

const getParticipantEditKey = (pollId: number, participantId: number) => `${pollId}:${participantId}`;
const getOptionResponseToggleKey = (pollId: number, optionId: number) => `${pollId}:${optionId}`;

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

const getPollVoteVariant = (voteType: PollItem["votes"][number]["voteType"]) => {
  if (voteType === "YES") return "green" as const;
  if (voteType === "IF_NEEDED") return "orange" as const;
  return "red" as const;
};

const getPollVoteSortWeight = (voteType: PollItem["votes"][number]["voteType"]) => {
  if (voteType === "YES") return 0;
  if (voteType === "IF_NEEDED") return 1;
  return 2;
};

const getPollPublicPath = (uid: string) => `/poll/${uid}`;

const getPollPublicUrl = (uid: string) => {
  const path = getPollPublicPath(uid);
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: This component intentionally co-locates poll management interactions to avoid splitting tightly coupled mutation and UI state.
export const EventPollsTab = ({ eventType }: EventPollsTabProps) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const eventLengthMinutes = eventType.length || 30;

  const getPollVoteLabel = (voteType: PollItem["votes"][number]["voteType"]) => {
    if (voteType === "YES") return t("yes");
    if (voteType === "IF_NEEDED") return t("poll_vote_if_needed");
    return t("no");
  };

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [finalizationMode, setFinalizationMode] = useState<"MANUAL" | "MAJORITY" | "UNANIMOUS">("MANUAL");
  const [visibility, setVisibility] = useState<"PUBLIC" | "INVITE_ONLY">("PUBLIC");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [participantIdentityMode, setParticipantIdentityMode] =
    useState<ParticipantIdentityMode>("NAME_AND_EMAIL");
  const [expiresAt, setExpiresAt] = useState("");
  const [participantEdits, setParticipantEdits] = useState<Record<string, ParticipantEditDraft>>({});
  const [addParticipantDrafts, setAddParticipantDrafts] = useState<Record<number, AddParticipantDraft>>({});
  const [expandedOptionResponses, setExpandedOptionResponses] = useState<Record<string, boolean>>({});
  const [resendInviteTarget, setResendInviteTarget] = useState<ResendInviteTarget | null>(null);
  const [cancelPollTarget, setCancelPollTarget] = useState<CancelPollTarget | null>(null);
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
    setIsAnonymous(false);
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

  const reopenPollMutation = trpc.viewer.polls.reopen.useMutation({
    onSuccess: async () => {
      showToast(t("poll_reopened_successfully"), "success");
      await utils.viewer.polls.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const cancelPollMutation = trpc.viewer.polls.cancel.useMutation({
    onSuccess: async () => {
      setCancelPollTarget(null);
      showToast(t("poll_cancelled_successfully"), "success");
      await utils.viewer.polls.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const updateParticipantMutation = trpc.viewer.polls.updateParticipant.useMutation({
    onSuccess: async (_, variables) => {
      setParticipantEdits((previous) => {
        const key = getParticipantEditKey(variables.pollId, variables.participantId);
        if (!previous[key]) {
          return previous;
        }

        const next = { ...previous };
        delete next[key];
        return next;
      });

      showToast(t("poll_participant_updated_successfully"), "success");
      await utils.viewer.polls.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const addParticipantMutation = trpc.viewer.polls.addParticipant.useMutation({
    onSuccess: async (_, variables) => {
      setAddParticipantDrafts((previous) => {
        if (!previous[variables.pollId]) {
          return previous;
        }

        const next = { ...previous };
        delete next[variables.pollId];
        return next;
      });

      showToast(t("poll_participant_added_and_invited"), "success");
      await utils.viewer.polls.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const resendParticipantInviteMutation = trpc.viewer.polls.resendParticipantInvite.useMutation({
    onSuccess: () => {
      setResendInviteTarget(null);
      showToast(t("poll_participant_invite_resent_successfully"), "success");
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
      isAnonymous,
      timeZone,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      options,
      participants,
    });
  };

  const getParticipantEditDraft = (pollId: number, participant: PollItem["participants"][number]) => {
    const key = getParticipantEditKey(pollId, participant.id);
    return participantEdits[key] || { name: participant.name, email: participant.email };
  };

  const setParticipantEditField = ({
    pollId,
    participantId,
    baseName,
    baseEmail,
    field,
    value,
  }: {
    pollId: number;
    participantId: number;
    baseName: string;
    baseEmail: string;
    field: keyof ParticipantEditDraft;
    value: string;
  }) => {
    const key = getParticipantEditKey(pollId, participantId);
    setParticipantEdits((previous) => {
      const current = previous[key] || {
        name: baseName,
        email: baseEmail,
      };

      return {
        ...previous,
        [key]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const saveParticipantUpdate = ({
    pollId,
    participantId,
    baseName,
    baseEmail,
  }: {
    pollId: number;
    participantId: number;
    baseName: string;
    baseEmail: string;
  }) => {
    const key = getParticipantEditKey(pollId, participantId);
    const draft = participantEdits[key] || {
      name: baseName,
      email: baseEmail,
    };

    const trimmedName = draft.name.trim();
    const trimmedEmail = draft.email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      showToast(t("poll_participant_name_and_email_required"), "error");
      return;
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      showToast(t("poll_invalid_participant_email"), "error");
      return;
    }

    updateParticipantMutation.mutate({
      pollId,
      participantId,
      name: trimmedName,
      email: trimmedEmail,
    });
  };

  const getAddParticipantDraft = (pollId: number): AddParticipantDraft => {
    return addParticipantDrafts[pollId] || { name: "", email: "" };
  };

  const setAddParticipantField = ({
    pollId,
    field,
    value,
  }: {
    pollId: number;
    field: keyof AddParticipantDraft;
    value: string;
  }) => {
    setAddParticipantDrafts((previous) => {
      const current = previous[pollId] || { name: "", email: "" };

      return {
        ...previous,
        [pollId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const addParticipantToPoll = ({ pollId }: { pollId: number }) => {
    const draft = getAddParticipantDraft(pollId);
    const trimmedName = draft.name.trim();
    const trimmedEmail = draft.email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      showToast(t("poll_participant_name_and_email_required"), "error");
      return;
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      showToast(t("poll_invalid_participant_email"), "error");
      return;
    }

    addParticipantMutation.mutate({
      pollId,
      name: trimmedName,
      email: trimmedEmail,
    });
  };

  const requestResendParticipantInvite = ({
    pollId,
    pollUid,
    participantId,
    baseName,
    baseEmail,
  }: {
    pollId: number;
    pollUid: string;
    participantId: number;
    baseName: string;
    baseEmail: string;
  }) => {
    const key = getParticipantEditKey(pollId, participantId);
    const draft = participantEdits[key] || {
      name: baseName,
      email: baseEmail,
    };

    const normalizedDraftName = draft.name.trim();
    const normalizedDraftEmail = draft.email.trim().toLowerCase();
    const isDirty =
      normalizedDraftName !== baseName || normalizedDraftEmail !== baseEmail.trim().toLowerCase();

    if (isDirty) {
      showToast(t("poll_save_changes_before_resend"), "warning");
      return;
    }

    setResendInviteTarget({
      pollUid,
      participantId,
      participantName: baseName,
      participantEmail: baseEmail,
    });
  };

  const confirmResendParticipantInvite = () => {
    if (!resendInviteTarget) {
      return;
    }

    resendParticipantInviteMutation.mutate({
      pollUid: resendInviteTarget.pollUid,
      participantId: resendInviteTarget.participantId,
    });
  };

  const confirmCancelPoll = () => {
    if (!cancelPollTarget) {
      return;
    }

    cancelPollMutation.mutate({
      pollId: cancelPollTarget.pollId,
    });
  };

  const toggleOptionResponses = (pollId: number, optionId: number) => {
    const key = getOptionResponseToggleKey(pollId, optionId);
    setExpandedOptionResponses((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  const copyPollUrl = async (pollUid: string) => {
    try {
      await navigator.clipboard.writeText(getPollPublicUrl(pollUid));
      showToast(t("poll_link_copied"), "success");
    } catch {
      showToast(t("something_went_wrong"), "error");
    }
  };

  let pollListContent: JSX.Element;
  if (isPending) {
    pollListContent = (
      <div className="rounded-lg border border-subtle p-6 text-base text-default">{t("loading")}</div>
    );
  } else if (polls && polls.length > 0) {
    pollListContent = (
      <div className="stack-y-4">
        {/* biome-ignore lint/complexity/noExcessiveLinesPerFunction: Poll card rendering has dense conditional controls and is clearer when kept in one callback. */}
        {polls.map((poll) => {
          const finalizedOption = poll.finalizedOptionId
            ? (poll.options.find((option) => option.id === poll.finalizedOptionId) ?? null)
            : null;
          const participantsById = new Map(
            poll.participants.map((participant) => [participant.id, participant])
          );

          return (
            <div key={poll.id} className="min-w-0 overflow-hidden rounded-lg border border-subtle p-6">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-emphasis text-lg">{poll.title}</h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant={getPollStatusVariant(poll.status)}>
                      {t(`poll_status_${poll.status.toLowerCase()}`)}
                    </Badge>
                    <Badge variant="gray">
                      {t(`poll_finalization_${poll.finalizationMode.toLowerCase()}`)}
                    </Badge>
                    <Badge variant="gray">{t(`poll_visibility_${poll.visibility.toLowerCase()}`)}</Badge>
                    {poll.isAnonymous ? <Badge variant="gray">{t("poll_anonymous_badge")}</Badge> : null}
                    <Badge variant="gray">
                      {t(
                        getPollParticipantIdentityMode(poll) === "NAME_ONLY"
                          ? "poll_participant_identity_name_only"
                          : "poll_participant_identity_name_and_email"
                      )}
                    </Badge>
                  </div>
                  <p className="mt-2 text-base text-muted sm:text-sm">
                    {t("poll_response_count", {
                      participants: poll.participants.length,
                      votes: poll.votes.length,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {poll.status === "OPEN" ? (
                    <>
                      <Button
                        type="button"
                        color="secondary"
                        StartIcon="lock"
                        loading={closePollMutation.isPending}
                        disabled={
                          closePollMutation.isPending ||
                          reopenPollMutation.isPending ||
                          cancelPollMutation.isPending
                        }
                        onClick={() => closePollMutation.mutate({ pollId: poll.id })}>
                        {t("close_poll")}
                      </Button>
                      <Button
                        type="button"
                        color="minimal"
                        disabled={
                          closePollMutation.isPending ||
                          reopenPollMutation.isPending ||
                          cancelPollMutation.isPending
                        }
                        onClick={() =>
                          setCancelPollTarget({
                            pollId: poll.id,
                            pollTitle: poll.title,
                          })
                        }>
                        {t("cancel_poll")}
                      </Button>
                    </>
                  ) : null}

                  {poll.status === "CLOSED" ? (
                    <>
                      <Button
                        type="button"
                        color="secondary"
                        disabled={
                          closePollMutation.isPending ||
                          reopenPollMutation.isPending ||
                          cancelPollMutation.isPending
                        }
                        loading={reopenPollMutation.isPending}
                        onClick={() => reopenPollMutation.mutate({ pollId: poll.id })}>
                        {t("reopen_poll")}
                      </Button>
                      <Button
                        type="button"
                        color="minimal"
                        disabled={
                          closePollMutation.isPending ||
                          reopenPollMutation.isPending ||
                          cancelPollMutation.isPending
                        }
                        onClick={() =>
                          setCancelPollTarget({
                            pollId: poll.id,
                            pollTitle: poll.title,
                          })
                        }>
                        {t("cancel_poll")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="stack-y-2">
                {poll.options.map((option, index) => {
                  const voteCounts = getPollOptionVoteCounts(poll, option.id);
                  const isFinalizedOption = poll.finalizedOptionId === option.id;
                  const responseToggleKey = getOptionResponseToggleKey(poll.id, option.id);
                  const isResponsesExpanded = expandedOptionResponses[responseToggleKey] ?? false;
                  const optionResponses = poll.votes
                    .filter((vote) => vote.pollOptionId === option.id)
                    .map((vote) => {
                      const participant = participantsById.get(vote.participantId);
                      if (!participant) {
                        return null;
                      }

                      return {
                        participantId: participant.id,
                        participantName: participant.name,
                        voteType: vote.voteType,
                      };
                    })
                    .filter(
                      (
                        response
                      ): response is {
                        participantId: number;
                        participantName: string;
                        voteType: PollItem["votes"][number]["voteType"];
                      } => Boolean(response)
                    )
                    .sort((left, right) => {
                      const voteWeightDifference =
                        getPollVoteSortWeight(left.voteType) - getPollVoteSortWeight(right.voteType);
                      if (voteWeightDifference !== 0) {
                        return voteWeightDifference;
                      }

                      return left.participantName.localeCompare(right.participantName);
                    });

                  return (
                    <div key={option.id} className="rounded-md border border-subtle px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-base text-default">
                            {t("poll_option_number", { number: index + 1 })}
                          </p>
                          <p className="text-base text-muted sm:text-sm">
                            {new Date(option.startTime).toLocaleString()} -{" "}
                            {new Date(option.endTime).toLocaleString()}
                          </p>
                          <p className="text-base text-muted sm:text-sm">
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

                      <div className="mt-2">
                        <Button
                          type="button"
                          size="sm"
                          color="minimal"
                          onClick={() => toggleOptionResponses(poll.id, option.id)}>
                          {isResponsesExpanded ? t("poll_hide_responses") : t("poll_show_responses")}
                        </Button>
                      </div>

                      {isResponsesExpanded ? (
                        <div className="mt-2 rounded-md border border-subtle bg-subtle p-2">
                          {optionResponses.length > 0 ? (
                            <div className="stack-y-2">
                              {optionResponses.map((response) => (
                                <div
                                  key={response.participantId}
                                  className="flex items-center justify-between gap-2 rounded-md border border-subtle px-2 py-1">
                                  <p className="text-base text-default">{response.participantName}</p>
                                  <Badge variant={getPollVoteVariant(response.voteType)}>
                                    {getPollVoteLabel(response.voteType)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-base text-muted sm:text-sm">
                              {t("poll_no_option_responses_yet")}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {poll.visibility === "INVITE_ONLY" ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h5 className="font-semibold text-base text-default">{t("poll_invited_participants")}</h5>
                  </div>
                  <p className="mb-3 text-base text-muted sm:text-sm">
                    {t("poll_invited_participants_edit_hint")}
                  </p>

                  {poll.status === "OPEN" ? (
                    <div className="mb-4 rounded-md border border-subtle bg-subtle p-3">
                      <p className="mb-2 font-medium text-base text-default sm:text-sm">
                        {t("poll_add_participant_after_creation")}
                      </p>
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <TextField
                          label={t("name")}
                          placeholder={t("poll_participant_name_placeholder")}
                          value={getAddParticipantDraft(poll.id).name}
                          onChange={(event) =>
                            setAddParticipantField({
                              pollId: poll.id,
                              field: "name",
                              value: event.target.value,
                            })
                          }
                        />
                        <TextField
                          type="email"
                          label={t("email")}
                          placeholder={t("poll_participant_email_placeholder")}
                          value={getAddParticipantDraft(poll.id).email}
                          onChange={(event) =>
                            setAddParticipantField({
                              pollId: poll.id,
                              field: "email",
                              value: event.target.value,
                            })
                          }
                        />
                        <div className="flex items-end">
                          <Button
                            type="button"
                            StartIcon="plus"
                            loading={addParticipantMutation.isPending}
                            disabled={addParticipantMutation.isPending}
                            onClick={() => addParticipantToPoll({ pollId: poll.id })}>
                            {t("poll_add_participant")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {poll.participants.length > 0 ? (
                    <div className="stack-y-3">
                      {poll.participants.map((participant) => {
                        const draft = getParticipantEditDraft(poll.id, participant);
                        const normalizedDraftName = draft.name.trim();
                        const normalizedDraftEmail = draft.email.trim().toLowerCase();
                        const isDirty =
                          normalizedDraftName !== participant.name ||
                          normalizedDraftEmail !== participant.email.toLowerCase();

                        return (
                          <div key={participant.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
                            <TextField
                              label={t("name")}
                              value={draft.name}
                              onChange={(event) =>
                                setParticipantEditField({
                                  pollId: poll.id,
                                  participantId: participant.id,
                                  baseName: participant.name,
                                  baseEmail: participant.email,
                                  field: "name",
                                  value: event.target.value,
                                })
                              }
                            />
                            <TextField
                              type="email"
                              label={t("email")}
                              value={draft.email}
                              onChange={(event) =>
                                setParticipantEditField({
                                  pollId: poll.id,
                                  participantId: participant.id,
                                  baseName: participant.name,
                                  baseEmail: participant.email,
                                  field: "email",
                                  value: event.target.value,
                                })
                              }
                            />
                            <div className="flex items-end">
                              <Button
                                type="button"
                                color="secondary"
                                loading={updateParticipantMutation.isPending}
                                disabled={updateParticipantMutation.isPending || !isDirty}
                                onClick={() =>
                                  saveParticipantUpdate({
                                    pollId: poll.id,
                                    participantId: participant.id,
                                    baseName: participant.name,
                                    baseEmail: participant.email,
                                  })
                                }>
                                {t("save")}
                              </Button>
                            </div>
                            <div className="flex items-end">
                              <Button
                                type="button"
                                color="minimal"
                                loading={resendParticipantInviteMutation.isPending}
                                disabled={
                                  updateParticipantMutation.isPending ||
                                  resendParticipantInviteMutation.isPending
                                }
                                onClick={() =>
                                  requestResendParticipantInvite({
                                    pollId: poll.id,
                                    pollUid: poll.uid,
                                    participantId: participant.id,
                                    baseName: participant.name,
                                    baseEmail: participant.email,
                                  })
                                }>
                                {t("poll_resend_invite")}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-base text-muted sm:text-sm">{t("poll_no_participants_yet")}</p>
                  )}
                </div>
              ) : null}

              {poll.status === "FINALIZED" && finalizedOption ? (
                <p className="mt-3 text-base text-default">
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

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-base text-muted sm:text-sm">{t("poll_uid_hint", { uid: poll.uid })}</p>
                <a
                  className="text-base text-blue-600 hover:underline sm:text-sm"
                  href={getPollPublicPath(poll.uid)}
                  target="_blank"
                  rel="noreferrer">
                  {getPollPublicPath(poll.uid)}
                </a>
                <Button
                  type="button"
                  size="sm"
                  color="minimal"
                  onClick={() => {
                    void copyPollUrl(poll.uid);
                  }}>
                  {t("poll_copy_link")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    pollListContent = (
      <EmptyScreen
        Icon="users"
        headline={t("no_polls_created")}
        description={t("no_polls_created_description")}
      />
    );
  }

  return (
    <div className="stack-y-6 min-w-0 [&_button]:text-base sm:[&_button]:text-sm">
      <div className="rounded-lg border border-subtle p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-emphasis text-lg">{t("polls")}</h3>
            <p className="text-base text-default">{t("polls_tab_description")}</p>
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
                <label className="mb-1 block font-medium text-base text-default">
                  {t("poll_finalization_mode")}
                </label>
                <select
                  className="h-10 w-full rounded-[10px] border border-default bg-default px-3 text-base text-default"
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
                <label className="mb-1 block font-medium text-base text-default">
                  {t("poll_visibility")}
                </label>
                <select
                  className="h-10 w-full rounded-[10px] border border-default bg-default px-3 text-base text-default"
                  value={visibility}
                  onChange={(event) => {
                    const nextVisibility = event.target.value as "PUBLIC" | "INVITE_ONLY";
                    setVisibility(nextVisibility);
                    if (nextVisibility === "INVITE_ONLY") {
                      setIsAnonymous(false);
                    }
                  }}>
                  <option value="PUBLIC">{t("poll_visibility_public")}</option>
                  <option value="INVITE_ONLY">{t("poll_visibility_invite_only")}</option>
                </select>
              </div>
            </div>

            {visibility !== "INVITE_ONLY" ? (
              <div>
                <CheckboxField
                  checked={isAnonymous}
                  onChange={(event) => setIsAnonymous(event.target.checked)}
                  description={t("poll_anonymous_responses")}
                />
                <p className="mt-1 ml-7 text-base text-muted sm:text-sm">
                  {t("poll_anonymous_responses_hint")}
                </p>
              </div>
            ) : null}

            <TextField
              type="datetime-local"
              label={t("poll_expires_at")}
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <p className="-mt-2 text-base text-muted sm:text-sm">{t("poll_expires_at_hint")}</p>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-semibold text-base text-default">{t("poll_options")}</h4>
                <Button type="button" color="minimal" StartIcon="plus" onClick={addOptionDraft}>
                  {t("add_poll_option")}
                </Button>
              </div>
              <p className="mb-3 text-base text-muted sm:text-sm">
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
              <div className="mb-2">
                <h4 className="font-semibold text-base text-default">{t("poll_participants")}</h4>
              </div>
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="w-full md:max-w-sm">
                  <label className="mb-1 block font-medium text-base text-default">
                    {t("poll_participant_identity_mode")}
                  </label>
                  <select
                    className="h-10 w-full rounded-[10px] border border-default bg-default px-3 text-base text-default"
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
                <Button type="button" color="minimal" StartIcon="plus" onClick={addParticipantDraft}>
                  {t("add_participant")}
                </Button>
              </div>
              <p className="mb-3 text-base text-muted sm:text-sm">{t("poll_participants_hint")}</p>
              {participantIdentityMode === "NAME_ONLY" ? (
                <p className="mb-3 text-base text-muted sm:text-sm">
                  {t("poll_participant_identity_name_only_hint")}
                </p>
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
                      placeholder={t("poll_participant_name_placeholder")}
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
                        placeholder={t("poll_participant_email_placeholder")}
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

      {pollListContent}

      <Dialog
        open={Boolean(resendInviteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setResendInviteTarget(null);
          }
        }}>
        <ConfirmationDialogContent
          isPending={resendParticipantInviteMutation.isPending}
          title={t("poll_resend_invite_confirmation_title")}
          confirmBtnText={t("poll_resend_invite")}
          loadingText={t("poll_resend_invite")}
          onConfirm={(event) => {
            event.preventDefault();
            confirmResendParticipantInvite();
          }}>
          <p className="mt-2 text-base sm:text-sm">
            {resendInviteTarget
              ? t("poll_resend_invite_confirmation_message", {
                  name: resendInviteTarget.participantName,
                  email: resendInviteTarget.participantEmail,
                })
              : ""}
          </p>
        </ConfirmationDialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelPollTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelPollTarget(null);
          }
        }}>
        <ConfirmationDialogContent
          isPending={cancelPollMutation.isPending}
          title={t("poll_cancel_confirmation_title")}
          confirmBtnText={t("cancel_poll")}
          loadingText={t("cancel_poll")}
          onConfirm={(event) => {
            event.preventDefault();
            confirmCancelPoll();
          }}>
          <p className="mt-2 text-base sm:text-sm">
            {cancelPollTarget
              ? t("poll_cancel_confirmation_message", {
                  title: cancelPollTarget.pollTitle,
                })
              : ""}
          </p>
        </ConfirmationDialogContent>
      </Dialog>
    </div>
  );
};
