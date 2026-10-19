import { describe, expect, it } from "vitest";
import { findAvailabilityWindows, getAvailabilityResults } from "./utils";

const slots = [0, 15, 30, 45].map((minute) => ({
  start: `2026-10-20T18:${String(minute).padStart(2, "0")}:00.000Z`,
  end: new Date(
    Date.parse("2026-10-20T18:00:00Z") + (minute + 15) * 60_000,
  ).toISOString(),
  date: "2026-10-20",
  minute: 18 * 60 + minute,
}));

describe("continuous availability results", () => {
  it("does not combine different people's partial availability into a shared window", () => {
    const result = findAvailabilityWindows(
      slots,
      [
        {
          id: "a",
          name: "Alex",
          intervals: [
            { start: slots[0].start, end: slots[1].end, type: "yes" },
          ],
        },
        {
          id: "b",
          name: "Blair",
          intervals: [
            { start: slots[2].start, end: slots[3].end, type: "yes" },
          ],
        },
      ],
      60,
    );
    expect(result).toHaveLength(1);
    expect(result[0].yes).toEqual([]);
  });
  it("classifies a continuous mixed yes/maybe response as maybe", () => {
    const result = findAvailabilityWindows(
      slots,
      [
        {
          id: "a",
          name: "Alex",
          intervals: [
            { start: slots[0].start, end: slots[1].end, type: "yes" },
            { start: slots[2].start, end: slots[3].end, type: "ifNeedBe" },
          ],
        },
      ],
      60,
    );
    expect(result[0].yes).toEqual([]);
    expect(result[0].maybe).toEqual(["Alex"]);
  });
  it("does not bridge a missing slot or a different event date", () => {
    expect(
      findAvailabilityWindows([slots[0], slots[2], slots[3]], [], 60),
    ).toEqual([]);
    expect(
      findAvailabilityWindows(
        slots.map((slot, index) => ({
          ...slot,
          date: index > 1 ? "2026-10-21" : slot.date,
        })),
        [],
        60,
      ),
    ).toEqual([]);
  });
  it("keeps heatmap totals and later windows consistent across unavailable and tentative slots", () => {
    const result = getAvailabilityResults(
      slots,
      [
        {
          id: "a",
          name: "Alex",
          intervals: [
            { start: slots[0].start, end: slots[0].end, type: "yes" },
            { start: slots[2].start, end: slots[3].end, type: "ifNeedBe" },
          ],
        },
        {
          id: "b",
          name: "Blair",
          intervals: [
            { start: slots[0].start, end: slots[3].end, type: "yes" },
          ],
        },
      ],
      30,
    );
    expect(result.counts).toEqual({
      [slots[0].start]: { yes: 2, maybe: 0 },
      [slots[1].start]: { yes: 1, maybe: 0 },
      [slots[2].start]: { yes: 1, maybe: 1 },
      [slots[3].start]: { yes: 1, maybe: 1 },
    });
    expect(result.windows[0]).toMatchObject({
      start: slots[2].start,
      yes: ["Blair"],
      maybe: ["Alex"],
    });
    expect(
      result.windows.slice(1).every((window) => window.maybe.length === 0),
    ).toBe(true);
  });
});
