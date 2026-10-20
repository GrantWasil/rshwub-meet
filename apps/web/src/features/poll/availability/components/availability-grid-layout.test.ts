import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/datetime/format";
import { createWallClockReader } from "@/lib/datetime/utils";
import type { AvailabilityConfig } from "../types";
import { getAvailabilitySlots } from "../utils";
import type { GridSlot } from "./availability-grid";
import { getAvailabilityGridLayout } from "./availability-grid-layout";

const config: AvailabilityConfig = {
  dates: [],
  timeZone: "America/Denver",
  startMinute: 60,
  endMinute: 240,
  slotMinutes: 30,
  durationMinutes: 60,
};

function minute(slot: GridSlot | undefined, timeZone = "America/Denver") {
  return slot
    ? createWallClockReader(timeZone)(Date.parse(slot.start)).minute
    : undefined;
}

function expectPreserved(
  layout: ReturnType<typeof getAvailabilityGridLayout>,
  slots: GridSlot[],
) {
  for (const [date, column] of layout.columns) {
    expect(column).toHaveLength(layout.rows.length);
    expect(column.filter(Boolean)).toEqual(
      slots
        .filter((slot) => slot.date === date)
        .sort((a, b) => a.start.localeCompare(b.start)),
    );
  }
  expect(new Set(layout.rows.map((row) => row.key)).size).toBe(
    layout.rows.length,
  );
}

describe("availability grid layout", () => {
  it("leaves spring-forward gaps without shifting later clocks", () => {
    const slots = getAvailabilitySlots({
      ...config,
      dates: ["2026-03-07", "2026-03-08"],
    });
    const layout = getAvailabilityGridLayout(slots, config.timeZone);

    expect(layout.rows.map(({ slot }) => minute(slot))).toEqual([
      60, 90, 120, 150, 180, 210,
    ]);
    expect(layout.columns[1][1].map((slot) => minute(slot))).toEqual([
      60,
      90,
      undefined,
      undefined,
      180,
      210,
    ]);
    expectPreserved(layout, slots);
  });

  it("keeps both fall-back hours in their real chronological order", () => {
    const slots = getAvailabilitySlots({
      ...config,
      dates: ["2026-10-31", "2026-11-01"],
      endMinute: 180,
    });
    const layout = getAvailabilityGridLayout(slots, config.timeZone);

    expect(layout.rows.map(({ slot }) => minute(slot))).toEqual([
      60, 90, 60, 90, 120, 150,
    ]);
    expect(layout.columns[0][1].map((slot) => minute(slot))).toEqual([
      60,
      90,
      undefined,
      undefined,
      120,
      150,
    ]);
    expect(layout.columns[1][1][0]?.start).toBe("2026-11-01T07:00:00.000Z");
    expect(layout.columns[1][1][2]?.start).toBe("2026-11-01T08:00:00.000Z");
    expectPreserved(layout, slots);
  });

  it("aligns viewer clocks when dates have different event-zone offsets", () => {
    const slots = getAvailabilitySlots({
      ...config,
      dates: ["2026-10-31", "2026-11-01"],
      startMinute: 17 * 60,
      endMinute: 19 * 60,
    });
    const layout = getAvailabilityGridLayout(slots, "America/Phoenix");

    expect(
      layout.rows.map(({ slot }) => minute(slot, "America/Phoenix")),
    ).toEqual([960, 990, 1020, 1050, 1080, 1110]);
    expect(
      layout.columns[0][1].map((slot) => minute(slot, "America/Phoenix")),
    ).toEqual([960, 990, 1020, 1050, undefined, undefined]);
    expect(
      layout.columns[1][1].map((slot) => minute(slot, "America/Phoenix")),
    ).toEqual([undefined, undefined, 1020, 1050, 1080, 1110]);
    expectPreserved(layout, slots);
  });

  it("keeps clocks after local midnight below the previous evening", () => {
    const slots = getAvailabilitySlots({
      ...config,
      dates: ["2026-10-20", "2026-10-21"],
      timeZone: "UTC",
      startMinute: 12 * 60,
      endMinute: 14 * 60,
    });
    const layout = getAvailabilityGridLayout(slots, "Australia/Sydney");

    expect(
      layout.rows.map(({ slot }) => minute(slot, "Australia/Sydney")),
    ).toEqual([1380, 1410, 0, 30]);
    expect(layout.rows.map(({ key }) => key)).toEqual([
      "1380:0",
      "1410:0",
      "1440:0",
      "1470:0",
    ]);
    expectPreserved(layout, slots);
  });

  it("aligns displayed clocks across Vancouver's timezone override cutoff", () => {
    const slots = getAvailabilitySlots({
      ...config,
      dates: ["2026-10-31", "2026-11-01"],
      timeZone: "UTC",
      startMinute: 8 * 60,
      endMinute: 10 * 60,
    });
    const layout = getAvailabilityGridLayout(slots, "America/Vancouver");
    const displayedTime = (slot: GridSlot) =>
      formatDateTime(new Date(slot.start), {
        locale: "en-US",
        timeZone: "America/Vancouver",
        preset: "time",
      });
    const labels = ["1:00 AM", "1:30 AM", "2:00 AM", "2:30 AM"];

    expect(layout.rows.map(({ slot }) => displayedTime(slot))).toEqual(labels);
    for (const [, column] of layout.columns) {
      expect(column.map((slot) => slot && displayedTime(slot))).toEqual(labels);
    }
    expectPreserved(layout, slots);
  });

  it("splits conflicting repeated-clock rows without losing or reordering slots", () => {
    const slots: GridSlot[] = [
      ["2026-10-31", "2026-10-31T07:00:00.000Z"],
      ["2026-10-31", "2026-10-31T07:30:00.000Z"],
      ["2026-11-01", "2026-11-01T07:30:00.000Z"],
      ["2026-11-01", "2026-11-01T08:00:00.000Z"],
      ["2026-11-01", "2026-11-01T08:30:00.000Z"],
    ].map(([date, start]) => ({
      date,
      start,
      end: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
    }));
    const layout = getAvailabilityGridLayout(slots, config.timeZone);

    expect(layout.rows.map(({ slot }) => minute(slot))).toEqual([
      60, 90, 60, 90,
    ]);
    expect(layout.columns[0][1].filter(Boolean)).toHaveLength(2);
    expect(layout.columns[1][1].filter(Boolean)).toHaveLength(3);
    expectPreserved(layout, slots);
    expect(
      getAvailabilityGridLayout([...slots].reverse(), config.timeZone),
    ).toEqual(layout);
  });

  it("returns an empty layout when there are no slots", () => {
    expect(getAvailabilityGridLayout([], "UTC")).toEqual({
      rows: [],
      columns: [],
    });
  });
});
