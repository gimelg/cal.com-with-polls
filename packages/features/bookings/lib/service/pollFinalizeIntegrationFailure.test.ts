import type { EventResult } from "@calcom/types/EventManager";
import { describe, expect, it } from "vitest";
import { getPollFinalizeIntegrationFailure } from "./pollFinalizeIntegrationFailure";

const buildResult = (overrides: Partial<EventResult<unknown>>): EventResult<unknown> => {
  return {
    type: "zoom_video",
    appName: "Zoom",
    success: true,
    uid: "uid-1",
    originalEvent: {} as EventResult<unknown>["originalEvent"],
    ...overrides,
  };
};

describe("getPollFinalizeIntegrationFailure", () => {
  it("returns null when booking metadata is not for poll finalization", () => {
    const failure = getPollFinalizeIntegrationFailure({
      metadata: { source: "manual" },
      results: [buildResult({ success: false })],
    });

    expect(failure).toBeNull();
  });

  it("returns integration failure when selected video platform fails", () => {
    const failure = getPollFinalizeIntegrationFailure({
      metadata: { pollId: "5", pollOptionId: "10" },
      results: [buildResult({ type: "zoom_video", appName: "Zoom Video", success: false })],
    });

    expect(failure).not.toBeNull();
    expect(failure?.failedIntegrations).toEqual(["Zoom Video"]);
    expect(failure?.userMessage).toContain("Zoom Video");
  });

  it("returns integration failure when calendar integration fails", () => {
    const failure = getPollFinalizeIntegrationFailure({
      metadata: { pollId: "5", pollOptionId: "10" },
      results: [buildResult({ type: "google_calendar", appName: "Google Calendar", success: false })],
    });

    expect(failure).not.toBeNull();
    expect(failure?.failedIntegrations).toEqual(["Google Calendar"]);
    expect(failure?.userMessage).toContain("Google Calendar");
  });

  it("returns integration failure when conferencing integration fails", () => {
    const failure = getPollFinalizeIntegrationFailure({
      metadata: { pollId: "5", pollOptionId: "10" },
      results: [buildResult({ type: "conferencing", appName: "Google Meet", success: false })],
    });

    expect(failure).not.toBeNull();
    expect(failure?.failedIntegrations).toEqual(["Google Meet"]);
    expect(failure?.userMessage).toContain("Google Meet");
  });

  it("returns null when poll finalization integrations succeeded", () => {
    const failure = getPollFinalizeIntegrationFailure({
      metadata: { pollId: "5", pollOptionId: "10" },
      results: [
        buildResult({ type: "zoom_video", appName: "Zoom", success: true }),
        buildResult({ type: "google_calendar", appName: "Google Calendar", success: true }),
      ],
    });

    expect(failure).toBeNull();
  });
});
