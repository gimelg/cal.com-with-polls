import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicPollPage } from "./PublicPollPage";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === "poll_option_number") {
        return `Option ${values?.number}`;
      }

      if (key === "poll_option_vote_breakdown") {
        return `Yes: ${values?.yes} · If needed: ${values?.ifNeeded} · No: ${values?.no}`;
      }

      if (key === "poll_participant_count") {
        return `${values?.count} participants`;
      }

      if (key === "poll_vote_submitted_description") {
        return `${values?.participantName} submitted for ${values?.pollTitle}`;
      }

      return key;
    },
  }),
}));

vi.mock("@calcom/features/polls/lib/poll-types", () => ({
  createPollAliasEmailFromPollUid: (pollUid: string, participantName: string) =>
    `${participantName.toLowerCase().replaceAll(" ", "-")}@${pollUid}.poll.local`,
}));

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: vi.fn(),
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

vi.mock("@calcom/ui/components/empty-screen", () => ({
  EmptyScreen: ({ headline, description }: { headline: string; description: string }) => (
    <div>
      <p>{headline}</p>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock("@calcom/ui/components/form", () => ({
  TextField: ({ label, value, onChange, type = "text", placeholder }: ComponentProps<"input"> & {
    label: string;
  }) => (
    <label>
      {label}
      <input type={type} value={value as string} onChange={onChange} placeholder={placeholder as string} />
    </label>
  ),
}));

type PollFixture = {
  uid: string;
  title: string;
  description: string | null;
  status: "OPEN" | "CLOSED" | "FINALIZED" | "CANCELLED";
  visibility: "PUBLIC" | "INVITE_ONLY";
  isAnonymous: boolean;
  finalizationMode: "MANUAL" | "MAJORITY" | "UNANIMOUS";
  expiresAt: string | null;
  finalizedOptionId: number | null;
  options: Array<{ id: number; startTime: string; endTime: string; position: number }>;
  participants: Array<{ id: number; name: string }>;
  votes: Array<{ pollOptionId: number; participantId: number; voteType: "YES" | "NO" | "IF_NEEDED" }>;
};

const buildPoll = (overrides?: Partial<PollFixture>): PollFixture => ({
  uid: "poll_123",
  title: "Sprint planning",
  description: "Pick a slot",
  status: "OPEN",
  visibility: "PUBLIC",
  isAnonymous: false,
  finalizationMode: "MANUAL",
  expiresAt: null,
  finalizedOptionId: null,
  options: [
    {
      id: 11,
      startTime: "2026-04-01T10:00:00.000Z",
      endTime: "2026-04-01T10:30:00.000Z",
      position: 0,
    },
  ],
  participants: [],
  votes: [],
  ...overrides,
});

const buildGetByUidResponse = (poll: PollFixture) => {
  return [
    {
      result: {
        data: {
          json: poll,
        },
      },
    },
  ];
};

describe("PublicPollPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a no-responses state when no participants responded yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => buildGetByUidResponse(buildPoll()) });

    vi.stubGlobal("fetch", fetchMock);

    render(<PublicPollPage uid="poll_123" />);

    expect(await screen.findByText("Sprint planning")).toBeInTheDocument();
    expect(screen.getByText("poll_respondents_so_far")).toBeInTheDocument();
    expect(screen.getByText("poll_no_responses_yet")).toBeInTheDocument();
  });

  it("shows dedicated confirmation layout after a successful vote submit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => buildGetByUidResponse(buildPoll()) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { data: { json: {} } } }) });

    vi.stubGlobal("fetch", fetchMock);

    render(<PublicPollPage uid="poll_123" prefilledName="Alex" />);

    expect(await screen.findByText("Sprint planning")).toBeInTheDocument();

    fireEvent.click(screen.getByText("poll_vote_submit"));

    await waitFor(() => {
      expect(screen.getByText("poll_vote_submitted_title")).toBeInTheDocument();
    });

    expect(screen.getByText("Alex submitted for Sprint planning")).toBeInTheDocument();
    expect(screen.getByText("poll_vote_submitted_close_hint")).toBeInTheDocument();
    expect(screen.queryByText("poll_vote_section_title")).not.toBeInTheDocument();
  });
});
