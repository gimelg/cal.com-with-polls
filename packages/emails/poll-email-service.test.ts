import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.fn();
const pollInviteEmailConstructorMock = vi.fn();
const pollFinalizedEmailConstructorMock = vi.fn();

vi.mock("./templates/poll-invite-email", () => {
  return {
    __esModule: true,
    default: class MockPollInviteEmail {
      constructor(input: unknown) {
        pollInviteEmailConstructorMock(input);
      }

      sendEmail() {
        return sendEmailMock();
      }
    },
  };
});

vi.mock("./templates/poll-finalized-email", () => {
  return {
    __esModule: true,
    default: class MockPollFinalizedEmail {
      constructor(input: unknown) {
        pollFinalizedEmailConstructorMock(input);
      }

      sendEmail() {
        return sendEmailMock();
      }
    },
  };
});

import { sendPollFinalizedEmail, sendPollInviteEmail } from "./poll-email-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendPollInviteEmail", () => {
  it("builds and sends the poll invite email", async () => {
    sendEmailMock.mockResolvedValueOnce(undefined);

    const input = {
      to: "participant@example.com",
      organizerName: "Organizer",
      participantName: "Participant",
      pollTitle: "Planning Poll",
      pollDescription: "Pick a slot",
      pollLink: "https://app.cal.com/poll/poll_1",
      hideBranding: false,
      t: ((key: string) => key) as never,
    };

    await sendPollInviteEmail(input);

    expect(pollInviteEmailConstructorMock).toHaveBeenCalledWith(input);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when email construction fails", async () => {
    pollInviteEmailConstructorMock.mockImplementationOnce(() => {
      throw new Error("constructor failed");
    });

    await expect(
      sendPollInviteEmail({
        to: "participant@example.com",
        organizerName: "Organizer",
        participantName: "Participant",
        pollTitle: "Planning Poll",
        pollDescription: null,
        pollLink: "https://app.cal.com/poll/poll_1",
        hideBranding: false,
        t: ((key: string) => key) as never,
      })
    ).rejects.toThrow("constructor failed");
  });
});

describe("sendPollFinalizedEmail", () => {
  it("builds and sends the poll finalized email", async () => {
    sendEmailMock.mockResolvedValueOnce(undefined);

    const input = {
      to: "participant@example.com",
      recipientName: "Participant",
      recipientRole: "PARTICIPANT" as const,
      pollTitle: "Planning Poll",
      pollDescription: "Pick a slot",
      selectedSlot: "Apr 2, 2026 10:00 AM - Apr 2, 2026 10:30 AM (UTC)",
      pollLink: "https://app.cal.com/poll/poll_1",
      hideBranding: false,
      t: ((key: string) => key) as never,
    };

    await sendPollFinalizedEmail(input);

    expect(pollFinalizedEmailConstructorMock).toHaveBeenCalledWith(input);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
