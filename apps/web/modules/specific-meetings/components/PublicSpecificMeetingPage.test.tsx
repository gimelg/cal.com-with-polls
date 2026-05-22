import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicSpecificMeetingPage } from "./PublicSpecificMeetingPage";

const showToastMock = vi.fn();

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: (...args: unknown[]) => showToastMock(...args),
}));

vi.mock("@calcom/ui/components/button", () => ({
  Button: ({ children, onClick, type = "button", disabled }: ComponentProps<"button">) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@calcom/ui/components/empty-screen", () => ({
  EmptyScreen: ({ headline, description }: { headline: string; description: string }) => (
    <div>
      <p>{headline}</p>
      <p>{description}</p>
    </div>
  ),
}));

describe("PublicSpecificMeetingPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    showToastMock.mockReset();
  });

  it("loads meeting details and accepts an invite", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            result: {
              data: {
                json: {
                  uid: "sm_1",
                  title: "Planning",
                  description: "Pick a time",
                  timeZone: "UTC",
                  startTime: "2026-04-01T10:00:00.000Z",
                  endTime: "2026-04-01T10:30:00.000Z",
                  status: "SCHEDULED",
                  organizer: {
                    name: "Organizer",
                    email: "organizer@example.com",
                  },
                  invitee: {
                    id: 11,
                    name: "Alex",
                    email: "alex@example.com",
                    status: "PENDING",
                    respondedAt: null,
                  },
                  invitees: [
                    {
                      id: 11,
                      name: "Alex",
                      email: "alex@example.com",
                      status: "PENDING",
                      respondedAt: null,
                    },
                  ],
                },
              },
            },
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ result: { data: { json: {} } } }] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            result: {
              data: {
                json: {
                  uid: "sm_1",
                  title: "Planning",
                  description: "Pick a time",
                  timeZone: "UTC",
                  startTime: "2026-04-01T10:00:00.000Z",
                  endTime: "2026-04-01T10:30:00.000Z",
                  status: "SCHEDULED",
                  organizer: {
                    name: "Organizer",
                    email: "organizer@example.com",
                  },
                  invitee: {
                    id: 11,
                    name: "Alex",
                    email: "alex@example.com",
                    status: "ACCEPTED",
                    respondedAt: "2026-04-01T09:00:00.000Z",
                  },
                  invitees: [
                    {
                      id: 11,
                      name: "Alex",
                      email: "alex@example.com",
                      status: "ACCEPTED",
                      respondedAt: "2026-04-01T09:00:00.000Z",
                    },
                  ],
                },
              },
            },
          },
        ],
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<PublicSpecificMeetingPage uid="sm_1" token="token_1" />);

    expect(await screen.findByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("specific_meeting_your_status:")).toBeInTheDocument();
    expect(screen.getAllByText("PENDING")[0]).toBeInTheDocument();

    fireEvent.click(screen.getByText("yes"));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("specific_meeting_response_accepted", "success");
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("shows cancelled state when meeting is cancelled", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          result: {
            data: {
              json: {
                uid: "sm_1",
                title: "Planning",
                description: null,
                timeZone: "UTC",
                startTime: "2026-04-01T10:00:00.000Z",
                endTime: "2026-04-01T10:30:00.000Z",
                status: "CANCELLED",
                organizer: {
                  name: "Organizer",
                  email: "organizer@example.com",
                },
                invitee: {
                  id: 11,
                  name: "Alex",
                  email: "alex@example.com",
                  status: "PENDING",
                  respondedAt: null,
                },
                invitees: [],
              },
            },
          },
        },
      ],
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<PublicSpecificMeetingPage uid="sm_1" token="token_1" />);

    await waitFor(() => {
      expect(screen.getByText("specific_meeting_cancelled")).toBeInTheDocument();
    });
    expect(screen.queryByText("yes")).not.toBeInTheDocument();
    expect(screen.queryByText("no")).not.toBeInTheDocument();
  });

  it("shows an error state when the invite cannot be loaded", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => [
        {
          error: {
            message: "Specific meeting invite not found",
          },
        },
      ],
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<PublicSpecificMeetingPage uid="sm_1" token="token_1" />);

    await waitFor(() => {
      expect(screen.getByText("specific_meeting_invite_not_found")).toBeInTheDocument();
    });
  });
});
