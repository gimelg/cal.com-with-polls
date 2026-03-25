import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type PollFinalizedEmailInput = {
  to: string;
  recipientName: string;
  recipientRole: "ORGANIZER" | "PARTICIPANT";
  pollTitle: string;
  pollDescription?: string | null;
  selectedSlot: string;
  pollLink: string;
  t: TFunction;
};

export default class PollFinalizedEmail extends BaseEmail {
  input: PollFinalizedEmailInput;

  constructor(input: PollFinalizedEmailInput) {
    super();
    this.name = "SEND_POLL_FINALIZED_EMAIL";
    this.input = input;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: this.input.to,
      subject: this.input.t("poll_finalized_email_subject", { pollTitle: this.input.pollTitle }),
      html: await renderEmail("PollFinalizedEmail", this.input),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    const bodyKey =
      this.input.recipientRole === "ORGANIZER"
        ? "poll_finalized_email_body_organizer"
        : "poll_finalized_email_body_participant";

    return `${this.input.t("poll_finalized_email_heading")}\n\n${this.input.t(bodyKey, {
      recipientName: this.input.recipientName,
      pollTitle: this.input.pollTitle,
      appName: "Cal.com",
    })}\n\n${this.input.t("poll_finalized_email_selected_slot", {
      slot: this.input.selectedSlot,
    })}\n\n${this.input.pollLink}`;
  }
}
