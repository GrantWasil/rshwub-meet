import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("@/features/user/client", () => ({
  useUser: () => ({
    user: { id: "guest", isGuest: true },
    createGuestIfNeeded: vi.fn(),
  }),
}));
vi.mock("@/features/poll/availability/comment/actions", () => ({
  addAvailabilityCommentAction: vi.fn(),
  deleteAvailabilityCommentAction: vi.fn(),
}));
vi.mock("@/trpc/client", () => ({
  trpc: {
    polls: {
      comments: { list: { useQuery: () => ({ data: [], isLoading: false }) } },
    },
    useUtils: () => ({
      polls: { comments: { list: { invalidate: vi.fn() } } },
    }),
  },
}));

import { AvailabilityComments } from "./availability-comments";

describe("availability comment name", () => {
  it("adopts a saved response name that arrives after the comment form mounted", () => {
    const { rerender } = render(
      <AvailabilityComments pollId="poll" canManage={false} open />,
    );
    expect(screen.getByLabelText("Your name")).toHaveValue("");
    rerender(
      <AvailabilityComments
        pollId="poll"
        canManage={false}
        open
        participantName="Alex QA"
      />,
    );
    expect(screen.getByLabelText("Your name")).toHaveValue("Alex QA");
  });
  it("preserves a name the commenter explicitly entered", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AvailabilityComments pollId="poll" canManage={false} open />,
    );
    await user.type(screen.getByLabelText("Your name"), "Alexandra");
    rerender(
      <AvailabilityComments
        pollId="poll"
        canManage={false}
        open
        participantName="Alex QA"
      />,
    );
    expect(screen.getByLabelText("Your name")).toHaveValue("Alexandra");
  });
});
