import { getRichDescription } from "@calcom/lib/CalEventParser";
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
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

export type Reassigned = { name: string | null; email: string; reason?: string; byUser?: string };
export default class OrganizerScheduledEmail extends BaseEmail {
  calEvent: CalendarEvent;
  t: TFunction;
  newSeat?: boolean;
  teamMember?: Person;
  reassigned?: Reassigned;
  attendee?: Person;

  constructor(input: {
    calEvent: CalendarEvent;
    newSeat?: boolean;
    teamMember?: Person;
    reassigned?: Reassigned;
    attendee?: Person;
  }) {
    super();
    this.name = "SEND_BOOKING_CONFIRMATION";
    this.calEvent = input.calEvent;
    this.t = this.calEvent.organizer.language.translate;
    this.newSeat = input.newSeat;
    this.teamMember = input.teamMember;
    this.reassigned = input.reassigned;
    this.attendee = input.attendee;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    const calEventForEmail = cloneDeep(this.calEvent);

    const pollMetadata = await getPollMetadataForBookingUid(this.calEvent.uid);
    if (pollMetadata) {
      calEventForEmail.pollUid = pollMetadata.pollUid;
      calEventForEmail.pollTitle = pollMetadata.pollTitle;
      calEventForEmail.title = pollMetadata.pollTitle;
    }

    const toAddresses = [this.teamMember?.email || calEventForEmail.organizer.email];
    const pollTitle = calEventForEmail.pollTitle;
    const isPollBooking = typeof calEventForEmail.pollUid === "string" && Boolean(pollTitle);
    let subject = `${calEventForEmail.title}`;

    if (this.newSeat) {
      subject = `${this.t("new_attendee")}: ${subject}`;
    }

    if (isPollBooking) {
      subject = this.t("poll_booking_finalized_subject", { pollTitle: pollTitle || calEventForEmail.title });
    }

    this.calEvent = calEventForEmail;

    return {
      icalEvent: generateIcsFile({
        calEvent: calEventForEmail,
        role: GenerateIcsRole.ORGANIZER,
        status: "CONFIRMED",
      }),
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: toAddresses.join(","),
      ...getReplyToHeader(
        calEventForEmail,
        calEventForEmail.attendees.map(({ email }) => email),
        true
      ),
      subject,
      html: await this.getHtml(
        calEventForEmail,
        this.attendee || calEventForEmail.organizer,
        this.teamMember,
        this.newSeat,
        this.reassigned
      ),
      text: this.getTextBody(),
    };
  }

  async getHtml(
    calEvent: CalendarEvent,
    attendee: Person,
    teamMember?: Person,
    newSeat?: boolean,
    reassigned?: Reassigned
  ): Promise<string> {
    return await renderEmail("OrganizerScheduledEmail", {
      calEvent,
      attendee,
      teamMember,
      newSeat,
      reassigned,
    });
  }

  protected getTextBody(
    title: string = "",
    subtitle: string = "emailed_you_and_any_other_attendees",
    extraInfo: string = "",
    callToAction: string = ""
  ): string {
    let titleKey = title;
    if (!titleKey) {
      if (this.calEvent.recurringEvent?.count) {
        titleKey = "new_event_scheduled_recurring";
      } else {
        titleKey = "new_event_scheduled";
      }
    }

    return `
${this.t(titleKey)}
${this.t(subtitle)}
${extraInfo}
${getRichDescription(this.calEvent, this.t, true)}
${callToAction}
`.trim();
  }

  protected getTimezone(): string {
    return this.calEvent.organizer.timeZone;
  }

  protected getLocale(): string {
    return this.calEvent.organizer.language.locale;
  }

  protected getOrganizerStart(format: string): string {
    return this.getFormattedRecipientTime({
      time: this.calEvent.startTime,
      format,
    });
  }

  protected getOrganizerEnd(format: string): string {
    return this.getFormattedRecipientTime({
      time: this.calEvent.endTime,
      format,
    });
  }

  protected getFormattedDate(): string {
    const organizerTimeFormat = this.calEvent.organizer.timeFormat || TimeFormat.TWELVE_HOUR;
    return `${this.getOrganizerStart(organizerTimeFormat)} - ${this.getOrganizerEnd(
      organizerTimeFormat
    )}, ${this.t(this.getOrganizerStart("dddd").toLowerCase())}, ${this.t(
      this.getOrganizerStart("MMMM").toLowerCase()
    )} ${this.getOrganizerStart("D, YYYY")}`;
  }
}
