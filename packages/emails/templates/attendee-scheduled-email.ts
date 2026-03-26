import { getRichDescription } from "@calcom/lib/CalEventParser";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import { TimeFormat } from "@calcom/lib/timeFormat";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { default as cloneDeep } from "lodash/cloneDeep";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

async function getPollMetadataForBookingUid(
  bookingUid: string | null | undefined
): Promise<{ pollUid: string; pollTitle: string } | null> {
  if (!bookingUid) {
    return null;
  }

  const booking = await prisma.booking.findUnique({
    where: { uid: bookingUid },
    select: { metadata: true },
  });

  if (!booking?.metadata || typeof booking.metadata !== "object" || Array.isArray(booking.metadata)) {
    return null;
  }

  const metadata = booking.metadata as Prisma.JsonObject;
  const pollUidValue = metadata.pollUid;
  const pollTitleValue = metadata.pollTitle;
  if (typeof pollUidValue !== "string" || typeof pollTitleValue !== "string") {
    return null;
  }

  if (!pollUidValue.trim() || !pollTitleValue.trim()) {
    return null;
  }

  return {
    pollUid: pollUidValue,
    pollTitle: pollTitleValue,
  };
}

export default class AttendeeScheduledEmail extends BaseEmail {
  calEvent: CalendarEvent;
  attendee: Person;
  showAttendees: boolean | undefined;
  t: TFunction;

  constructor(calEvent: CalendarEvent, attendee: Person, showAttendees?: boolean | undefined) {
    super();
    let shouldShowAttendees: boolean;
    if (showAttendees !== undefined) {
      shouldShowAttendees = showAttendees;
    } else if (calEvent.seatsPerTimeSlot) {
      shouldShowAttendees = calEvent.seatsShowAttendees ?? false;
    } else {
      shouldShowAttendees = true;
    }

    if (!shouldShowAttendees && calEvent.seatsPerTimeSlot) {
      this.calEvent = cloneDeep(calEvent);
      this.calEvent.attendees = [attendee];
    } else {
      this.calEvent = calEvent;
    }
    this.name = "SEND_BOOKING_CONFIRMATION";
    this.attendee = attendee;
    this.t = attendee.language.translate;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const calEventForEmail = cloneDeep(this.calEvent);

    const pollMetadata = await getPollMetadataForBookingUid(this.calEvent.uid);
    if (pollMetadata) {
      calEventForEmail.pollUid = pollMetadata.pollUid;
      calEventForEmail.pollTitle = pollMetadata.pollTitle;
      calEventForEmail.title = pollMetadata.pollTitle;
    }

    const pollTitle = calEventForEmail.pollTitle;
    const isPollBooking = typeof calEventForEmail.pollUid === "string" && Boolean(pollTitle);
    let subject = calEventForEmail.title;
    if (isPollBooking) {
      subject = this.t("poll_booking_finalized_subject", { pollTitle: pollTitle || calEventForEmail.title });
    }

    this.calEvent = calEventForEmail;

    return {
      icalEvent: generateIcsFile({
        calEvent: calEventForEmail,
        role: GenerateIcsRole.ATTENDEE,
        status: "CONFIRMED",
      }),
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${calEventForEmail.organizer.name} <${this.getMailerOptions().from}>`,
      ...getReplyToHeader(
        calEventForEmail,
        calEventForEmail.attendees.filter(({ email }) => email !== this.attendee.email).map(({ email }) => email)
      ),
      subject,
      html: await this.getHtml(calEventForEmail, this.attendee),
      text: this.getTextBody(),
    };
  }

  async getHtml(calEvent: CalendarEvent, attendee: Person): Promise<string> {
    return await renderEmail("AttendeeScheduledEmail", {
      calEvent,
      attendee,
    });
  }

  protected getTextBody(title: string = "", subtitle: string = "emailed_you_and_any_other_attendees"): string {
    let titleKey = title;
    if (!titleKey) {
      if (this.calEvent.recurringEvent?.count) {
        titleKey = "your_event_has_been_scheduled_recurring";
      } else {
        titleKey = "your_event_has_been_scheduled";
      }
    }

    return `
${this.t(titleKey)}
${this.t(subtitle)}

${getRichDescription(this.calEvent, this.t)}
`.trim();
  }

  protected getTimezone(): string {
    return this.attendee.timeZone;
  }

  protected getLocale(): string {
    return this.attendee.language.locale;
  }

  protected getInviteeStart(format: string): string {
    return this.getFormattedRecipientTime({
      time: this.calEvent.startTime,
      format,
    });
  }

  protected getInviteeEnd(format: string): string {
    return this.getFormattedRecipientTime({
      time: this.calEvent.endTime,
      format,
    });
  }

  public getFormattedDate(): string {
    const inviteeTimeFormat = this.calEvent.organizer.timeFormat || TimeFormat.TWELVE_HOUR;

    return `${this.getInviteeStart(inviteeTimeFormat)} - ${this.getInviteeEnd(inviteeTimeFormat)}, ${this.t(
      this.getInviteeStart("dddd").toLowerCase()
    )}, ${this.t(this.getInviteeStart("MMMM").toLowerCase())} ${this.getInviteeStart("D, YYYY")}`;
  }
}
