import { resolveTimeZone } from "@/lib/datetime/time-zone-overrides";
import { createWallClockReader } from "@/lib/datetime/utils";
import type { GridSlot } from "./availability-grid";

type Row = {
  key: string;
  slot: GridSlot;
  minute: number;
  occurrence: number;
  next: Set<Row>;
  incoming: number;
};

/** Align displayed clocks without collapsing DST gaps or repeated instants. */
export function getAvailabilityGridLayout(slots: GridSlot[], timeZone: string) {
  const readers = new Map<string, ReturnType<typeof createWallClockReader>>();
  const byDate = new Map<string, GridSlot[]>();
  for (const slot of slots) {
    const day = byDate.get(slot.date) ?? [];
    day.push(slot);
    byDate.set(slot.date, day);
  }
  const nodes = new Map<string, Row>();
  const sourceColumns = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySlots]) => {
      const occurrences = new Map<number, number>();
      const keyed = daySlots
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((slot) => {
          const start = new Date(slot.start);
          const resolvedZone = resolveTimeZone(timeZone, start);
          let local = readers.get(resolvedZone);
          if (!local) {
            local = createWallClockReader(resolvedZone);
            readers.set(resolvedZone, local);
          }
          const wall = local(start.getTime());
          const dayOffset =
            (Date.parse(wall.date) - Date.parse(date)) / 86_400_000;
          const minute = dayOffset * 1440 + wall.minute;
          const occurrence = occurrences.get(minute) ?? 0;
          occurrences.set(minute, occurrence + 1);
          const key = `${minute}:${occurrence}`;
          let row = nodes.get(key);
          if (!row) {
            row = {
              key,
              slot,
              minute,
              occurrence,
              next: new Set(),
              incoming: 0,
            };
            nodes.set(key, row);
          }
          return { row, slot };
        });
      for (let i = 1; i < keyed.length; i++) {
        const before = keyed[i - 1].row;
        const after = keyed[i].row;
        if (!before.next.has(after)) {
          before.next.add(after);
          after.incoming++;
        }
      }
      return {
        date,
        keyed,
        byKey: new Map(keyed.map(({ row, slot }) => [row.key, slot])),
      };
    });

  const rows: Array<{ key: string; slot: GridSlot }> = [];
  const columns: Array<[string, Array<GridSlot | undefined>]> =
    sourceColumns.map(({ date }) => [date, []]);
  const compare = (a: Row, b: Row) =>
    a.minute - b.minute || a.occurrence - b.occurrence;
  const usedKeys = new Map<string, number>();
  function append(row: Row, cells: Array<GridSlot | undefined>) {
    const { key } = row;
    const occurrence = usedKeys.get(key) ?? 0;
    usedKeys.set(key, occurrence + 1);
    rows.push({
      key: occurrence ? `${key}:split-${occurrence}` : key,
      slot: cells.find((slot) => slot !== undefined) ?? row.slot,
    });
    columns.forEach(([, column], index) => {
      column.push(cells[index]);
    });
  }

  const ready = [...nodes.values()].filter((node) => node.incoming === 0);
  const emitted = new Set<string>();
  while (ready.length) {
    ready.sort(compare);
    const row = ready[0];
    ready.shift();
    append(
      row,
      sourceColumns.map(({ byKey }) => byKey.get(row.key)),
    );
    emitted.add(row.key);
    for (const next of row.next) {
      if (--next.incoming === 0) ready.push(next);
    }
  }

  // A window beginning inside a repeated hour can give visible occurrences
  // conflicting identities across days. Split only those remaining rows,
  // consuming column heads so no slot is lost or moved before its predecessor.
  const pending = sourceColumns.map(({ keyed }) =>
    keyed.filter(({ row }) => !emitted.has(row.key)),
  );
  while (pending.some((column) => column.length)) {
    const candidates = pending
      .flatMap((column) => (column[0] ? [column[0].row] : []))
      .sort(compare);
    const row = candidates[0];
    append(
      row,
      pending.map((column) =>
        column[0]?.row === row ? column.shift()?.slot : undefined,
      ),
    );
  }
  return { rows, columns };
}
