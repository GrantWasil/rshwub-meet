import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poll: vi.fn() }));
vi.mock("@rallly/database", () => ({
  prisma: { poll: { findFirst: mocks.poll } },
}));

import { getAvailabilityCalendarData, getAvailabilityPoll } from "./data";

const config = {
  dates: ["2026-10-20"],
  timeZone: "America/Denver",
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  slotMinutes: 30,
  durationMinutes: 120,
};
const poll = {
  id: "poll",
  title: "Meet",
  description: null,
  location: null,
  status: "scheduled",
  availabilityConfig: config,
  timeZone: "America/Denver",
  hideParticipants: false,
  hideScores: false,
  participants: [],
  options: [
    {
      id: "option",
      startTime: new Date("2026-10-20T15:00:00.000Z"),
      duration: 120,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poll.mockResolvedValue(poll);
});

describe("availability mode loading", () => {
  it("interprets existing polls without a mode as specific dates", async () => {
    const result = await getAvailabilityPoll("poll");

    expect(result?.config.mode).toBe("dates");
    expect(result?.config.dates).toEqual(["2026-10-20"]);
    expect(result?.finalized).toEqual({
      start: "2026-10-20T15:00:00.000Z",
      end: "2026-10-20T17:00:00.000Z",
    });
  });

  it("never exposes a weekly internal coordinate as a finalized date", async () => {
    mocks.poll.mockResolvedValue({
      ...poll,
      availabilityConfig: { ...config, mode: "weekly", dates: [] },
      options: [
        {
          ...poll.options[0],
          startTime: new Date("2026-01-05T16:00:00.000Z"),
        },
      ],
    });

    const result = await getAvailabilityPoll("poll");

    expect(result?.config.mode).toBe("weekly");
    expect(result?.config.dates).toEqual([]);
    expect(result?.finalized).toBeNull();
  });

  it("keeps calendar export for a dated poll", async () => {
    const calendar = await getAvailabilityCalendarData("poll");

    expect(calendar).toMatchObject({
      start: new Date("2026-10-20T15:00:00.000Z"),
      end: new Date("2026-10-20T17:00:00.000Z"),
      timeZone: "America/Denver",
    });
  });

  it("refuses calendar export for a weekly poll even if a stale option exists", async () => {
    mocks.poll.mockResolvedValue({
      ...poll,
      availabilityConfig: { ...config, mode: "weekly", dates: [] },
    });

    await expect(getAvailabilityCalendarData("poll")).resolves.toBeNull();
  });
});
