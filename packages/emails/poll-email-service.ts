// biome-ignore-all lint/nursery/useExplicitType: Email service helpers intentionally rely on async inference.
import type BaseEmail from "@calcom/emails/templates/_base-email";
import type { PollFinalizedEmailInput } from "./templates/poll-finalized-email";
import PollFinalizedEmail from "./templates/poll-finalized-email";
import type { PollInviteEmailInput } from "./templates/poll-invite-email";
import PollInviteEmail from "./templates/poll-invite-email";
import type { SpecificMeetingCancelledEmailInput } from "./templates/specific-meeting-cancelled-email";
import SpecificMeetingCancelledEmail from "./templates/specific-meeting-cancelled-email";
import type { SpecificMeetingConfirmationEmailInput } from "./templates/specific-meeting-confirmation-email";
import SpecificMeetingConfirmationEmail from "./templates/specific-meeting-confirmation-email";
import type { SpecificMeetingInviteEmailInput } from "./templates/specific-meeting-invite-email";
import SpecificMeetingInviteEmail from "./templates/specific-meeting-invite-email";

const sendEmail = (prepare: () => BaseEmail) => {
  return new Promise((resolve, reject) => {
    try {
      const email = prepare();
      resolve(email.sendEmail());
    } catch (error) {
      console.error("Poll invite email send failed", error);
      reject(error);
    }
  });
};

export const sendPollInviteEmail = async (input: PollInviteEmailInput) => {
  await sendEmail(() => new PollInviteEmail(input));
};

export const sendPollFinalizedEmail = async (input: PollFinalizedEmailInput) => {
  await sendEmail(() => new PollFinalizedEmail(input));
};

export const sendSpecificMeetingInviteEmail = async (input: SpecificMeetingInviteEmailInput) => {
  await sendEmail(() => new SpecificMeetingInviteEmail(input));
};

export const sendSpecificMeetingCancelledEmail = async (input: SpecificMeetingCancelledEmailInput) => {
  await sendEmail(() => new SpecificMeetingCancelledEmail(input));
};

export const sendSpecificMeetingConfirmationEmail = async (input: SpecificMeetingConfirmationEmailInput) => {
  await sendEmail(() => new SpecificMeetingConfirmationEmail(input));
};
