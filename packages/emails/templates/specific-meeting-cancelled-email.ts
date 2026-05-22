// biome-ignore-all lint/nursery/noTernary: The email body key selection is intentionally simple and local.
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type SpecificMeetingCancelledEmailInput = {
  to: string;
  organizerName: string;
  participantName: string;
  meetingTitle: string;
  meetingDescription?: string | null;
  meetingTime: string;
  meetingLink: string;
  hideBranding: boolean;
  t: TFunction;
};

export default class SpecificMeetingCancelledEmail extends BaseEmail {
  input: SpecificMeetingCancelledEmailInput;

  constructor(input: SpecificMeetingCancelledEmailInput) {
    super();
    this.name = "SEND_SPECIFIC_MEETING_CANCELLED_EMAIL";
    this.input = input;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.input.to,
      subject: this.input.t("specific_meeting_cancelled_email_subject", {
        meetingTitle: this.input.meetingTitle,
      }),
      html: await renderEmail("SpecificMeetingCancelledEmail", this.input),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    const bodyKey = this.input.hideBranding
      ? "specific_meeting_cancelled_email_body_no_branding"
      : "specific_meeting_cancelled_email_body";

    return `${this.input.t("specific_meeting_cancelled_email_heading")}

${this.input.t(bodyKey, {
  participantName: this.input.participantName,
  organizerName: this.input.organizerName,
  meetingTitle: this.input.meetingTitle,
  meetingTime: this.input.meetingTime,
  appName: "Cal.com",
})}

${this.input.meetingLink}`;
  }
}
