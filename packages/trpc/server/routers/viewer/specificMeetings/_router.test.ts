import { beforeEach, describe, expect, it, vi } from "vitest";

const specificMeetingServiceMock = {
  listByEventType: vi.fn(),
  getForOrganizer: vi.fn(),
  resendInvite: vi.fn(),
  cancel: vi.fn(),
};

const sendSpecificMeetingInviteEmailMock = vi.fn();
const getHideBrandingMock = vi.fn();
const getTranslationMock = vi.fn();
const getUserSessionMock = vi.fn();

vi.mock("@calcom/features/specific-meetings/services/SpecificMeetingService", () => ({
  SpecificMeetingService: class {
    listByEventType = specificMeetingServiceMock.listByEventType;
    getForOrganizer = specificMeetingServiceMock.getForOrganizer;
    resendInvite = specificMeetingServiceMock.resendInvite;
    cancel = specificMeetingServiceMock.cancel;
  },
}));

vi.mock("@calcom/emails/poll-email-service", () => ({
  sendSpecificMeetingInviteEmail: (...args: unknown[]) => sendSpecificMeetingInviteEmailMock(...args),
}));

vi.mock("@calcom/features/profile/lib/hideBranding", () => ({
  getHideBranding: (...args: unknown[]) => getHideBrandingMock(...args),
}));

vi.mock("@calcom/features/auth/lib/userFromSessionUtils", () => ({
  getUserSession: (...args: unknown[]) => getUserSessionMock(...args),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: (...args: unknown[]) => getTranslationMock(...args),
}));

import { specificMeetingsRouter } from "./_router";

describe("viewer specific meetings router", () => {
  const caller = specificMeetingsRouter.createCaller({} as never);

  beforeEach(() => {
    vi.clearAllMocks();
    getHideBrandingMock.mockResolvedValue(false);
    getTranslationMock.mockResolvedValue((key: string) => key);
    getUserSessionMock.mockResolvedValue({
      user: {
        id: 10,
        name: "Organizer",
        email: "organizer@example.com",
        uuid: "uuid-10",
        locale: "en",
        hideBranding: false,
        organization: null,
      },
      session: { user: { id: 10 } },
    });
  });

  it("resends an invite for a specific invitee", async () => {
    specificMeetingServiceMock.resendInvite.mockResolvedValue({
      uid: "sm_1",
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
      endTime: new Date("2026-04-01T10:30:00.000Z"),
      status: "SCHEDULED",
      organizer: { id: 10, name: "Organizer", email: "organizer@example.com" },
      invitees: [
        {
          id: 11,
          name: "Alex",
          email: "alex@example.com",
          responseToken: "token_1",
          responseUrl: "/meeting/sm_1?token=token_1",
          status: "PENDING",
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const result = await caller.resendInvite({ uid: "sm_1", inviteeId: 11 });

    expect(result).toEqual({ success: true });
    expect(sendSpecificMeetingInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alex@example.com",
        participantName: "Alex",
      })
    );
  });

  it("cancels a specific meeting", async () => {
    specificMeetingServiceMock.cancel.mockResolvedValue({ uid: "sm_1", status: "CANCELLED" });

    const result = await caller.cancel({ uid: "sm_1" });

    expect(result).toEqual({ uid: "sm_1", status: "CANCELLED" });
    expect(specificMeetingServiceMock.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "sm_1",
        organizerId: 10,
        organizerEmail: "organizer@example.com",
        organizerUuid: "uuid-10",
      })
    );
  });
});
