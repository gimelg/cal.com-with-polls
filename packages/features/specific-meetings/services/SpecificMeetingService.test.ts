import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpecificMeetingInviteeStatus, SpecificMeetingStatus } from "@calcom/prisma/enums";
import { SpecificMeetingService } from "./SpecificMeetingService";

const createBookingMock = vi.fn();
const handleCancelBookingMock = vi.fn();
const sendSpecificMeetingBookingFailedEmailMock = vi.fn();

vi.mock("@calcom/features/bookings/di/RegularBookingService.container", () => ({
  getRegularBookingService: () => ({
    createBooking: createBookingMock,
  }),
}));

vi.mock("@calcom/features/bookings/lib/handleCancelBooking", () => ({
  default: (...args: unknown[]) => handleCancelBookingMock(...args),
}));

vi.mock("@calcom/emails/poll-email-service", () => ({
  sendSpecificMeetingBookingFailedEmail: (...args: unknown[]) => sendSpecificMeetingBookingFailedEmailMock(...args),
}));

describe("SpecificMeetingService", () => {
  const repository = {
    findOwnedEventType: vi.fn(),
    createSpecificMeeting: vi.fn(),
    attachBooking: vi.fn(),
    findOwnedByUid: vi.fn(),
    listByEventType: vi.fn(),
    findInviteeContext: vi.fn(),
    updateInviteeResponse: vi.fn(),
    cancelSpecificMeeting: vi.fn(),
    markBookingFailure: vi.fn(),
    markBookingFailureNotificationSent: vi.fn(),
    findPendingBookingRetries: vi.fn(),
  };

  const service = new SpecificMeetingService(repository as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a meeting without creating a booking yet", async () => {
    repository.findOwnedEventType.mockResolvedValue({
      id: 100,
      title: "1:1",
      slug: "one-on-one",
      length: 30,
      locations: [],
      userId: 10,
    });
    repository.createSpecificMeeting.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      status: SpecificMeetingStatus.SCHEDULED,
      createdAt: new Date(),
      updatedAt: new Date(),
      bookingId: null,
      organizer: { id: 10, name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        { id: 11, uid: "inv_1", name: "Alex", email: "alex@example.com", responseToken: "token_1", status: "PENDING", respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    repository.findOwnedByUid.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      status: SpecificMeetingStatus.SCHEDULED,
      createdAt: new Date(),
      updatedAt: new Date(),
      bookingId: null,
      organizer: { id: 10, name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        { id: 11, uid: "inv_1", name: "Alex", email: "alex@example.com", responseToken: "token_1", status: "PENDING", respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    });

    const result = await service.create({
      organizerId: 10,
      eventTypeId: 100,
      title: "Planning",
      description: undefined,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      participants: [
        { name: "Alex", email: "ALEX@example.com" },
      ],
    });

    expect(repository.createSpecificMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerId: 10,
        eventTypeId: 100,
        title: "Planning",
        invitees: [{ name: "Alex", email: "alex@example.com" }],
      })
    );
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(repository.attachBooking).not.toHaveBeenCalled();
    expect(result.invitees[0]?.responseUrl).toBe("/meeting/sm_1?token=token_1");
  });

  it("cancels the linked booking and meeting", async () => {
    repository.findOwnedByUid.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      status: SpecificMeetingStatus.SCHEDULED,
      createdAt: new Date(),
      updatedAt: new Date(),
      bookingId: 222,
      organizer: { id: 10, name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        { id: 11, uid: "inv_1", name: "Alex", email: "alex@example.com", responseToken: "token_1", status: "PENDING", respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    repository.cancelSpecificMeeting.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      status: SpecificMeetingStatus.CANCELLED,
      createdAt: new Date(),
      updatedAt: new Date(),
      cancelledAt: new Date(),
      bookingId: 222,
      organizer: { id: 10, name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        { id: 11, uid: "inv_1", name: "Alex", email: "alex@example.com", responseToken: "token_1", status: "PENDING", respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    });

    const result = await service.cancel({
      uid: "sm_1",
      organizerId: 10,
      organizerEmail: "org@example.com",
      organizerUuid: "uuid-1",
    });

    expect(handleCancelBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        userUuid: "uuid-1",
        bookingData: expect.objectContaining({ id: 222, cancelledBy: "org@example.com" }),
      })
    );
    expect(repository.cancelSpecificMeeting).toHaveBeenCalledWith({ uid: "sm_1" });
    expect(result.status).toBe(SpecificMeetingStatus.CANCELLED);
    expect(result.invitees[0]?.responseUrl).toBe("/meeting/sm_1?token=token_1");
  });

  it("rejects responses after cancellation", async () => {
    repository.findInviteeContext.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      status: SpecificMeetingStatus.CANCELLED,
      organizer: { id: 10, name: "Org", email: "org@example.com" },
      invitees: [
        { id: 11, uid: "inv_1", name: "Alex", email: "alex@example.com", responseToken: "token_1", status: SpecificMeetingInviteeStatus.PENDING, respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    });

    await expect(
      service.respond({
        uid: "sm_1",
        responseToken: "token_1",
        response: "ACCEPTED",
      })
    ).rejects.toThrow("Specific meeting is cancelled");
  });

  it("responds to invitee and returns updated view", async () => {
    repository.findInviteeContext.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      status: SpecificMeetingStatus.SCHEDULED,
      bookingId: null,
      organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
      eventType: { id: 100, locations: [] },
      invitees: [
        { id: 11, uid: "inv_1", name: "Alex", email: "alex@example.com", responseToken: "token_1", status: SpecificMeetingInviteeStatus.PENDING, respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    repository.updateInviteeResponse.mockResolvedValue({});
    createBookingMock.mockResolvedValue({ id: 222, uid: "booking_1" });
    repository.attachBooking.mockResolvedValue({});
    repository.markBookingFailure.mockResolvedValue({ bookingFailureNotifiedAt: new Date() });
    repository.findInviteeContext.mockResolvedValueOnce({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      status: SpecificMeetingStatus.SCHEDULED,
      bookingId: null,
      organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
      eventType: { id: 100, locations: [] },
      invitees: [
        { id: 11, uid: "inv_1", name: "Alex", email: "alex@example.com", responseToken: "token_1", status: SpecificMeetingInviteeStatus.PENDING, respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
      ],
    });

    const result = await service.respond({
      uid: "sm_1",
      responseToken: "token_1",
      response: "ACCEPTED",
    });

    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingData: expect.objectContaining({
          eventTypeId: 100,
          idempotencyKey: "specific-meeting:sm_1",
        }),
      })
    );
    expect(repository.attachBooking).toHaveBeenCalledWith({ uid: "sm_1", bookingId: 222 });
    expect(repository.updateInviteeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteeId: 11,
        status: SpecificMeetingInviteeStatus.ACCEPTED,
      })
    );
    expect(result.invitee.status).toBe(SpecificMeetingInviteeStatus.PENDING);
  });
});
