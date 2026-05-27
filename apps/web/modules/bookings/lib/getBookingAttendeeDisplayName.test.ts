import { describe, expect, it } from "vitest";
import { getBookingAttendeeDisplayName, hasBookingAttendeeDisplayName } from "./getBookingAttendeeDisplayName";

describe("getBookingAttendeeDisplayName", () => {
  it("prefers the stored attendee name over linked user data", () => {
    expect(
      getBookingAttendeeDisplayName({
        email: "beta@example.com",
        name: "Beta Invitee",
        user: { name: "Existing User", email: "beta@example.com" },
      } as never)
    ).toBe("Beta Invitee");
  });

  it("falls back to email when no usable name is present", () => {
    expect(
      getBookingAttendeeDisplayName({
        email: "beta@example.com",
        name: "   ",
        user: { name: null, email: "beta@example.com" },
      } as never)
    ).toBe("beta@example.com");
    expect(
      hasBookingAttendeeDisplayName({
        name: "   ",
        user: { name: null },
      } as never)
    ).toBe(false);
  });
});
