import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventTypeSetupProps } from "@calcom/features/eventtypes/lib/types";
import { EventPollsTab } from "./EventPollsTab";

const listByEventTypeUseQueryMock = vi.fn();

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === "poll_option_number") {
        return `Option ${values?.number}`;
      }

      if (key === "poll_option_vote_breakdown") {
        return `Yes: ${values?.yes} · If needed: ${values?.ifNeeded} · No: ${values?.no}`;
      }

      if (key === "yes") return "Yes";
      if (key === "no") return "No";
      if (key === "poll_vote_if_needed") return "If needed";

      return key;
    },
  }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      viewer: {
        polls: {
          listByEventType: {
            invalidate: vi.fn(),
          },
        },
      },
    }),
    viewer: {
      polls: {
        listByEventType: {
          useQuery: (...args: unknown[]) => listByEventTypeUseQueryMock(...args),
        },
        create: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        finalizeManually: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        close: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        updateParticipant: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        resendParticipantInvite: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
    },
  },
}));

vi.mock("@calcom/features/components/controlled-dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@calcom/ui/components/dialog", () => ({
  ConfirmationDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@calcom/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@calcom/ui/components/button", () => ({
  Button: ({ children, onClick, type = "button", disabled }: ComponentProps<"button">) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@calcom/ui/components/form", () => ({
  TextField: ({ label, value, onChange, type = "text" }: ComponentProps<"input"> & { label: string }) => (
    <label>
      {label}
      <input type={type} value={value as string} onChange={onChange} />
    </label>
  ),
  TextAreaField: ({ label, value, onChange }: ComponentProps<"textarea"> & { label: string }) => (
    <label>
      {label}
      <textarea value={value as string} onChange={onChange} />
    </label>
  ),
  CheckboxField: ({ description, checked, onChange }: { description: string; checked: boolean; onChange: (event: { target: { checked: boolean } }) => void }) => (
    <label>
      {description}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange({ target: { checked: event.target.checked } })}
      />
    </label>
  ),
}));

vi.mock("@calcom/ui/components/empty-screen", () => ({
  EmptyScreen: ({ headline }: { headline: string }) => <div>{headline}</div>,
}));

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: vi.fn(),
}));

const eventTypeFixture = {
  id: 100,
  length: 30,
  timeZone: "UTC",
} as unknown as EventTypeSetupProps["eventType"];

describe("EventPollsTab", () => {
  beforeEach(() => {
    listByEventTypeUseQueryMock.mockReset();
  });

  it("shows per-option responses only after toggling", () => {
    listByEventTypeUseQueryMock.mockReturnValue({
      isPending: false,
      data: [
        {
          id: 1,
          uid: "poll_1",
          title: "Planning",
          description: null,
          status: "OPEN",
          visibility: "PUBLIC",
          isAnonymous: false,
          finalizationMode: "MANUAL",
          organizerId: 10,
          expiresAt: null,
          finalizedAt: null,
          finalizedById: null,
          finalizedOptionId: null,
          finalizedBookingId: null,
          options: [
            {
              id: 11,
              startTime: new Date("2026-04-01T10:00:00.000Z"),
              endTime: new Date("2026-04-01T10:30:00.000Z"),
              position: 0,
            },
          ],
          participants: [
            {
              id: 21,
              name: "Alex",
              email: "participant-100-21@poll.local",
            },
          ],
          votes: [
            {
              pollOptionId: 11,
              participantId: 21,
              voteType: "YES",
            },
          ],
        },
      ],
    });

    render(<EventPollsTab eventType={eventTypeFixture} />);

    expect(screen.queryByText("Alex")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("poll_show_responses"));

    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();

    fireEvent.click(screen.getByText("poll_hide_responses"));

    expect(screen.queryByText("Alex")).not.toBeInTheDocument();
  });
});
