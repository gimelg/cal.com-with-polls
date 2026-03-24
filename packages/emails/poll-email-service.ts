import type BaseEmail from "@calcom/emails/templates/_base-email";
import type { PollInviteEmailInput } from "./templates/poll-invite-email";
import PollInviteEmail from "./templates/poll-invite-email";

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
