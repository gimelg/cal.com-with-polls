import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import { getCompactEventTitle } from "./getAttendeeSummary";
import type { Reassigned } from "./organizer-scheduled-email";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

export default class OrganizerCancelledEmail extends OrganizerScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.teamMember?.email || this.calEvent.organizer.email];
    let subject = "event_cancelled_subject";

    if (this.reassigned) {
      subject = "event_reassigned_subject";
    }

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        status: "CANCELLED",
        role: GenerateIcsRole.ORGANIZER,
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      subject: `${this.t(subject, {
        title: getCompactEventTitle(this.calEvent),
        date: this.getFormattedDate(),
      })}`,
      html: await this.getHtml(this.calEvent, this.calEvent.organizer, this.reassigned),
      text: this.getTextBody("event_request_cancelled"),
    };
  }

  async getHtml(
    calEvent: CalendarEvent,
    organizer: Person,
    reassigned: Reassigned | undefined
  ): Promise<string> {
    return await renderEmail("OrganizerCancelledEmail", {
      calEvent,
      attendee: organizer,
      reassigned,
    });
  }
}
