import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { describe, expect, it, vi } from "vitest";
import AttendeeRescheduledEmail from "./attendee-rescheduled-email";

vi.mock("../lib/generateIcsFile", () => ({
  GenerateIcsRole: { ATTENDEE: "ATTENDEE" },
  default: vi.fn().mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR"),
}));

vi.mock("../src/renderEmail", () => ({
  default: vi.fn().mockResolvedValue("<p>email</p>"),
}));

class TestAttendeeRescheduledEmail extends AttendeeRescheduledEmail {
  public async getPayload(): Promise<Record<string, unknown>> {
    return await this.getNodeMailerPayload();
  }
}

const t = (key: string, params?: Record<string, string>): string => {
  if (key === "event_type_has_been_rescheduled_on_time_date") {
    return `${params?.title} has been rescheduled to ${params?.date}`;
  }

  return key;
};

const buildCalEvent = (attendeeNames: string[]): CalendarEvent => {
  return {
    title: "Specific meeting with Alex, Blair, Casey",
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

describe("AttendeeRescheduledEmail", () => {
  it("uses a compact attendee summary in the subject for multi-invitee meetings", async () => {
    const email = new TestAttendeeRescheduledEmail(buildCalEvent(["Alex", "Blair", "Casey"]), {
      name: "Alex",
      email: "attendee-1@example.com",
      timeZone: "UTC",
      language: { translate: t, locale: "en" },
      timeFormat: TimeFormat.TWELVE_HOUR,
    } as CalendarEvent["attendees"][number]);

    const payload = await email.getPayload();

    expect(payload.subject).toBe(
      "Specific meeting with Alex and 2 other attendees has been rescheduled to 10:00am - 10:30am, thursday, april 1, 2027"
    );
  });
});
