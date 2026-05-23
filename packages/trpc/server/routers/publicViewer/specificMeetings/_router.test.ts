import { describe, expect, it, vi } from "vitest";

const specificMeetingServiceMock = {
  getInviteeView: vi.fn(),
  respond: vi.fn(),
};

vi.mock("@calcom/features/specific-meetings/services/SpecificMeetingService", () => ({
  SpecificMeetingService: class {
    getInviteeView = specificMeetingServiceMock.getInviteeView;
    respond = specificMeetingServiceMock.respond;
  },
}));

import { publicSpecificMeetingsRouter } from "./_router";

describe("public specific meetings router", () => {
  const caller = publicSpecificMeetingsRouter.createCaller({} as never);

  it("loads invitee context by uid and token", async () => {
    specificMeetingServiceMock.getInviteeView.mockResolvedValue({ uid: "sm_1", invitee: { id: 11 } });

    const result = await caller.getByUid({ uid: "sm_1", token: "token_1" });

    expect(result).toEqual({ uid: "sm_1", invitee: { id: 11 } });
    expect(specificMeetingServiceMock.getInviteeView).toHaveBeenCalledWith({ uid: "sm_1", responseToken: "token_1" });
  });

  it("records an invitee response", async () => {
    specificMeetingServiceMock.respond.mockResolvedValue({
      uid: "sm_1",
      booking: { uid: "booking_1" },
      organizer: { id: 10, name: "Organizer", email: "organizer@example.com" },
      invitee: { id: 11, name: "Alex", email: "alex@example.com" },
      title: "Planning",
      description: null,
      timeZone: "UTC",
      startTime: new Date("2026-04-01T10:00:00.000Z"),
    });

    const result = await caller.respond({ uid: "sm_1", token: "token_1", response: "ACCEPTED" });

    expect(result).toEqual(expect.objectContaining({ uid: "sm_1", invitee: expect.objectContaining({ id: 11 }) }));
    expect(specificMeetingServiceMock.respond).toHaveBeenCalledWith({
      uid: "sm_1",
      responseToken: "token_1",
      response: "ACCEPTED",
    });
  });
});
