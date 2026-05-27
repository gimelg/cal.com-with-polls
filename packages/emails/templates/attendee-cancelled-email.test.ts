import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { describe, expect, it, vi } from "vitest";
import AttendeeCancelledEmail from "./attendee-cancelled-email";

vi.mock("../lib/generateIcsFile", () => ({
  GenerateIcsRole: { ATTENDEE: "ATTENDEE" },
  default: vi.fn().mockReturnValue("BEGIN:VCALENDAR\nEND:VCALENDAR"),
}));

vi.mock("../src/renderEmail", () => ({
  default: vi.fn().mockResolvedValue("<p>email</p>"),
}));

class TestAttendeeCancelledEmail extends AttendeeCancelledEmail {
  public async getPayload(): Promise<Record<string, unknown>> {
    return await this.getNodeMailerPayload();
  }
}

const t = (key: string, params?: Record<string, string>): string => {
  if (key === "event_cancelled_subject") {
    return `${params?.title} was cancelled for ${params?.date}`;
  }

  return key;
};

const buildCalEvent = (): CalendarEvent => {
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
    attendees: ["Alex", "Blair", "Casey"].map((name, index) => ({
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

describe("AttendeeCancelledEmail", () => {
  it("uses a compact attendee summary in the subject for multi-invitee specific meetings", async () => {
    const calEvent = buildCalEvent();
    const attendee = calEvent.attendees[0];

    if (!attendee) {
      throw new Error("Expected attendee to be defined");
    }

    const email = new TestAttendeeCancelledEmail(calEvent, attendee);

    const payload = await email.getPayload();

    expect(payload.subject).toBe(
      "Specific meeting with Alex and 2 other attendees was cancelled for 10:00am - 10:30am, thursday, april 1, 2027"
    );
  });
});
