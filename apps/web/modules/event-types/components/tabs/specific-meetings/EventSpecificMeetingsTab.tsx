// biome-ignore-all lint/nursery/useExplicitType: This tab intentionally relies on React and tRPC inference to keep the implementation compact.
// biome-ignore-all lint/nursery/noTernary: Inline state updates and JSX conditionals keep this tab small and localized.
"use client";

import type { EventTypeSetupProps } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { TextAreaField, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useState } from "react";

type EventSpecificMeetingsTabProps = {
  eventType: EventTypeSetupProps["eventType"];
};

type MeetingItem = RouterOutputs["viewer"]["specificMeetings"]["listByEventType"][number];

type ParticipantDraft = {
  id: number;
  name: string;
  email: string;
};

const toDateTimeLocalInputValue = (date: Date) => {
  const dateWithoutTimezoneOffset = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return dateWithoutTimezoneOffset.toISOString().slice(0, 16);
};

const createParticipantDraft = (id: number): ParticipantDraft => ({
  id,
  name: "",
  email: "",
});

const getStatusVariant = (status: MeetingItem["status"]) => {
  if (status === "SCHEDULED") return "green" as const;
  return "gray" as const;
};

export const EventSpecificMeetingsTab = ({ eventType }: EventSpecificMeetingsTabProps) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState(toDateTimeLocalInputValue(new Date(Date.now() + 86400000)));
  const [participants, setParticipants] = useState<ParticipantDraft[]>([createParticipantDraft(1)]);

  const { data: meetings, isPending } = trpc.viewer.specificMeetings.listByEventType.useQuery({
    eventTypeId: eventType.id,
  });

  const createMutation = trpc.viewer.specificMeetings.create.useMutation({
    onSuccess: async () => {
      showToast(t("specific_meeting_created_successfully"), "success");
      setTitle("");
      setDescription("");
      setStartTime(toDateTimeLocalInputValue(new Date(Date.now() + 86400000)));
      setParticipants([createParticipantDraft(1)]);
      await utils.viewer.specificMeetings.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const cancelMutation = trpc.viewer.specificMeetings.cancel.useMutation({
    onSuccess: async () => {
      showToast(t("specific_meeting_cancelled_successfully"), "success");
      await utils.viewer.specificMeetings.listByEventType.invalidate({ eventTypeId: eventType.id });
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const resendInviteMutation = trpc.viewer.specificMeetings.resendInvite.useMutation({
    onSuccess: () => {
      showToast(t("specific_meeting_invite_resent_successfully"), "success");
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const addParticipant = () => {
    setParticipants((previous) => {
      const nextId = previous.length > 0 ? Math.max(...previous.map((participant) => participant.id)) + 1 : 1;
      return [...previous, createParticipantDraft(nextId)];
    });
  };

  const updateParticipant = (participantId: number, field: "name" | "email", value: string) => {
    setParticipants((previous) =>
      previous.map((participant) =>
        participant.id === participantId ? { ...participant, [field]: value } : participant
      )
    );
  };

  const removeParticipant = (participantId: number) => {
    setParticipants((previous) => {
      if (previous.length <= 1) {
        return previous;
      }

      return previous.filter((participant) => participant.id !== participantId);
    });
  };

  const handleCreate = () => {
    const trimmedParticipants = participants
      .map((participant) => ({
        name: participant.name.trim(),
        email: participant.email.trim().toLowerCase(),
      }))
      .filter((participant) => participant.name && participant.email);

    if (!title.trim()) {
      showToast(t("specific_meeting_title_required"), "error");
      return;
    }

    if (trimmedParticipants.length === 0) {
      showToast(t("specific_meeting_participant_required"), "error");
      return;
    }

    const parsedStart = new Date(startTime);
    const endTime = new Date(parsedStart.getTime() + eventType.length * 60000);

    createMutation.mutate({
      eventTypeId: eventType.id,
      title: title.trim(),
      description: description.trim() || null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      startTime: parsedStart,
      endTime,
      participants: trimmedParticipants,
    });
  };

  const copyInviteLink = async (responseUrl: string) => {
    try {
      const absoluteUrl = new URL(responseUrl, window.location.origin).toString();
      await navigator.clipboard.writeText(absoluteUrl);
      showToast(t("link_copied"), "success");
    } catch {
      showToast(t("error_copying_to_clipboard"), "error");
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-subtle p-6">
        <div className="mb-4">
          <h3 className="font-semibold text-emphasis text-lg">{t("specific_meetings")}</h3>
          <p className="text-default">{t("specific_meetings_tab_description")}</p>
        </div>

        <div className="grid gap-4">
          <TextField name="specificMeetingTitle" label={t("title")} value={title} onChange={(event) => setTitle(event.target.value)} />
          <TextAreaField
            name="description"
            label={t("description")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <TextField
            name="specificMeetingStartTime"
            type="datetime-local"
            label={t("specific_meeting_start_time")}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-medium text-emphasis">{t("specific_meeting_invitees")}</p>
            <Button color="secondary" onClick={addParticipant}>
              {t("add_participant")}
            </Button>
          </div>
          {participants.map((participant) => (
            <div
              className="grid gap-3 rounded-lg border border-subtle p-4 md:grid-cols-[1fr_1fr_auto]"
              key={participant.id}>
              <TextField
                name={`participant-name-${participant.id}`}
                label={t("name")}
                value={participant.name}
                onChange={(event) => updateParticipant(participant.id, "name", event.target.value)}
              />
              <TextField
                name={`participant-email-${participant.id}`}
                label={t("email")}
                value={participant.email}
                onChange={(event) => updateParticipant(participant.id, "email", event.target.value)}
              />
              <div className="flex items-end">
                <Button color="secondary" onClick={() => removeParticipant(participant.id)}>
                  {t("remove")}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <Button loading={createMutation.isPending} onClick={handleCreate}>
            {t("create_specific_meeting")}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-subtle p-6">
        <div className="mb-4">
          <h3 className="font-semibold text-emphasis text-lg">{t("specific_meeting_existing")}</h3>
        </div>

        {isPending ? <p>{t("loading")}</p> : null}

        {!isPending && meetings && meetings.length === 0 ? (
          <EmptyScreen
            Icon="calendar"
            headline={t("no_specific_meetings_created")}
            description={t("no_specific_meetings_created_description")}
          />
        ) : null}

        <div className="space-y-4">
          {meetings?.map((meeting) => (
            <div className="rounded-lg border border-subtle p-4" key={meeting.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-emphasis">{meeting.title}</p>
                  <p className="text-sm text-subtle">
                    {new Date(meeting.startTime).toLocaleString()} —{" "}
                    {new Date(meeting.endTime).toLocaleString()}
                  </p>
                </div>
                <Badge variant={getStatusVariant(meeting.status)}>{meeting.status}</Badge>
              </div>

              {meeting.description ? <p className="mt-3 text-default">{meeting.description}</p> : null}

              <div className="mt-4 flex justify-end">
                <Button
                  color="secondary"
                  disabled={meeting.status === "CANCELLED"}
                  loading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate({ uid: meeting.uid })}>
                  {t("cancel")}
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                {meeting.invitees.map((invitee) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-subtle px-3 py-2"
                    key={invitee.id}>
                    <div>
                      <p className="text-default">
                        {invitee.name} ({invitee.email})
                      </p>
                      <p className="text-sm text-subtle">{invitee.status}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button color="secondary" onClick={() => void copyInviteLink(invitee.responseUrl)}>
                        {t("specific_meeting_copy_invite_link")}
                      </Button>
                      <Button
                        color="secondary"
                        loading={resendInviteMutation.isPending}
                        onClick={() => resendInviteMutation.mutate({ uid: meeting.uid, inviteeId: invitee.id })}>
                        {t("specific_meeting_resend_invite")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
