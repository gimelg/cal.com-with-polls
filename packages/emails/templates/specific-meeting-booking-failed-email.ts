import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type SpecificMeetingBookingFailedEmailInput = {
  to: string;
  organizerName: string;
  meetingTitle: string;
  meetingTime: string;
  meetingLink: string;
  appsLink: string;
  failureReason?: string | null;
  hideBranding: boolean;
  t: TFunction;
};

export default class SpecificMeetingBookingFailedEmail extends BaseEmail {
  input: SpecificMeetingBookingFailedEmailInput;

  constructor(input: SpecificMeetingBookingFailedEmailInput) {
    super();
    this.name = "SEND_SPECIFIC_MEETING_BOOKING_FAILED_EMAIL";
    this.input = input;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.input.to,
      subject: this.input.t("specific_meeting_booking_failed_email_subject", {
        meetingTitle: this.input.meetingTitle,
      }),
      html: await renderEmail("SpecificMeetingBookingFailedEmail", this.input),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    return `${this.input.t("specific_meeting_booking_failed_email_heading")}

${this.input.t("specific_meeting_booking_failed_email_body", {
  organizerName: this.input.organizerName,
  meetingTitle: this.input.meetingTitle,
  meetingTime: this.input.meetingTime,
})}

${this.input.failureReason ? `${this.input.t("specific_meeting_booking_failed_email_reason")}: ${this.input.failureReason}

` : ""}${this.input.t("specific_meeting_booking_failed_email_manage_apps")}: ${this.input.appsLink}
${this.input.t("specific_meeting_booking_failed_email_view_meeting")}: ${this.input.meetingLink}`;
  }
}
