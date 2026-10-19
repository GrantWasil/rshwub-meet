import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@/test/test-utils";

const mocks = vi.hoisted(() => ({
  createGuest: vi.fn(),
  redeem: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/features/user/client", () => ({
  useUser: () => ({ createGuestIfNeeded: mocks.createGuest }),
}));
vi.mock("../actions", () => ({
  redeemPollManagementLinkAction: mocks.redeem,
}));

import { RedeemManagementLink } from "./redeem-management-link";

const token = "a".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(
    { __NA: true, tree: ["manage"] },
    "",
    `/manage/poll-a#${token}`,
  );
  mocks.createGuest.mockResolvedValue(undefined);
  mocks.redeem.mockResolvedValue({ data: { destination: "/poll/poll-a" } });
});

describe("private organizer link recovery", () => {
  it("redeems once under strict effect replay and preserves router history state while removing the fragment", async () => {
    const historyState = window.history.state;
    render(
      <StrictMode>
        <RedeemManagementLink pollId="poll-a" />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/poll/poll-a"),
    );
    expect(mocks.createGuest).toHaveBeenCalledTimes(1);
    expect(mocks.redeem).toHaveBeenCalledExactlyOnceWith({
      pollId: "poll-a",
      token,
    });
    expect(window.location.hash).toBe("");
    expect(window.history.state).toEqual(historyState);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("finishes the original redemption if guest-session refresh remounts the page after clearing the fragment", async () => {
    let finishGuest: () => void = () => {};
    mocks.createGuest.mockReturnValue(
      new Promise<void>((resolve) => {
        finishGuest = resolve;
      }),
    );
    const first = render(<RedeemManagementLink pollId="poll-a" />);
    expect(window.location.hash).toBe("");
    first.unmount();
    render(<RedeemManagementLink pollId="poll-a" />);
    await act(async () => finishGuest());
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/poll/poll-a"),
    );
    expect(mocks.redeem).toHaveBeenCalledExactlyOnceWith({
      pollId: "poll-a",
      token,
    });
  });

  it("retains the captured secret for a manual retry after a transient failure", async () => {
    mocks.redeem.mockResolvedValueOnce({ serverError: "SERVICE_UNAVAILABLE" });
    const user = userEvent.setup();
    render(<RedeemManagementLink pollId="poll-a" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Manage poll" })).toBeEnabled(),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    await user.click(screen.getByRole("button", { name: "Manage poll" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/poll/poll-a"),
    );
    expect(mocks.redeem).toHaveBeenLastCalledWith({ pollId: "poll-a", token });
  });

  it("does not redeem or navigate for a link without a fragment", () => {
    window.history.replaceState(window.history.state, "", "/manage/poll-a");
    render(<RedeemManagementLink pollId="poll-a" />);
    expect(screen.getByRole("button", { name: "Manage poll" })).toBeDisabled();
    expect(mocks.redeem).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
