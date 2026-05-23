import { WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export type SpecificMeetingBookingFailedEmailProps = {
  t: TFunction;
  organizerName: string;
  meetingTitle: string;
  meetingTime: string;
  meetingLink: string;
  appsLink: string;
  failureReason?: string | null;
  hideBranding: boolean;
};

export const SpecificMeetingBookingFailedEmail = (
  props: SpecificMeetingBookingFailedEmailProps & Partial<React.ComponentProps<typeof BaseEmailHtml>>
): JSX.Element => {
  return (
    <BaseEmailHtml
      subject={props.t("specific_meeting_booking_failed_email_subject", { meetingTitle: props.meetingTitle })}
      hideLogo={props.hideBranding}>
      <p style={{ fontWeight: 600, fontSize: "28px", lineHeight: "34px", marginBottom: "16px" }}>
        {props.t("specific_meeting_booking_failed_email_heading")}
      </p>

      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        {props.t("specific_meeting_booking_failed_email_body", {
          organizerName: props.organizerName,
          meetingTitle: props.meetingTitle,
          meetingTime: props.meetingTime,
        })}
      </p>

      {props.failureReason ? (
        <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "12px" }}>
          <strong>{props.t("specific_meeting_booking_failed_email_reason")}:</strong> {props.failureReason}
        </p>
      ) : null}

      <div style={{ marginTop: "20px", marginBottom: "20px" }}>
        <CallToAction label={props.t("specific_meeting_booking_failed_email_manage_apps")} href={props.appsLink} />
      </div>

      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "20px" }}>
        {props.t("specific_meeting_booking_failed_email_fallback")}
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "4px" }}>
        <a href={props.meetingLink} style={{ color: "#3E3E3E" }} target="_blank" rel="noreferrer">
          {props.meetingLink}
        </a>
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "4px" }}>
        <a href={props.appsLink || `${WEBAPP_URL}/apps/installed`} style={{ color: "#3E3E3E" }} target="_blank" rel="noreferrer">
          {props.appsLink}
        </a>
      </p>
    </BaseEmailHtml>
  );
};
