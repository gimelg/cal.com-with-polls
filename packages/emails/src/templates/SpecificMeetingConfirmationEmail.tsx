// biome-ignore-all lint/nursery/noTernary: Email template conditionals stay clearer inline.
import { APP_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export type SpecificMeetingConfirmationEmailProps = {
  t: TFunction;
  organizerName: string;
  participantName: string;
  meetingTitle: string;
  meetingDescription?: string | null;
  meetingTime: string;
  meetingLink: string;
  cancelLink: string;
  rescheduleLink: string;
  inviteeStatuses: Array<{
    name: string;
    status: "PENDING" | "ACCEPTED" | "DECLINED";
  }>;
  hideBranding: boolean;
};

export const SpecificMeetingConfirmationEmail = (
  props: SpecificMeetingConfirmationEmailProps & Partial<React.ComponentProps<typeof BaseEmailHtml>>
): JSX.Element => {
  const bodyKey = props.hideBranding
    ? "specific_meeting_confirmation_email_body_no_branding"
    : "specific_meeting_confirmation_email_body";

  return (
    <BaseEmailHtml
      subject={props.t("specific_meeting_confirmation_email_subject", { meetingTitle: props.meetingTitle })}
      hideLogo={props.hideBranding}>
      <p style={{ fontWeight: 600, fontSize: "28px", lineHeight: "34px", marginBottom: "16px" }}>
        {props.t("specific_meeting_confirmation_email_heading")}
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

      <div style={{ marginTop: "16px", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px" }}>
        <p style={{ fontWeight: 600, lineHeight: "24px", margin: "0 0 8px" }}>
          {props.t("specific_meeting_confirmation_email_invitee_statuses")}
        </p>
        {props.inviteeStatuses.map((invitee) => (
          <p key={invitee.name} style={{ fontWeight: 400, lineHeight: "24px", margin: "0 0 4px" }}>
            <strong>{invitee.name}:</strong>{" "}
            {props.t(`specific_meeting_invitee_status_${invitee.status.toLowerCase()}`)}
          </p>
        ))}
      </div>

      <hr style={{ marginTop: "24px", marginBottom: "24px" }} />

      <div>
        <div style={{ display: "inline-block", marginRight: "12px", marginBottom: "12px" }}>
          <CallToAction
            label={props.t("specific_meeting_confirmation_email_reschedule_cta")}
            href={props.rescheduleLink}
            secondary
          />
        </div>
        <div style={{ display: "inline-block", marginBottom: "12px" }}>
          <CallToAction
            label={props.t("specific_meeting_confirmation_email_cancel_cta")}
            href={props.cancelLink}
            secondary
          />
        </div>
      </div>

      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "20px" }}>
        {props.t("specific_meeting_confirmation_email_fallback")}
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "4px" }}>
        <a href={props.meetingLink} style={{ color: "#3E3E3E" }} target="_blank" rel="noreferrer">
          {props.meetingLink}
        </a>
      </p>
    </BaseEmailHtml>
  );
};
