import type { EventTypeSetupProps } from "@calcom/features/eventtypes/lib/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventSpecificMeetingsTab } from "./EventSpecificMeetingsTab";

const listByEventTypeUseQueryMock = vi.fn();
const createMutateMock = vi.fn();
const cancelMutateMock = vi.fn();
const resendInviteMutateMock = vi.fn();
const deleteMutateMock = vi.fn();
const copyTextMock = vi.fn();
const showToastMock = vi.fn();

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      viewer: {
        specificMeetings: {
          listByEventType: {
            invalidate: vi.fn(),
          },
        },
      },
    }),
    viewer: {
      specificMeetings: {
        listByEventType: {
          useQuery: (...args: unknown[]) => listByEventTypeUseQueryMock(...args),
        },
        create: {
          useMutation: () => ({ mutate: createMutateMock, isPending: false }),
        },
        cancel: {
          useMutation: () => ({ mutate: cancelMutateMock, isPending: false }),
        },
        resendInvite: {
          useMutation: () => ({ mutate: resendInviteMutateMock, isPending: false }),
        },
        delete: {
          useMutation: () => ({ mutate: deleteMutateMock, isPending: false }),
        },
      },
    },
  },
}));

vi.mock("@calcom/ui/components/button", () => ({
  Button: ({ children, onClick, type = "button", disabled }: ComponentProps<"button">) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@calcom/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@calcom/ui/components/empty-screen", () => ({
  EmptyScreen: ({ headline }: { headline: string }) => <div>{headline}</div>,
}));

vi.mock("@calcom/ui/components/form", () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) => (
    <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange?.(event.target.checked)} />
  ),
  TextField: ({ label, value, onChange }: ComponentProps<"input"> & { label: string }) => (
    <label>
      {label}
      <input value={value as string} onChange={onChange} />
    </label>
  ),
  TextAreaField: ({ label, value, onChange }: ComponentProps<"textarea"> & { label: string }) => (
    <label>
      {label}
      <textarea value={value as string} onChange={onChange} />
    </label>
  ),
}));

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: (...args: unknown[]) => showToastMock(...args),
}));

const eventTypeFixture = {
  id: 100,
  length: 30,
  timeZone: "UTC",
} as unknown as EventTypeSetupProps["eventType"];

describe("EventSpecificMeetingsTab", () => {
  beforeEach(() => {
    listByEventTypeUseQueryMock.mockReset();
    createMutateMock.mockReset();
    cancelMutateMock.mockReset();
    resendInviteMutateMock.mockReset();
    deleteMutateMock.mockReset();
    showToastMock.mockReset();
    copyTextMock.mockReset();
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: copyTextMock,
      },
    });
  });

  it("creates a meeting and shows resend/cancel actions", async () => {
    listByEventTypeUseQueryMock.mockReturnValue({
      isPending: false,
      data: [
        {
          id: 1,
          uid: "sm_1",
          title: "Planning",
          description: "Pick a slot",
          status: "SCHEDULED",
          startTime: new Date("2026-04-01T10:00:00.000Z"),
          endTime: new Date("2026-04-01T10:30:00.000Z"),
          invitees: [
            {
              id: 11,
              name: "Alex",
              email: "alex@example.com",
              status: "PENDING",
              responseUrl: "/meeting/sm_1?token=token_1",
            },
          ],
        },
      ],
    });

    render(<EventSpecificMeetingsTab eventType={eventTypeFixture} />);

    expect(screen.getByText("specific_meetings")).toBeInTheDocument();
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("specific_meeting_resend_invite")).toBeInTheDocument();
    expect(screen.getByText("cancel")).toBeInTheDocument();

    fireEvent.click(screen.getByText("specific_meeting_copy_invite_link"));
    expect(copyTextMock).toHaveBeenCalled();

    fireEvent.click(screen.getByText("specific_meeting_resend_invite"));
    expect(resendInviteMutateMock).toHaveBeenCalledWith({ uid: "sm_1", inviteeId: 11 });

    fireEvent.click(screen.getByText("cancel"));
    expect(cancelMutateMock).toHaveBeenCalledWith({ uid: "sm_1" });
  });

  it("validates required fields before creating", () => {
    listByEventTypeUseQueryMock.mockReturnValue({ isPending: false, data: [] });

    render(<EventSpecificMeetingsTab eventType={eventTypeFixture} />);

    fireEvent.click(screen.getByText("create_specific_meeting"));

    expect(showToastMock).toHaveBeenCalledWith("specific_meeting_title_required", "error");

    fireEvent.change(screen.getByLabelText("title"), { target: { value: "Planning" } });
    fireEvent.click(screen.getByText("create_specific_meeting"));

    expect(showToastMock).toHaveBeenCalledWith("specific_meeting_participant_required", "error");
  });

  it("supports per-invitee required acceptance and require all", () => {
    listByEventTypeUseQueryMock.mockReturnValue({ isPending: false, data: [] });

    render(<EventSpecificMeetingsTab eventType={eventTypeFixture} />);

    fireEvent.change(screen.getByLabelText("title"), { target: { value: "Planning" } });
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("email"), { target: { value: "alex@example.com" } });

    fireEvent.click(screen.getByText("add_participant"));

    const nameFields = screen.getAllByLabelText("name");
    const emailFields = screen.getAllByLabelText("email");
    fireEvent.change(nameFields[1], { target: { value: "Blair" } });
    fireEvent.change(emailFields[1], { target: { value: "blair@example.com" } });

    const requiredCheckboxes = screen.getAllByRole("checkbox");
    fireEvent.click(requiredCheckboxes[0]);
    fireEvent.click(screen.getByText("specific_meeting_require_all"));
    fireEvent.click(screen.getByText("create_specific_meeting"));

    expect(createMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        participants: [
          { name: "Alex", email: "alex@example.com", required: true },
          { name: "Blair", email: "blair@example.com", required: true },
        ],
      })
    );
  });
});
