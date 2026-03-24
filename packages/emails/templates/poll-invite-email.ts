import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type PollInviteEmailInput = {
  to: string;
  organizerName: string;
  participantName: string;
  pollTitle: string;
  pollDescription?: string | null;
  pollLink: string;
  t: TFunction;
};

export default class PollInviteEmail extends BaseEmail {
  input: PollInviteEmailInput;

  constructor(input: PollInviteEmailInput) {
    super();
    this.name = "SEND_POLL_INVITE_EMAIL";
    this.input = input;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.input.to,
      subject: this.input.t("poll_invite_email_subject", { pollTitle: this.input.pollTitle }),
      html: await renderEmail("PollInviteEmail", this.input),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    return `${this.input.t("poll_invite_email_heading")}\n\n${this.input.t("poll_invite_email_body", {
      participantName: this.input.participantName,
      organizerName: this.input.organizerName,
      pollTitle: this.input.pollTitle,
      appName: "Cal.com",
    })}\n\n${this.input.pollLink}`;
  }
}
