import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  poll: vi.fn(),
  update: vi.fn(),
  deleteOptions: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@rallly/database", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: mocks.lock,
        poll: { findFirst: mocks.poll, update: mocks.update },
        option: { deleteMany: mocks.deleteOptions },
      }),
  },
}));
vi.mock("@/features/poll/activity/mutations", () => ({
  recordPollActivities: mocks.activity,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  changeAvailabilityPollStatus,
  deleteAvailabilityPoll,
  editAvailabilityPoll,
} from "./mutations";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poll.mockResolvedValue({ status: "scheduled" });
});

describe("availability organizer lifecycle", () => {
  it("rechecks after taking the lock and rejects a poll deleted while authorization was in flight", async () => {
    mocks.poll.mockResolvedValue(null);
    await expect(
      editAvailabilityPoll({
        input: { pollId: "poll", title: "New", description: "", location: "" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.poll.mock.invocationCallOrder[0],
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("clears the old chosen time on reopening while leaving participant responses untouched", async () => {
    await changeAvailabilityPollStatus({
      input: { pollId: "poll", status: "open" },
    });
    expect(mocks.deleteOptions).toHaveBeenCalledWith({
      where: { pollId: "poll" },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "poll" },
      data: {
        status: "open",
        closedReason: null,
        deadline: null,
        eventId: null,
      },
    });
    expect(mocks.activity).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ type: "poll_reopened" }),
    ]);
  });

  it("cannot replace a concurrent finalization with a close response", async () => {
    await expect(
      changeAvailabilityPollStatus({
        input: { pollId: "poll", status: "closed" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteOptions).not.toHaveBeenCalled();
  });

  it("hides a deleted poll using both existing deletion flags", async () => {
    await deleteAvailabilityPoll("poll");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "poll" },
      data: { deleted: true, deletedAt: expect.any(Date) },
    });
    expect(mocks.deleteOptions).not.toHaveBeenCalled();
  });
});
