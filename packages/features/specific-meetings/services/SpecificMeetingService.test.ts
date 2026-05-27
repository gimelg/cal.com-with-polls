import { SpecificMeetingInviteeStatus, SpecificMeetingStatus } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createBookingMock = vi.fn();
const handleCancelBookingMock = vi.fn();
const sendSpecificMeetingBookingFailedEmailMock = vi.fn();
const bookingUpdateMock = vi.fn();
const getAvailableSlotsMock = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    booking: {
      update: (...args: unknown[]) => bookingUpdateMock(...args),
    },
  },
}));

vi.mock("@calcom/features/bookings/di/RegularBookingService.container", () => ({
  getRegularBookingService: () => ({
    createBooking: createBookingMock,
  }),
}));

vi.mock("@calcom/features/di/containers/AvailableSlots", () => ({
  getAvailableSlotsService: () => ({
    getAvailableSlots: getAvailableSlotsMock,
  }),
}));

vi.mock("@calcom/features/bookings/lib/handleCancelBooking", () => ({
  default: (...args: unknown[]) => handleCancelBookingMock(...args),
}));

vi.mock("@calcom/emails/poll-email-service", () => ({
  sendSpecificMeetingBookingFailedEmail: (...args: unknown[]) =>
    sendSpecificMeetingBookingFailedEmailMock(...args),
  sendSpecificMeetingConfirmationEmail: vi.fn(),
}));

vi.mock("@calcom/features/profile/lib/hideBranding", () => ({
  getHideBranding: vi.fn().mockResolvedValue(false),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn().mockResolvedValue((key: string) => key),
}));

import { SpecificMeetingService } from "./SpecificMeetingService";

describe("SpecificMeetingService", () => {
  const futureStartTime = new Date("2027-04-01T10:00:00.000Z");
  const futureEndTime = new Date("2027-04-01T10:30:00.000Z");

  const repository = {
    findOwnedEventType: vi.fn(),
    createSpecificMeeting: vi.fn(),
    attachBooking: vi.fn(),
    findOwnedByUid: vi.fn(),
    listByEventType: vi.fn(),
    findInviteeContext: vi.fn(),
    updateInviteeResponse: vi.fn(),
    cancelSpecificMeeting: vi.fn(),
    deleteSpecificMeeting: vi.fn(),
    markBookingFailure: vi.fn(),
    markBookingFailureNotificationSent: vi.fn(),
    findPendingBookingRetries: vi.fn(),
  };

  const service = new SpecificMeetingService(repository as never);

  beforeEach(() => {
    vi.clearAllMocks();
    bookingUpdateMock.mockResolvedValue({ id: 222 });
    getAvailableSlotsMock.mockResolvedValue({
      slots: {
        "2027-04-01": [{ time: futureStartTime.toISOString() }],
      },
    });
  });

  it("creates a meeting without creating a booking yet", async () => {
    repository.findOwnedEventType.mockResolvedValue({
      id: 100,
      title: "1:1",
      slug: "one-on-one",
      length: 30,
      locations: [],
      userId: 10,
      minimumBookingNotice: 0,
      periodType: "UNLIMITED",
      periodDays: null,
      periodEndDate: null,
      periodStartDate: null,
      periodCountCalendarDays: false,
      schedule: { timeZone: "UTC" },
      owner: { defaultScheduleId: null, schedules: [] },
    });
    repository.createSpecificMeeting.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: futureStartTime,
      endTime: futureEndTime,
      status: SpecificMeetingStatus.SCHEDULED,
      createdAt: new Date(),
      updatedAt: new Date(),
      bookingId: null,
      organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        {
          id: 11,
          uid: "inv_1",
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: "PENDING",
          required: false,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    repository.findOwnedByUid.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: futureStartTime,
      endTime: futureEndTime,
      status: SpecificMeetingStatus.SCHEDULED,
      createdAt: new Date(),
      updatedAt: new Date(),
      bookingId: null,
      organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        {
          id: 11,
          uid: "inv_1",
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: "PENDING",
          required: false,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const result = await service.create({
      organizerId: 10,
      eventTypeId: 100,
      title: "Planning",
      description: undefined,
      timeZone: "UTC",
      startTime: futureStartTime,
      endTime: futureEndTime,
      participants: [{ name: "Alex", email: "ALEX@example.com" }],
    });

    expect(getAvailableSlotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          eventTypeId: 100,
          timeZone: "UTC",
        }),
      })
    );
    expect(repository.createSpecificMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerId: 10,
        eventTypeId: 100,
        title: "Planning",
        invitees: [{ name: "Alex", email: "alex@example.com", required: false }],
      })
    );
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(repository.attachBooking).not.toHaveBeenCalled();
    expect(result.invitees[0]?.responseUrl).toBe("/meeting/sm_1?token=token_1");
  });

  it("rejects meetings outside event type availability", async () => {
    repository.findOwnedEventType.mockResolvedValue({
      id: 100,
      title: "1:1",
      slug: "one-on-one",
      length: 30,
      locations: [],
      userId: 10,
      minimumBookingNotice: 0,
      periodType: "UNLIMITED",
      periodDays: null,
      periodEndDate: null,
      periodStartDate: null,
      periodCountCalendarDays: false,
      schedule: { timeZone: "UTC" },
      owner: { defaultScheduleId: null, schedules: [] },
    });
    getAvailableSlotsMock.mockResolvedValue({ slots: {} });

    await expect(
      service.create({
        organizerId: 10,
        eventTypeId: 100,
        title: "Planning",
        description: undefined,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        participants: [{ name: "Alex", email: "alex@example.com" }],
      })
    ).rejects.toThrow("Specific meeting must be scheduled within the event type availability");

    expect(repository.createSpecificMeeting).not.toHaveBeenCalled();
  });

  it("cancels the linked booking and meeting", async () => {
    repository.findOwnedByUid.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: futureStartTime,
      endTime: futureEndTime,
      status: SpecificMeetingStatus.SCHEDULED,
      createdAt: new Date(),
      updatedAt: new Date(),
      bookingId: 222,
      organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        {
          id: 11,
          uid: "inv_1",
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: "PENDING",
          required: false,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    repository.cancelSpecificMeeting.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: futureStartTime,
      endTime: futureEndTime,
      status: SpecificMeetingStatus.CANCELLED,
      createdAt: new Date(),
      updatedAt: new Date(),
      cancelledAt: new Date(),
      bookingId: 222,
      organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        {
          id: 11,
          uid: "inv_1",
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: "PENDING",
          required: false,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
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

  it("allows deleting a meeting whose linked booking was already cancelled", async () => {
    repository.findOwnedByUid.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: futureStartTime,
      endTime: futureEndTime,
      status: SpecificMeetingStatus.SCHEDULED,
      bookingId: 222,
      booking: { id: 222, uid: "booking_1", status: "CANCELLED" },
      organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
      eventType: { id: 100, title: "1:1", slug: "one-on-one", length: 30, locations: [], userId: 10 },
      invitees: [
        {
          id: 11,
          uid: "inv_1",
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: SpecificMeetingInviteeStatus.ACCEPTED,
          required: false,
          respondedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    repository.deleteSpecificMeeting.mockResolvedValue({ uid: "sm_1" });

    const result = await service.delete({
      uid: "sm_1",
      organizerId: 10,
    });

    expect(repository.deleteSpecificMeeting).toHaveBeenCalledWith({ uid: "sm_1" });
    expect(result).toEqual({ uid: "sm_1" });
  });

  it("rejects responses after cancellation", async () => {
    repository.findInviteeContext.mockResolvedValue({
      id: 1,
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: futureStartTime,
      endTime: futureEndTime,
      status: SpecificMeetingStatus.CANCELLED,
      organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
      invitees: [
        {
          id: 11,
          uid: "inv_1",
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: SpecificMeetingInviteeStatus.PENDING,
          required: false,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
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
    repository.findInviteeContext
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: null,
        booking: null,
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.PENDING,
            required: false,
            respondedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: null,
        booking: null,
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.ACCEPTED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: 222,
        booking: { uid: "booking_1" },
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.ACCEPTED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
    repository.updateInviteeResponse.mockResolvedValue({});
    createBookingMock.mockResolvedValue({ id: 222, uid: "booking_1" });
    repository.attachBooking.mockResolvedValue({});
    repository.markBookingFailure.mockResolvedValue({ bookingFailureNotifiedAt: new Date() });

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
          noEmail: true,
        }),
      })
    );
    expect(repository.attachBooking).toHaveBeenCalledWith({ uid: "sm_1", bookingId: 222 });
    expect(bookingUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 222 },
        data: expect.objectContaining({
          title: "Planning",
          attendees: expect.objectContaining({
            updateMany: [
              {
                where: { email: "alex@example.com" },
                data: { name: "Alex" },
              },
            ],
          }),
        }),
      })
    );
    expect(repository.updateInviteeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteeId: 11,
        status: SpecificMeetingInviteeStatus.ACCEPTED,
      })
    );
    expect(result.invitee.status).toBe(SpecificMeetingInviteeStatus.ACCEPTED);
  });

  it("does not cancel the whole booking when another invitee is still pending", async () => {
    repository.findInviteeContext
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: 222,
        booking: { uid: "booking_1" },
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.ACCEPTED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 12,
            uid: "inv_2",
            name: "Blair",
            email: "blair@example.com",
            responseToken: "token_2",
            status: SpecificMeetingInviteeStatus.PENDING,
            required: false,
            respondedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: 222,
        booking: { uid: "booking_1" },
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.DECLINED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 12,
            uid: "inv_2",
            name: "Blair",
            email: "blair@example.com",
            responseToken: "token_2",
            status: SpecificMeetingInviteeStatus.PENDING,
            required: false,
            respondedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        invitee: {
          id: 11,
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: SpecificMeetingInviteeStatus.DECLINED,
          required: false,
          respondedAt: new Date(),
        },
      })
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: 222,
        booking: { uid: "booking_1" },
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.DECLINED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 12,
            uid: "inv_2",
            name: "Blair",
            email: "blair@example.com",
            responseToken: "token_2",
            status: SpecificMeetingInviteeStatus.PENDING,
            required: false,
            respondedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        invitee: {
          id: 11,
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: SpecificMeetingInviteeStatus.DECLINED,
          required: false,
          respondedAt: new Date(),
        },
      });

    repository.updateInviteeResponse.mockResolvedValue({});

    const result = await service.respond({
      uid: "sm_1",
      responseToken: "token_1",
      response: "DECLINED",
    });

    expect(repository.updateInviteeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteeId: 11,
        status: SpecificMeetingInviteeStatus.DECLINED,
      })
    );
    expect(handleCancelBookingMock).not.toHaveBeenCalled();
    expect(result.invitee.status).toBe(SpecificMeetingInviteeStatus.DECLINED);
  });

  it("cancels the whole booking when the last remaining invitee declines", async () => {
    repository.findInviteeContext
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: 222,
        booking: { uid: "booking_1" },
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.ACCEPTED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 12,
            uid: "inv_2",
            name: "Blair",
            email: "blair@example.com",
            responseToken: "token_2",
            status: SpecificMeetingInviteeStatus.DECLINED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: 222,
        booking: { uid: "booking_1" },
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.DECLINED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 12,
            uid: "inv_2",
            name: "Blair",
            email: "blair@example.com",
            responseToken: "token_2",
            status: SpecificMeetingInviteeStatus.DECLINED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        invitee: {
          id: 11,
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: SpecificMeetingInviteeStatus.DECLINED,
          required: false,
          respondedAt: new Date(),
        },
      })
      .mockResolvedValueOnce({
        id: 1,
        uid: "sm_1",
        title: "Planning",
        description: null,
        timeZone: "UTC",
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: SpecificMeetingStatus.SCHEDULED,
        bookingId: 222,
        booking: { uid: "booking_1" },
        organizer: { id: 10, uuid: "uuid-10", name: "Org", email: "org@example.com" },
        eventType: { id: 100, locations: [] },
        invitees: [
          {
            id: 11,
            uid: "inv_1",
            name: "Alex",
            email: "alex@example.com",
            responseToken: "token_1",
            status: SpecificMeetingInviteeStatus.DECLINED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 12,
            uid: "inv_2",
            name: "Blair",
            email: "blair@example.com",
            responseToken: "token_2",
            status: SpecificMeetingInviteeStatus.DECLINED,
            required: false,
            respondedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        invitee: {
          id: 11,
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          status: SpecificMeetingInviteeStatus.DECLINED,
          required: false,
          respondedAt: new Date(),
        },
      });

    repository.updateInviteeResponse.mockResolvedValue({});

    const result = await service.respond({
      uid: "sm_1",
      responseToken: "token_1",
      response: "DECLINED",
    });

    expect(handleCancelBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        userUuid: "uuid-10",
        bookingData: expect.objectContaining({ id: 222, cancelledBy: "org@example.com" }),
      })
    );
    expect(result.invitee.status).toBe(SpecificMeetingInviteeStatus.DECLINED);
  });
});
