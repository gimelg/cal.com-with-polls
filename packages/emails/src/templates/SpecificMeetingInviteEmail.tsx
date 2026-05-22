// biome-ignore-all lint/nursery/noTernary: Email template conditionals stay clearer inline.
import { APP_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export type SpecificMeetingInviteEmailProps = {
  t: TFunction;
  organizerName: string;
  participantName: string;
  meetingTitle: string;
  meetingDescription?: string | null;
  meetingTime: string;
  meetingLink: string;
  acceptLink: string;
  declineLink: string;
  hideBranding: boolean;
};

export const SpecificMeetingInviteEmail = (
  props: SpecificMeetingInviteEmailProps & Partial<React.ComponentProps<typeof BaseEmailHtml>>
): JSX.Element => {
  let bodyKey = "specific_meeting_invite_email_body";
  if (props.hideBranding) {
    bodyKey = "specific_meeting_invite_email_body_no_branding";
  }

  return (
    <BaseEmailHtml
      subject={props.t("specific_meeting_invite_email_subject", { meetingTitle: props.meetingTitle })}
      hideLogo={props.hideBranding}>
      <p style={{ fontWeight: 600, fontSize: "28px", lineHeight: "34px", marginBottom: "16px" }}>
        {props.t("specific_meeting_invite_email_heading")}
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

      <div>
        <div style={{ display: "inline-block", marginRight: "12px", marginBottom: "12px" }}>
          <CallToAction label={props.t("yes")} href={props.acceptLink} />
        </div>
        <div style={{ display: "inline-block", marginBottom: "12px" }}>
          <CallToAction label={props.t("no")} href={props.declineLink} secondary />
        </div>
      </div>

      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "20px" }}>
        {props.t("specific_meeting_invite_email_fallback")}
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "4px" }}>
        <a href={props.meetingLink} style={{ color: "#3E3E3E" }} target="_blank" rel="noreferrer">
          {props.meetingLink}
        </a>
      </p>
    </BaseEmailHtml>
  );
};
