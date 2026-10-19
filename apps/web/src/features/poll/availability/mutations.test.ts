import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  poll: vi.fn(),
  pollUpdate: vi.fn(),
  participant: vi.fn(),
  participantCount: vi.fn(),
  participantCreate: vi.fn(),
  participantUpdate: vi.fn(),
  optionCreate: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@rallly/database", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: mocks.lock,
        poll: { findFirst: mocks.poll, update: mocks.pollUpdate },
        participant: {
          findFirst: mocks.participant,
          count: mocks.participantCount,
          create: mocks.participantCreate,
          update: mocks.participantUpdate,
        },
        option: { create: mocks.optionCreate },
      }),
  },
}));
vi.mock("@/features/poll/activity/mutations", () => ({
  recordPollActivities: mocks.activity,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  finalizeAvailabilityPoll,
  saveAvailabilityResponse,
} from "./mutations";

const config = {
  dates: ["2026-10-20"],
  timeZone: "America/Denver",
  startMinute: 1080,
  endMinute: 1320,
  slotMinutes: 15,
  durationMinutes: 120,
};
const input = { pollId: "poll", name: "Alex", intervals: [] };
const finalInput = {
  pollId: "poll",
  start: "2026-10-21T00:00:00.000Z",
  end: "2026-10-21T02:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poll.mockResolvedValue({
    status: "open",
    deadline: null,
    availabilityConfig: config,
  });
  mocks.participant.mockResolvedValue(null);
  mocks.participantCount.mockResolvedValue(0);
  mocks.participantCreate.mockResolvedValue({
    id: "response",
    token: "secret",
  });
  mocks.participantUpdate.mockResolvedValue({
    id: "response",
    token: "secret",
  });
  mocks.optionCreate.mockResolvedValue({ id: "selected-option" });
});

describe("availability lifecycle transactions", () => {
  it.each([
    "closed",
    "scheduled",
    "canceled",
  ])("rejects a response if the poll became %s after authorization", async (status) => {
    mocks.poll.mockResolvedValue({ status, availabilityConfig: config });
    await expect(
      saveAvailabilityResponse({ userId: "guest", input }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.participantCreate).not.toHaveBeenCalled();
    expect(mocks.participantUpdate).not.toHaveBeenCalled();
  });

  it("enforces expired deadlines even before house-keeping closes the poll", async () => {
    mocks.poll.mockResolvedValue({
      status: "open",
      deadline: new Date("2000-01-01"),
      availabilityConfig: config,
    });
    await expect(
      saveAvailabilityResponse({ userId: "guest", input }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.participantCreate).not.toHaveBeenCalled();
  });

  it("rejects forged time ranges before creating a response", async () => {
    await expect(
      saveAvailabilityResponse({
        userId: "guest",
        input: {
          ...input,
          intervals: [
            {
              start: "2026-10-21T00:01:00.000Z",
              end: "2026-10-21T01:00:00.000Z",
              type: "yes",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.participantCreate).not.toHaveBeenCalled();
  });

  it("reuses an existing response from the same session during concurrent first saves", async () => {
    mocks.participant.mockResolvedValue({ id: "response", token: "secret" });
    await saveAvailabilityResponse({ userId: "guest", input });
    expect(mocks.participantUpdate).toHaveBeenCalledOnce();
    expect(mocks.participantCreate).not.toHaveBeenCalled();
  });

  it("caps response storage inside the lock", async () => {
    mocks.participantCount.mockResolvedValue(500);
    await expect(
      saveAvailabilityResponse({ userId: "guest", input }),
    ).rejects.toMatchObject({ code: "POLL_FULL" });
    expect(mocks.participantCreate).not.toHaveBeenCalled();
  });

  it("finalizes with exactly one option and the selected duration", async () => {
    await finalizeAvailabilityPoll({ userId: "owner", input: finalInput });
    expect(mocks.optionCreate).toHaveBeenCalledOnce();
    expect(mocks.optionCreate).toHaveBeenCalledWith({
      data: {
        pollId: "poll",
        startTime: new Date(finalInput.start),
        duration: 120,
      },
      select: { id: true },
    });
    expect(mocks.pollUpdate).toHaveBeenCalledWith({
      where: { id: "poll" },
      data: { status: "scheduled", closedReason: null },
    });
  });

  it("rejects a second finalization and wrong-duration selections", async () => {
    mocks.poll.mockResolvedValueOnce({
      status: "scheduled",
      availabilityConfig: config,
    });
    await expect(
      finalizeAvailabilityPoll({ input: finalInput }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      finalizeAvailabilityPoll({
        input: { ...finalInput, end: "2026-10-21T01:00:00.000Z" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.optionCreate).not.toHaveBeenCalled();
  });
});
