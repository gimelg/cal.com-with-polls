// biome-ignore-all lint/nursery/noTernary: The email body key selection is intentionally simple and local.
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type SpecificMeetingConfirmationEmailInput = {
  to: string;
  organizerName: string;
  participantName: string;
  meetingTitle: string;
  meetingDescription?: string | null;
  meetingTime: string;
  meetingLink: string;
  cancelLink: string;
  rescheduleLink: string;
  showRescheduleLink: boolean;
  inviteeStatuses: Array<{
    name: string;
    status: "PENDING" | "ACCEPTED" | "DECLINED";
  }>;
  hideBranding: boolean;
  t: TFunction;
};

export default class SpecificMeetingConfirmationEmail extends BaseEmail {
  input: SpecificMeetingConfirmationEmailInput;

  constructor(input: SpecificMeetingConfirmationEmailInput) {
    super();
    this.name = "SEND_SPECIFIC_MEETING_CONFIRMATION_EMAIL";
    this.input = input;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.input.to,
      subject: this.input.t("specific_meeting_confirmation_email_subject", {
        meetingTitle: this.input.meetingTitle,
      }),
      html: await renderEmail("SpecificMeetingConfirmationEmail", this.input),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    const bodyKey = this.input.hideBranding
      ? "specific_meeting_confirmation_email_body_no_branding"
      : "specific_meeting_confirmation_email_body";

    return `${this.input.t("specific_meeting_confirmation_email_heading")}

${this.input.t(bodyKey, {
  participantName: this.input.participantName,
  organizerName: this.input.organizerName,
  meetingTitle: this.input.meetingTitle,
  meetingTime: this.input.meetingTime,
  appName: "Cal.com",
})}

${this.input.showRescheduleLink ? `${this.input.t("specific_meeting_confirmation_email_reschedule_cta")}: ${this.input.rescheduleLink}\n` : ""}${this.input.t("specific_meeting_confirmation_email_cancel_cta")}: ${this.input.cancelLink}

${this.input.t("specific_meeting_confirmation_email_invitee_statuses")}:
${this.input.inviteeStatuses.map((invitee) => `- ${invitee.name}: ${this.input.t(`specific_meeting_invitee_status_${invitee.status.toLowerCase()}`)}`).join("\n")}

${this.input.meetingLink}`;
  }
}
