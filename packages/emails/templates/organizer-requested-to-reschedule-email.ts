import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { CalendarEvent } from "@calcom/types/Calendar";

import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

const getAttendeeSummary = (calEvent: CalendarEvent) => {
  const [firstAttendee, ...otherAttendees] = calEvent.attendees;

  if (!firstAttendee) {
    return "";
  }

  if (otherAttendees.length === 0) {
    return firstAttendee.name;
  }

  if (otherAttendees.length === 1) {
    return `${firstAttendee.name} and ${otherAttendees[0].name}`;
  }

  return `${firstAttendee.name} and ${otherAttendees.length} other attendees`;
};

export default class OrganizerRequestedToRescheduleEmail extends OrganizerScheduledEmail {
  private metadata: { rescheduleLink: string };
  constructor(calEvent: CalendarEvent, metadata: { rescheduleLink: string }) {
    super({ calEvent });
    this.metadata = metadata;
  }
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const toAddresses = [this.calEvent.organizer.email];
    const attendeeSummary = getAttendeeSummary(this.calEvent);

    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ORGANIZER,
        status: "CANCELLED",
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      subject: `${this.t("rescheduled_event_type_subject", {
        eventType: this.calEvent.type,
        name: attendeeSummary,
        date: this.getFormattedDate(),
      })}`,
      html: await renderEmail("OrganizerRequestedToRescheduleEmail", {
        calEvent: this.calEvent,
        attendee: this.calEvent.organizer,
      }),
      text: this.getTextBody(
        this.t("request_reschedule_title_organizer", {
          attendee: attendeeSummary,
        }),
        this.t("request_reschedule_subtitle_organizer", {
          attendee: attendeeSummary,
        })
      ),
    };
  }
}
