import { beforeEach, describe, expect, it, vi } from "vitest";

const createPollMock = vi.fn();
const getPollByUidForOrganizerMock = vi.fn();
const updatePollParticipantForOrganizerMock = vi.fn();
const addPollParticipantForOrganizerMock = vi.fn();
const reopenPollManuallyMock = vi.fn();
const cancelPollManuallyMock = vi.fn();
const sendPollInviteEmailMock = vi.fn();
const getHideBrandingMock = vi.fn();
const getUserSessionMock = vi.fn();
const getTranslationMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/userFromSessionUtils", () => ({
  getUserSession: (...args: unknown[]) => getUserSessionMock(...args),
}));

vi.mock("@calcom/features/polls/services/PollService", () => ({
  PollService: class {
    createPoll = createPollMock;
    getPollByUidForOrganizer = getPollByUidForOrganizerMock;
    updatePollParticipantForOrganizer = updatePollParticipantForOrganizerMock;
    addPollParticipantForOrganizer = addPollParticipantForOrganizerMock;
    reopenPollManually = reopenPollManuallyMock;
    cancelPollManually = cancelPollManuallyMock;
  },
}));

vi.mock("@calcom/emails/poll-email-service", () => ({
  sendPollInviteEmail: (...args: unknown[]) => sendPollInviteEmailMock(...args),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: (...args: unknown[]) => getTranslationMock(...args),
}));

vi.mock("@calcom/features/profile/lib/hideBranding", () => ({
  getHideBranding: (...args: unknown[]) => getHideBrandingMock(...args),
}));

import { pollsRouter } from "./_router";

const makeCaller = () => {
  return pollsRouter.createCaller({} as never);
};

describe("viewer polls router", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getUserSessionMock.mockResolvedValue({
      user: {
        id: 10,
        name: "Organizer",
        email: "organizer@example.com",
        locale: "en",
        hideBranding: false,
        organization: null,
      },
      session: {
        user: {
          id: 10,
        },
      },
    });

    getTranslationMock.mockResolvedValue((key: string) => key);
    getHideBrandingMock.mockResolvedValue(false);
    sendPollInviteEmailMock.mockResolvedValue(undefined);
  });

  it("sends invite emails on invite-only poll creation", async () => {
    createPollMock.mockResolvedValue({
      id: 1,
      uid: "poll_1",
      title: "Planning",
      description: "Pick a slot",
      visibility: "INVITE_ONLY",
      participants: [
        {
          id: 21,
          name: "Alex",
          email: "alex@example.com",
        },
        {
          id: 22,
          name: "Bianca",
          email: "bianca@example.com",
        },
      ],
    });

    const caller = makeCaller();
    await caller.create({
      eventTypeId: 100,
      title: "Planning",
      description: "Pick a slot",
      timeZone: "UTC",
      visibility: "INVITE_ONLY",
      isAnonymous: false,
      finalizationMode: "MANUAL",
      expiresAt: null,
      options: [
        {
          startTime: new Date("2026-04-01T10:00:00.000Z"),
          endTime: new Date("2026-04-01T10:30:00.000Z"),
        },
      ],
      participants: [
        {
          name: "Alex",
          email: "alex@example.com",
        },
        {
          name: "Bianca",
          email: "bianca@example.com",
        },
      ],
    });

    expect(sendPollInviteEmailMock).toHaveBeenCalledTimes(2);
    expect(getHideBrandingMock).toHaveBeenCalledWith({ userId: 10 });
    expect(sendPollInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alex@example.com",
        participantName: "Alex",
        pollTitle: "Planning",
        hideBranding: false,
      })
    );

    getHideBrandingMock.mockResolvedValueOnce(true);

    await caller.create({
      eventTypeId: 100,
      title: "Planning",
      description: "Pick a slot",
      timeZone: "UTC",
      visibility: "INVITE_ONLY",
      isAnonymous: false,
      finalizationMode: "MANUAL",
      expiresAt: null,
      options: [
        {
          startTime: new Date("2026-04-01T10:00:00.000Z"),
          endTime: new Date("2026-04-01T10:30:00.000Z"),
        },
      ],
      participants: [
        {
          name: "Alex",
          email: "alex@example.com",
        },
        {
          name: "Bianca",
          email: "bianca@example.com",
        },
      ],
    });

    expect(sendPollInviteEmailMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hideBranding: true,
      })
    );

    const firstCallInput = sendPollInviteEmailMock.mock.calls[0]?.[0] as { pollLink: string };
    expect(firstCallInput.pollLink).toContain("/poll/poll_1");
    expect(firstCallInput.pollLink).toContain("name=Alex");
    expect(firstCallInput.pollLink).toContain("email=alex%40example.com");
  });

  it("resends invite only for invite-only open polls", async () => {
    getPollByUidForOrganizerMock.mockResolvedValue({
      uid: "poll_1",
      title: "Planning",
      description: null,
      visibility: "INVITE_ONLY",
      status: "OPEN",
      participants: [
        {
          id: 21,
          name: "Alex",
          email: "alex@example.com",
        },
      ],
    });

    const caller = makeCaller();
    const result = await caller.resendParticipantInvite({
      pollUid: "poll_1",
      participantId: 21,
    });

    expect(result).toEqual({ success: true });
    expect(sendPollInviteEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPollInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alex@example.com",
      })
    );
  });

  it("adds and invites a participant for invite-only polls", async () => {
    addPollParticipantForOrganizerMock.mockResolvedValue({
      id: 1,
      uid: "poll_1",
      title: "Planning",
      description: null,
      visibility: "INVITE_ONLY",
      status: "OPEN",
      participants: [
        {
          id: 21,
          name: "Alex",
          email: "alex@example.com",
        },
      ],
    });

    const caller = makeCaller();
    await caller.addParticipant({
      pollId: 1,
      name: "Alex",
      email: "ALEX@example.com",
    });

    expect(addPollParticipantForOrganizerMock).toHaveBeenCalledWith({
      pollId: 1,
      organizerId: 10,
      name: "Alex",
      email: "alex@example.com",
    });
    expect(sendPollInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alex@example.com",
        participantName: "Alex",
      })
    );
  });

  it("rejects resend for non invite-only polls", async () => {
    getPollByUidForOrganizerMock.mockResolvedValue({
      uid: "poll_1",
      title: "Planning",
      description: null,
      visibility: "PUBLIC",
      status: "OPEN",
      participants: [],
    });

    const caller = makeCaller();

    await expect(
      caller.resendParticipantInvite({
        pollUid: "poll_1",
        participantId: 21,
      })
    ).rejects.toThrow("Only invite-only polls support participant invite emails");
  });

  it("reopens a poll for the organizer", async () => {
    reopenPollManuallyMock.mockResolvedValue({
      id: 1,
      status: "OPEN",
    });

    const caller = makeCaller();

    const result = await caller.reopen({
      pollId: 1,
    });

    expect(result).toEqual({ id: 1, status: "OPEN" });
    expect(reopenPollManuallyMock).toHaveBeenCalledWith({
      pollId: 1,
      organizerId: 10,
    });
  });

  it("cancels a poll for the organizer", async () => {
    cancelPollManuallyMock.mockResolvedValue({
      id: 1,
      status: "CANCELLED",
    });

    const caller = makeCaller();

    const result = await caller.cancel({
      pollId: 1,
    });

    expect(result).toEqual({ id: 1, status: "CANCELLED" });
    expect(cancelPollManuallyMock).toHaveBeenCalledWith({
      pollId: 1,
      organizerId: 10,
    });
  });
});
