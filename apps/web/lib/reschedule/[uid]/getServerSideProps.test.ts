import type { GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const maybeGetBookingUidFromSeatMock = vi.hoisted(() => vi.fn());
const findUniqueMock = vi.hoisted(() => vi.fn());
const buildEventUrlFromBookingMock = vi.hoisted(() => vi.fn());
const determineReschedulePreventionRedirectMock = vi.hoisted(() => vi.fn());

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@calcom/lib/server/maybeGetBookingUidFromSeat", () => ({
  maybeGetBookingUidFromSeat: maybeGetBookingUidFromSeatMock,
}));

vi.mock("@calcom/features/bookings/lib/buildEventUrlFromBooking", () => ({
  buildEventUrlFromBooking: buildEventUrlFromBookingMock,
}));

vi.mock("@calcom/features/bookings/lib/reschedule/determineReschedulePreventionRedirect", () => ({
  determineReschedulePreventionRedirect: determineReschedulePreventionRedirectMock,
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    enrichUserWithItsProfile = vi.fn().mockResolvedValue({ username: "pro" });
  },
}));

vi.mock("@calcom/prisma", () => ({
  __esModule: true,
  default: {
    booking: {
      findUnique: findUniqueMock,
    },
  },
  bookingMinimalSelect: {},
}));

import { getServerSideProps } from "./getServerSideProps";

const createContext = (query: GetServerSidePropsContext["query"]): GetServerSidePropsContext =>
  ({
    req: {
      headers: { host: "localhost:3000" },
      cookies: {},
    },
    query,
  }) as unknown as GetServerSidePropsContext;

describe("reschedule/[uid] getServerSideProps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(null);
    maybeGetBookingUidFromSeatMock.mockResolvedValue({
      uid: "booking-1",
      seatReferenceUid: undefined,
      bookingSeat: null,
    });
    determineReschedulePreventionRedirectMock.mockReturnValue(null);
    buildEventUrlFromBookingMock.mockResolvedValue("/pro/30min");
    findUniqueMock.mockResolvedValue({
      uid: "booking-1",
      startTime: new Date("2026-05-28T14:00:00.000Z"),
      endTime: new Date("2026-05-28T14:30:00.000Z"),
      responses: {},
      status: "ACCEPTED",
      userId: 4,
      user: { id: 4, email: "pro@example.com" },
      dynamicEventSlugRef: null,
      dynamicGroupSlugRef: null,
      metadata: { specificMeetingInviteeCount: "2" },
      eventType: {
        slug: "30min",
        users: [{ username: "pro" }],
        allowReschedulingPastBookings: true,
        disableRescheduling: false,
        allowReschedulingCancelledBookings: false,
        minimumRescheduleNotice: 0,
        team: null,
        seatsPerTimeSlot: null,
        userId: 4,
        owner: { id: 4 },
        hosts: [],
      },
    });
  });

  it("redirects multi-invitee attendees back to booking page with an error code", async () => {
    const result = await getServerSideProps(createContext({ uid: "booking-1" }));

    expect(result).toEqual({
      redirect: {
        destination: "/booking/booking-1?error=specific-meeting-organizer-reschedule-only",
        permanent: false,
      },
    });
  });
});
