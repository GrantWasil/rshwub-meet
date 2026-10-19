import { describe, expect, it } from "vitest";
import { availabilityConfigSchema } from "./schema";
import type { AvailabilityConfig } from "./types";
import {
  canEditAvailabilityResponse,
  getAvailabilitySlots,
  normalizeAvailabilityIntervals,
} from "./utils";

const config: AvailabilityConfig = {
  dates: ["2026-10-20"],
  timeZone: "America/Denver",
  startMinute: 18 * 60,
  endMinute: 22 * 60,
  slotMinutes: 15,
  durationMinutes: 120,
};

describe("availability grid", () => {
  it("uses the event zone, independent of the server zone", () => {
    const slots = getAvailabilitySlots(config);
    expect(slots).toHaveLength(16);
    expect(slots[0]).toEqual({
      start: "2026-10-21T00:00:00.000Z",
      end: "2026-10-21T00:15:00.000Z",
      date: "2026-10-20",
      minute: 1080,
    });
  });

  it("omits nonexistent spring-forward times", () => {
    const slots = getAvailabilitySlots({
      ...config,
      dates: ["2026-03-08"],
      startMinute: 60,
      endMinute: 240,
    });
    expect(slots).toHaveLength(8);
    expect(slots.some((slot) => slot.minute >= 120 && slot.minute < 180)).toBe(
      false,
    );
    expect(slots.at(-1)?.end).toBe("2026-03-08T10:00:00.000Z");
  });

  it("keeps both occurrences of the fall-back hour", () => {
    const slots = getAvailabilitySlots({
      ...config,
      dates: ["2026-11-01"],
      startMinute: 60,
      endMinute: 180,
    });
    expect(slots).toHaveLength(12);
    expect(
      slots.filter((slot) => slot.minute === 60).map((slot) => slot.start),
    ).toEqual(["2026-11-01T07:00:00.000Z", "2026-11-01T08:00:00.000Z"]);
    expect(new Set(slots.map((slot) => slot.start)).size).toBe(slots.length);
  });

  it("aligns hourly slots in quarter-hour-offset zones", () => {
    const slots = getAvailabilitySlots({
      ...config,
      timeZone: "Asia/Kathmandu",
      slotMinutes: 60,
    });
    expect(slots).toHaveLength(4);
    expect(slots[0].start).toBe("2026-10-20T12:15:00.000Z");
  });

  it("merges adjacent choices without merging yes and if-need-be", () => {
    const slots = getAvailabilitySlots(config);
    expect(
      normalizeAvailabilityIntervals(config, [
        { ...slots[1], type: "yes" },
        { ...slots[0], type: "yes" },
        { ...slots[2], type: "ifNeedBe" },
      ]),
    ).toEqual([
      { start: slots[0].start, end: slots[1].end, type: "yes" },
      { start: slots[2].start, end: slots[2].end, type: "ifNeedBe" },
    ]);
  });

  it.each([
    ["2026-10-20T23:45:00.000Z", "2026-10-21T00:15:00.000Z"],
    ["2026-10-21T00:01:00.000Z", "2026-10-21T00:15:00.000Z"],
    ["2026-10-21T00:00:00.000Z", "2026-10-21T04:15:00.000Z"],
    ["2026-10-21T00:00:00.000Z", "2026-10-21T00:00:00.000Z"],
  ])("rejects out-of-grid or empty ranges", (start, end) => {
    expect(() =>
      normalizeAvailabilityIntervals(config, [{ start, end, type: "yes" }]),
    ).toThrow();
  });

  it("rejects overlap and overnight bridging across unoffered hours", () => {
    expect(() =>
      normalizeAvailabilityIntervals(config, [
        {
          start: "2026-10-21T00:00:00.000Z",
          end: "2026-10-21T01:00:00.000Z",
          type: "yes",
        },
        {
          start: "2026-10-21T00:30:00.000Z",
          end: "2026-10-21T01:30:00.000Z",
          type: "ifNeedBe",
        },
      ]),
    ).toThrow("overlap");
    expect(() =>
      normalizeAvailabilityIntervals(
        { ...config, dates: ["2026-10-20", "2026-10-21"] },
        [
          {
            start: "2026-10-21T03:00:00.000Z",
            end: "2026-10-22T01:00:00.000Z",
            type: "yes",
          },
        ],
      ),
    ).toThrow("time grid");
  });
});

describe("availability bounds and permissions", () => {
  it.each([
    { dates: ["2026-02-30"] },
    { dates: ["2026-10-20", "2026-10-20"] },
    { dates: ["2026-01-01", "2026-05-01"] },
    { timeZone: "Not/AZone" },
    { startMinute: 1320, endMinute: 1080 },
    { startMinute: 1081 },
    { durationMinutes: 17 },
    { durationMinutes: 300 },
    {
      dates: Array.from(
        { length: 32 },
        (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`,
      ),
    },
  ])("rejects malformed or excessive configuration", (overrides) => {
    expect(
      availabilityConfigSchema.safeParse({ ...config, ...overrides }).success,
    ).toBe(false);
  });

  it("grants edits only to owner, organizer, or matching response capability", () => {
    const base = {
      participantUserId: "owner",
      canManage: false,
      tokenMatches: false,
    };
    expect(canEditAvailabilityResponse(base)).toBe(false);
    expect(
      canEditAvailabilityResponse({ ...base, actorUserId: "stranger" }),
    ).toBe(false);
    expect(
      canEditAvailabilityResponse({ ...base, participantUserId: null }),
    ).toBe(false);
    expect(canEditAvailabilityResponse({ ...base, actorUserId: "owner" })).toBe(
      true,
    );
    expect(canEditAvailabilityResponse({ ...base, canManage: true })).toBe(
      true,
    );
    expect(canEditAvailabilityResponse({ ...base, tokenMatches: true })).toBe(
      true,
    );
  });
});
