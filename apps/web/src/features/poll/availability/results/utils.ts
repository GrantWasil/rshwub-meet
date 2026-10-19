import type {
  AvailabilityInterval,
  AvailabilityParticipant,
  AvailabilitySlot,
} from "@/features/poll/availability/types";

export function voteForSlot(
  intervals: AvailabilityInterval[],
  slot: { start: string; end: string },
) {
  return intervals.find(
    (interval) => interval.start <= slot.start && interval.end >= slot.end,
  )?.type;
}

/** Compute heatmap totals and whole-person windows in one pass over responses. */
export function getAvailabilityResults(
  slots: AvailabilitySlot[],
  participants: AvailabilityParticipant[],
  durationMinutes: number,
) {
  const ordered = [...slots].sort((a, b) => a.start.localeCompare(b.start));
  const counts = Object.fromEntries(
    ordered.map((slot) => [slot.start, { yes: 0, maybe: 0 }]),
  );
  // Prefix counts make a whole-window test constant time for each person,
  // even with many dates and alternating fifteen-minute responses.
  const responses = participants.map((participant) => {
    const intervals = [...participant.intervals].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    const yes = new Uint16Array(ordered.length + 1);
    const maybe = new Uint16Array(ordered.length + 1);
    let intervalIndex = 0;
    for (const [index, slot] of ordered.entries()) {
      while (
        intervalIndex < intervals.length &&
        intervals[intervalIndex].end <= slot.start
      )
        intervalIndex++;
      const interval = intervals[intervalIndex];
      const vote =
        interval && interval.start <= slot.start && interval.end >= slot.end
          ? interval.type
          : undefined;
      yes[index + 1] = yes[index] + Number(vote === "yes");
      maybe[index + 1] = maybe[index] + Number(vote === "ifNeedBe");
      if (vote === "yes") counts[slot.start].yes++;
      if (vote === "ifNeedBe") counts[slot.start].maybe++;
    }
    return { name: participant.name, yes, maybe };
  });
  const byEnd = new Map(ordered.map((slot, index) => [slot.end, index]));
  const segments: number[] = [];
  for (const [index, slot] of ordered.entries()) {
    const previous = ordered[index - 1];
    segments[index] =
      index === 0
        ? 0
        : segments[index - 1] +
          Number(previous.end !== slot.start || previous.date !== slot.date);
  }
  const windows = [];
  for (const [startIndex, slot] of ordered.entries()) {
    const end = new Date(
      Date.parse(slot.start) + durationMinutes * 60_000,
    ).toISOString();
    const endIndex = byEnd.get(end);
    if (
      endIndex === undefined ||
      endIndex < startIndex ||
      segments[startIndex] !== segments[endIndex]
    )
      continue;
    const length = endIndex - startIndex + 1;
    const yes: string[] = [];
    const maybe: string[] = [];
    for (const participant of responses) {
      const yesCount =
        participant.yes[endIndex + 1] - participant.yes[startIndex];
      const maybeCount =
        participant.maybe[endIndex + 1] - participant.maybe[startIndex];
      if (yesCount === length) yes.push(participant.name);
      else if (yesCount + maybeCount === length) maybe.push(participant.name);
    }
    windows.push({ start: slot.start, end, yes, maybe });
  }
  windows.sort(
    (a, b) =>
      b.yes.length - a.yes.length ||
      b.maybe.length - a.maybe.length ||
      a.start.localeCompare(b.start),
  );
  return { counts, windows };
}

/** The same person must cover every cell; per-cell totals alone lose this fact. */
export function findAvailabilityWindows(
  slots: AvailabilitySlot[],
  participants: AvailabilityParticipant[],
  durationMinutes: number,
) {
  return getAvailabilityResults(slots, participants, durationMinutes).windows;
}
