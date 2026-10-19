import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  poll: vi.fn(),
  option: vi.fn(),
  update: vi.fn(),
  deleteEvent: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@rallly/database", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: mocks.lock,
        poll: { findFirst: mocks.poll, update: mocks.update },
        option: { findFirst: mocks.option },
        scheduledEvent: { delete: mocks.deleteEvent },
      }),
  },
}));
vi.mock("@/features/poll/activity/mutations", () => ({
  recordPollActivities: mocks.activity,
}));

import {
  finalizePollOption,
  lockOpenOptionsPoll,
  reopenOptionsPoll,
} from "./mutations";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poll.mockResolvedValue({
    status: "open",
    timeZone: "America/Denver",
    scheduledEventId: null,
  });
  mocks.option.mockResolvedValue({
    startTime: new Date("2026-10-21T00:00:00Z"),
    duration: 120,
  });
});

describe("guest option finalization", () => {
  it("locks and rechecks the voting window inside response transactions", async () => {
    const lock = vi.fn();
    const findFirst = vi.fn().mockResolvedValue({ id: "poll" });
    const tx = {
      $queryRaw: lock,
      poll: { findFirst },
    } as unknown as Parameters<typeof lockOpenOptionsPoll>[0];
    await lockOpenOptionsPoll(tx, "poll");
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[0],
    );
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      id: "poll",
      status: "open",
      deleted: false,
      schedulingMode: "options",
    });
    findFirst.mockResolvedValue(null);
    await expect(lockOpenOptionsPoll(tx, "poll")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("stores the chosen existing option and preserves options and votes", async () => {
    const result = await finalizePollOption({
      pollId: "poll",
      optionId: "chosen",
      userId: "guest",
    });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.poll.mock.invocationCallOrder[0],
    );
    expect(mocks.option).toHaveBeenCalledWith({
      where: { id: "chosen", pollId: "poll" },
      select: { startTime: true, duration: true },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "poll" },
      data: {
        status: "scheduled",
        closedReason: null,
        finalizedOptionId: "chosen",
        scheduledEventId: null,
      },
    });
    expect(result).toEqual({
      start: new Date("2026-10-21T00:00:00Z"),
      end: new Date("2026-10-21T02:00:00Z"),
      allDay: false,
      timeZone: "America/Denver",
    });
    expect(mocks.activity).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        type: "poll_scheduled",
        userId: "guest",
        optionId: "chosen",
      }),
    ]);
  });

  it("allows a capability-only caller and a manually closed poll", async () => {
    mocks.poll.mockResolvedValue({ status: "closed", timeZone: "UTC" });
    await expect(
      finalizePollOption({ pollId: "poll", optionId: "chosen" }),
    ).resolves.toHaveProperty("allDay", false);
  });

  it("rejects choices belonging to another poll", async () => {
    mocks.option.mockResolvedValue(null);
    await expect(
      finalizePollOption({ pollId: "poll", optionId: "foreign-option" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
  });

  it.each([
    "scheduled",
    "canceled",
  ])("rejects another finalization when the locked poll is %s", async (status) => {
    mocks.poll.mockResolvedValue({ status, timeZone: "UTC" });
    await expect(
      finalizePollOption({ pollId: "poll", optionId: "chosen" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires a live poll owned by an active user", async () => {
    mocks.poll.mockResolvedValue(null);
    await expect(
      finalizePollOption({ pollId: "poll", optionId: "chosen" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.poll.mock.calls[0][0].where).toEqual({
      id: "poll",
      deleted: false,
      schedulingMode: "options",
      user: { banned: false, deletedAt: null },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps all-day choices floating across viewer time zones", async () => {
    mocks.option.mockResolvedValue({
      startTime: new Date("2026-10-20T00:00:00Z"),
      duration: 0,
    });
    expect(
      await finalizePollOption({ pollId: "poll", optionId: "chosen" }),
    ).toEqual({
      allDay: true,
      start: new Date("2026-10-20T00:00:00Z"),
      end: new Date("2026-10-21T00:00:00Z"),
      timeZone: null,
    });
  });
});

describe("reopening both finalization paths", () => {
  it("clears the guest final selection and deadline without removing responses", async () => {
    mocks.poll.mockResolvedValue({
      status: "scheduled",
      scheduledEventId: null,
    });
    await reopenOptionsPoll({ pollId: "poll", userId: "recovered-guest" });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "poll" },
      data: {
        status: "open",
        closedReason: null,
        finalizedOptionId: null,
        scheduledEventId: null,
        deadline: null,
      },
    });
    expect(mocks.deleteEvent).not.toHaveBeenCalled();
    expect(mocks.activity).toHaveBeenCalledWith(expect.anything(), [
      {
        pollId: "poll",
        userId: "recovered-guest",
        type: "poll_reopened",
        payload: {},
      },
    ]);
  });

  it("also deletes the previously linked registered ScheduledEvent", async () => {
    mocks.poll.mockResolvedValue({
      status: "scheduled",
      scheduledEventId: "event",
    });
    await reopenOptionsPoll({ pollId: "poll", userId: "owner" });
    expect(mocks.deleteEvent).toHaveBeenCalledWith({ where: { id: "event" } });
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteEvent.mock.invocationCallOrder[0],
    );
  });

  it("repeated reopening is a no-op and emits no duplicate activity", async () => {
    await reopenOptionsPoll({ pollId: "poll" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteEvent).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
  });
});
