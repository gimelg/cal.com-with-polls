import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { describe, expect, it, vi } from "vitest";
import OrganizerRequestedToRescheduleEmail from "./organizer-requested-to-reschedule-email";

vi.mock("../lib/generateIcsFile", () => ({
  GenerateIcsRole: { ORGANIZER: "ORGANIZER" },
  default: vi.fn().mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR"),
}));

vi.mock("../src/renderEmail", () => ({
  default: vi.fn().mockResolvedValue("<p>email</p>"),
}));

class TestOrganizerRequestedToRescheduleEmail extends OrganizerRequestedToRescheduleEmail {
  public async getPayload(): Promise<Record<string, unknown>> {
    return await this.getNodeMailerPayload();
  }
}

const t = (key: string, params?: Record<string, string>): string => {
  if (key === "rescheduled_event_type_subject") {
    return `Reschedule requested: ${params?.eventType} with ${params?.name} on ${params?.date}`;
  }

  if (key === "request_reschedule_title_organizer") {
    return `Requested ${params?.attendee} to reschedule`;
  }

  if (key === "request_reschedule_subtitle_organizer") {
    return `Requested ${params?.attendee} to pick a new time`;
  }

  return key;
};

const buildCalEvent = (attendeeNames: string[]): CalendarEvent => {
  return {
    title: "Specific meeting",
    type: "Specific meeting",
    startTime: "2027-04-01T10:00:00.000Z",
    endTime: "2027-04-01T10:30:00.000Z",
    organizer: {
      name: "Organizer",
      email: "organizer@example.com",
      timeZone: "UTC",
      language: { translate: t, locale: "en" },
      timeFormat: TimeFormat.TWELVE_HOUR,
    },
    attendees: attendeeNames.map((name, index) => ({
      name,
      email: `attendee-${index + 1}@example.com`,
      timeZone: "UTC",
      language: { translate: t, locale: "en" },
      timeFormat: TimeFormat.TWELVE_HOUR,
    })),
    uid: "booking-1",
    language: { translate: t, locale: "en" },
  } as unknown as CalendarEvent;
};

describe("OrganizerRequestedToRescheduleEmail", () => {
  it("uses a compact attendee summary in the subject for multi-invitee meetings", async () => {
    const email = new TestOrganizerRequestedToRescheduleEmail(buildCalEvent(["Alex", "Blair", "Casey"]), {
      rescheduleLink: "http://localhost:3000/reschedule/booking-1",
    });

    const payload = await email.getPayload();

    expect(payload.subject).toBe(
      "Reschedule requested: Specific meeting with Alex and 2 other attendees on 10:00am - 10:30am, thursday, april 1, 2027"
    );
  });

  it("keeps both names when there are exactly two attendees", async () => {
    const email = new TestOrganizerRequestedToRescheduleEmail(buildCalEvent(["Alex", "Blair"]), {
      rescheduleLink: "http://localhost:3000/reschedule/booking-1",
    });

    const payload = await email.getPayload();

    expect(payload.subject).toBe(
      "Reschedule requested: Specific meeting with Alex and Blair on 10:00am - 10:30am, thursday, april 1, 2027"
    );
  });
});
