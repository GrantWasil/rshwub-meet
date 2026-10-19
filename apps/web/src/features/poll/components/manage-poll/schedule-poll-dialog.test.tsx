import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@/test/test-utils";

const mocks = vi.hoisted(() => ({ book: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/features/poll/client", () => ({
  usePoll: () => ({
    id: "poll",
    timeZone: "UTC",
    options: [
      {
        id: "option",
        startTime: new Date("2026-10-20T18:00:00Z"),
        duration: 120,
      },
    ],
  }),
}));
vi.mock("@/features/poll/components/participants-provider", () => ({
  useParticipants: () => ({ participants: [] }),
}));
vi.mock("@/features/poll/components/score-summary", () => ({
  ConnectedScoreSummary: () => null,
}));
vi.mock("@/features/poll/components/vote-summary-progress-bar", () => ({
  VoteSummaryProgressBar: () => null,
}));
vi.mock("@/features/scheduled-event/components/event-date-time", () => ({
  EventDate: () => <span>October 20</span>,
  EventTimeRange: () => <span>6–8 PM</span>,
}));
vi.mock("@/lib/datetime/client", () => ({
  useDateTimeConfig: () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/trpc/client", () => ({
  trpc: {
    useUtils: () => ({ polls: { get: { invalidate: mocks.invalidate } } }),
    polls: {
      book: {
        useMutation: () => {
          const [isPending, setPending] = React.useState(false);
          const [error, setError] = React.useState<Error | null>(null);
          return {
            isPending,
            error,
            reset: () => setError(null),
            mutateAsync: async (input: unknown) => {
              setPending(true);
              try {
                return await mocks.book(input);
              } catch (error) {
                setError(error as Error);
                throw error;
              } finally {
                setPending(false);
              }
            },
          };
        },
      },
    },
  },
}));

import { SchedulePollDialog } from "./schedule-poll-dialog";

beforeEach(() => vi.clearAllMocks());

describe("scheduling dialog mutation feedback", () => {
  it("keeps the dialog visible and controls disabled until scheduling succeeds", async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => {};
    mocks.book.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onOpenChange = vi.fn();
    render(<SchedulePollDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => resolve(undefined));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.invalidate).toHaveBeenCalledWith({ urlId: "poll" });
  });

  it("shows scheduling failures without dismissing or losing the selected date", async () => {
    const user = userEvent.setup();
    mocks.book.mockRejectedValue(
      new Error("Only the organizer can schedule this poll"),
    );
    const onOpenChange = vi.fn();
    render(<SchedulePollDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only the organizer can schedule this poll",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("radio")).toBeChecked();
  });
});
