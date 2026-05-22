// biome-ignore-all lint/nursery/noTernary: The email body key selection is intentionally simple and local.
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type SpecificMeetingInviteEmailInput = {
  to: string;
  organizerName: string;
  participantName: string;
  meetingTitle: string;
  meetingDescription?: string | null;
  meetingTime: string;
  meetingLink: string;
  acceptLink: string;
  declineLink: string;
  hideBranding: boolean;
  t: TFunction;
};

export default class SpecificMeetingInviteEmail extends BaseEmail {
  input: SpecificMeetingInviteEmailInput;

  constructor(input: SpecificMeetingInviteEmailInput) {
    super();
    this.name = "SEND_SPECIFIC_MEETING_INVITE_EMAIL";
    this.input = input;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.input.to,
      subject: this.input.t("specific_meeting_invite_email_subject", {
        meetingTitle: this.input.meetingTitle,
      }),
      html: await renderEmail("SpecificMeetingInviteEmail", this.input),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    const bodyKey = this.input.hideBranding
      ? "specific_meeting_invite_email_body_no_branding"
      : "specific_meeting_invite_email_body";

    return `${this.input.t("specific_meeting_invite_email_heading")}\n\n${this.input.t(bodyKey, {
      participantName: this.input.participantName,
      organizerName: this.input.organizerName,
      meetingTitle: this.input.meetingTitle,
      meetingTime: this.input.meetingTime,
      appName: "Cal.com",
    })}\n\n${this.input.t("yes")}: ${this.input.acceptLink}\n${this.input.t("no")}: ${this.input.declineLink}\n\n${this.input.meetingLink}`;
  }
}
