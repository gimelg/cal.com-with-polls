// biome-ignore-all lint/nursery/useExplicitType: The component helpers are local and stay readable with React inference.
// biome-ignore-all lint/nursery/noTernary: Inline JSX conditionals keep the public RSVP page compact.
"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { showToast } from "@calcom/ui/components/toast";
import { useCallback, useEffect, useState } from "react";

type PublicSpecificMeetingPageProps = {
  uid: string;
  token: string;
  response?: "ACCEPTED" | "DECLINED";
};

type InviteeStatus = "PENDING" | "ACCEPTED" | "DECLINED";
type MeetingStatus = "SCHEDULED" | "CANCELLED";

type MeetingResponse = {
  uid: string;
  title: string;
  description: string | null;
  timeZone: string;
  startTime: string | Date;
  endTime: string | Date;
  status: MeetingStatus;
  organizer: {
    name: string | null;
    email: string | null;
  };
  invitee: {
    id: number;
    name: string;
    email: string;
    status: InviteeStatus;
    respondedAt: string | Date | null;
  };
  invitees: Array<{
    id: number;
    name: string;
    email: string;
    status: InviteeStatus;
    respondedAt: string | Date | null;
  }>;
};

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
  };
};

const getTrpcErrorMessage = (payload: unknown) => {
  if (Array.isArray(payload) && payload[0] && typeof payload[0] === "object") {
    return (payload[0] as TrpcErrorResult).error?.message ?? null;
  }

  if (payload && typeof payload === "object") {
    return (payload as TrpcErrorResult).error?.message ?? null;
  }

  return null;
};

const formatDateTime = (date: string | Date) => new Date(date).toLocaleString();

export const PublicSpecificMeetingPage = ({ uid, token, response }: PublicSpecificMeetingPageProps) => {
  const { t } = useLocale();
  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAutoResponded, setHasAutoResponded] = useState(false);

  const loadMeeting = useCallback(async () => {
    try {
      setIsPending(true);
      setErrorMessage(null);

      const input = encodeURIComponent(
        JSON.stringify({
          0: {
            json: {
              uid,
              token,
            },
          },
        })
      );

      const response = await fetch(`/api/trpc/public/specificMeetings.getByUid?batch=1&input=${input}`);
      const payload = (await response.json()) as TrpcBatchResult<MeetingResponse>[];
      const result = payload[0]?.result?.data?.json;

      if (!response.ok || !result) {
        setErrorMessage(payload[0]?.error?.message || t("specific_meeting_invite_not_found"));
        setMeeting(null);
        setIsPending(false);
        return;
      }

      setMeeting(result);
      setIsPending(false);
    } catch {
      setMeeting(null);
      setErrorMessage(t("something_went_wrong"));
      setIsPending(false);
    }
  }, [t, token, uid]);

  useEffect(() => {
    void loadMeeting();
  }, [loadMeeting]);

  useEffect(() => {
    if (!response || !meeting || hasAutoResponded || isSubmitting) return;
    if (meeting.status === "CANCELLED" || meeting.invitee.status !== "PENDING") return;
    setHasAutoResponded(true);
    void respond(response);
  }, [hasAutoResponded, isSubmitting, meeting, response]);

  const respond = async (responseValue: "ACCEPTED" | "DECLINED") => {
    try {
      setIsSubmitting(true);
      const response = await fetch("/api/trpc/public/specificMeetings.respond", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            uid,
            token,
            response: responseValue,
          },
        }),
      });
      const payload = (await response.json()) as unknown;
      const trpcErrorMessage = getTrpcErrorMessage(payload);

      if (!response.ok || trpcErrorMessage) {
        const message = trpcErrorMessage || t("something_went_wrong");
        showToast(message, "error");
        setErrorMessage(message);
        setIsSubmitting(false);
        return;
      }

      showToast(
        responseValue === "ACCEPTED"
          ? t("specific_meeting_response_accepted")
          : t("specific_meeting_response_declined"),
        "success"
      );
      setErrorMessage(null);
      setIsSubmitting(false);
      void loadMeeting();
    } catch {
      const message = t("something_went_wrong");
      showToast(message, "error");
      setErrorMessage(message);
      setIsSubmitting(false);
    }
  };

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-subtle p-6 text-default">{t("loading")}</div>
      </div>
    );
  }

  if (errorMessage || !meeting) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyScreen
          Icon="calendar"
          headline={t("specific_meeting_invite_not_found")}
          description={errorMessage || t("something_went_wrong")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-subtle p-6">
        <p className="font-semibold text-2xl text-emphasis">{meeting.title}</p>
        {meeting.description ? <p className="mt-3 text-default">{meeting.description}</p> : null}

        <div className="mt-6 space-y-2 text-default">
          <p>
            <span className="font-medium text-emphasis">{t("specific_meeting_when")}: </span>
            {formatDateTime(meeting.startTime)} — {formatDateTime(meeting.endTime)}
          </p>
          <p>
            <span className="font-medium text-emphasis">{t("specific_meeting_timezone")}: </span>
            {meeting.timeZone}
          </p>
          <p>
            <span className="font-medium text-emphasis">{t("specific_meeting_organizer")}: </span>
            {meeting.organizer.name || meeting.organizer.email || "-"}
          </p>
          <p>
            <span className="font-medium text-emphasis">{t("specific_meeting_your_status")}: </span>
            {meeting.invitee.status}
          </p>
        </div>

        {meeting.status === "CANCELLED" ? (
          <div className="mt-6 rounded-lg border border-subtle bg-muted p-4 text-default">
            {t("specific_meeting_cancelled")}
          </div>
        ) : (
          <div className="mt-6 flex gap-3">
            <Button loading={isSubmitting} onClick={() => void respond("ACCEPTED")}>
              {t("yes")} 
            </Button>
            <Button color="secondary" loading={isSubmitting} onClick={() => void respond("DECLINED")}>
              {t("no")}
            </Button>
          </div>
        )}

        <div className="mt-8">
          <p className="font-medium text-emphasis">{t("specific_meeting_participants")}</p>
          <ul className="mt-3 space-y-2 text-default">
            {meeting.invitees.map((invitee) => (
              <li
                className="flex items-center justify-between gap-3 rounded-md border border-subtle px-3 py-2"
                key={invitee.id}>
                <span>{invitee.name}</span>
                <span className="text-sm text-subtle">{invitee.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
