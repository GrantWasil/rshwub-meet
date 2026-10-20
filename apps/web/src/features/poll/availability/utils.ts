import { createWallClockReader } from "@/lib/datetime/utils";
import type {
  AvailabilityConfig,
  AvailabilityInterval,
  AvailabilitySlot,
} from "./types";

const MINUTE = 60_000;

// Stable internal coordinates for a typical Monday–Sunday week. These are not
// event dates: changing this anchor would invalidate persisted weekly responses.
const WEEKLY_DATES = [
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
  "2026-01-08",
  "2026-01-09",
  "2026-01-10",
  "2026-01-11",
] as const;

export function isWeeklyAvailability(config: Pick<AvailabilityConfig, "mode">) {
  return config.mode === "weekly";
}

/** Enumerate real instants so DST gaps vanish and repeated hours stay distinct. */
export function getAvailabilitySlots(
  config: AvailabilityConfig,
): AvailabilitySlot[] {
  const local = createWallClockReader(config.timeZone);
  const slots: AvailabilitySlot[] = [];
  const dates = isWeeklyAvailability(config) ? WEEKLY_DATES : config.dates;
  for (const date of [...dates].sort()) {
    const midnight = Date.parse(`${date}T00:00:00.000Z`);
    // Current civil offsets span UTC-12 through UTC+14. Scan at the
    // smallest supported granularity to also cover half/quarter-hour zones.
    for (
      let start = midnight - 14 * 60 * MINUTE;
      start < midnight + 36 * 60 * MINUTE;
      start += 15 * MINUTE
    ) {
      const wall = local(start);
      if (
        wall.date !== date ||
        wall.minute < config.startMinute ||
        wall.minute >= config.endMinute ||
        (wall.minute - config.startMinute) % config.slotMinutes !== 0
      )
        continue;
      const end = start + config.slotMinutes * MINUTE;
      const last = local(end - 1);
      if (
        last.date !== date ||
        last.minute < config.startMinute ||
        last.minute >= config.endMinute
      )
        continue;
      slots.push({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        date,
        minute: wall.minute,
      });
    }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start));
}

/** Reject forged ranges and overlap, then merge adjacent cells before storing. */
export function normalizeAvailabilityIntervals(
  config: AvailabilityConfig,
  intervals: AvailabilityInterval[],
): AvailabilityInterval[] {
  const slots = new Map(
    getAvailabilitySlots(config).map((slot) => [
      Date.parse(slot.start),
      Date.parse(slot.end),
    ]),
  );
  const sorted = intervals
    .map((interval) => ({
      type: interval.type,
      start: new Date(interval.start).toISOString(),
      end: new Date(interval.end).toISOString(),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const result: AvailabilityInterval[] = [];
  for (const interval of sorted) {
    let cursor = Date.parse(interval.start);
    const end = Date.parse(interval.end);
    if (cursor >= end)
      throw new Error("Availability ranges must have a positive duration");
    while (cursor < end) {
      const next = slots.get(cursor);
      if (next === undefined || next > end)
        throw new Error("Availability must stay within the poll's time grid");
      cursor = next;
    }
    const previous = result.at(-1);
    if (previous && interval.start < previous.end)
      throw new Error("Availability ranges must not overlap");
    if (previous?.end === interval.start && previous.type === interval.type)
      previous.end = interval.end;
    else result.push(interval);
  }
  return result;
}

export function canEditAvailabilityResponse({
  actorUserId,
  participantUserId,
  canManage,
  tokenMatches,
}: {
  actorUserId?: string;
  participantUserId: string | null;
  canManage: boolean;
  tokenMatches: boolean;
}) {
  return (
    canManage ||
    tokenMatches ||
    (!!actorUserId && actorUserId === participantUserId)
  );
}
