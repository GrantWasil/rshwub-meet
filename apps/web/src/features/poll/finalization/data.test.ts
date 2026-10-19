import { beforeEach, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@rallly/database", () => ({ prisma: { poll: { findFirst } } }));

import { getFinalizedPollCalendarData } from "./data";

beforeEach(() => vi.clearAllMocks());

it("returns only calendar fields for an active, finalized poll", async () => {
  findFirst.mockResolvedValue({
    id: "poll",
    title: "Games",
    description: "Bring snacks",
    location: "Park",
    timeZone: "America/Denver",
    finalizedOption: {
      id: "option",
      pollId: "poll",
      startTime: new Date("2026-10-21T00:00:00Z"),
      duration: 60,
    },
  });
  expect(await getFinalizedPollCalendarData("poll")).toEqual({
    uid: "poll-option@meet.rshwub.com",
    title: "Games",
    description: "Bring snacks",
    location: "Park",
    timeZone: "America/Denver",
    allDay: false,
    start: new Date("2026-10-21T00:00:00Z"),
    end: new Date("2026-10-21T01:00:00Z"),
  });
  expect(findFirst.mock.calls[0][0].where).toMatchObject({
    id: "poll",
    deleted: false,
    status: "scheduled",
    user: { banned: false, deletedAt: null },
  });
});

it("does not export reopened, unavailable, or incorrectly linked polls", async () => {
  findFirst.mockResolvedValueOnce(null);
  expect(await getFinalizedPollCalendarData("poll")).toBeNull();
  findFirst.mockResolvedValueOnce({ id: "poll", finalizedOption: null });
  expect(await getFinalizedPollCalendarData("poll")).toBeNull();
  findFirst.mockResolvedValueOnce({
    id: "poll",
    finalizedOption: { pollId: "another-poll" },
  });
  expect(await getFinalizedPollCalendarData("poll")).toBeNull();
});
