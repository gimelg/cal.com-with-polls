import { describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.fn();
const pollInviteEmailConstructorMock = vi.fn();

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

import { sendPollInviteEmail } from "./poll-email-service";

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
        t: ((key: string) => key) as never,
      })
    ).rejects.toThrow("constructor failed");
  });
});
