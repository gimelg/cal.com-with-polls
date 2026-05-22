// biome-ignore-all lint/nursery/noTernary: Email template conditionals stay clearer inline.
import { APP_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml } from "../components";

export type SpecificMeetingCancelledEmailProps = {
  t: TFunction;
  organizerName: string;
  participantName: string;
  meetingTitle: string;
  meetingDescription?: string | null;
  meetingTime: string;
  meetingLink: string;
  hideBranding: boolean;
};

export const SpecificMeetingCancelledEmail = (
  props: SpecificMeetingCancelledEmailProps & Partial<React.ComponentProps<typeof BaseEmailHtml>>
): JSX.Element => {
  const bodyKey = props.hideBranding
    ? "specific_meeting_cancelled_email_body_no_branding"
    : "specific_meeting_cancelled_email_body";

  return (
    <BaseEmailHtml
      subject={props.t("specific_meeting_cancelled_email_subject", { meetingTitle: props.meetingTitle })}
      hideLogo={props.hideBranding}>
      <p style={{ fontWeight: 600, fontSize: "28px", lineHeight: "34px", marginBottom: "16px" }}>
        {props.t("specific_meeting_cancelled_email_heading")}
      </p>

      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        {props.t(bodyKey, {
          participantName: props.participantName,
          organizerName: props.organizerName,
          meetingTitle: props.meetingTitle,
          meetingTime: props.meetingTime,
          appName: APP_NAME,
        })}
      </p>

      <div style={{ marginTop: "16px", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px" }}>
        <p style={{ fontWeight: 600, lineHeight: "24px", margin: "0 0 8px" }}>{props.t("meeting_details")}</p>
        <p style={{ fontWeight: 400, lineHeight: "24px", margin: "0 0 4px" }}>
          <strong>{props.t("title")}:</strong> {props.meetingTitle}
        </p>
        <p style={{ fontWeight: 400, lineHeight: "24px", margin: "0 0 4px" }}>
          <strong>{props.t("specific_meeting_when")}:</strong> {props.meetingTime}
        </p>
        <p style={{ fontWeight: 400, lineHeight: "24px", margin: "0 0 4px" }}>
          <strong>{props.t("specific_meeting_organizer")}:</strong> {props.organizerName}
        </p>
        {props.meetingDescription ? (
          <p style={{ fontWeight: 400, lineHeight: "24px", margin: 0 }}>
            <strong>{props.t("description")}:</strong> {props.meetingDescription}
          </p>
        ) : null}
      </div>

      <hr style={{ marginTop: "24px", marginBottom: "24px" }} />
    </BaseEmailHtml>
  );
};
