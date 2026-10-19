"use client";

import { cn } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import React from "react";
import { Trans, useTranslation } from "@/i18n/client";
import {
  formatDate,
  formatDateTime,
  formatDateTimeRange,
} from "@/lib/datetime/format";

export type GridSlot = { start: string; end: string; date: string };
export type GridVote = "yes" | "maybe" | "no";

const voteStyles = {
  yes: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  maybe: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  no: "bg-muted/30 text-muted-foreground",
};

/** A pointer gesture paints a rectangle; keyboard and range controls share the same values. */
export function AvailabilityGrid({
  slots,
  values,
  brush = "yes",
  onChange,
  timeZone,
  locale,
  counts,
  participantCount = 0,
}: {
  slots: GridSlot[];
  values?: Record<string, GridVote>;
  brush?: GridVote;
  onChange?: (values: Record<string, GridVote>) => void;
  timeZone: string;
  locale: string;
  counts?: Record<string, { yes: number; maybe: number }>;
  participantCount?: number;
}) {
  const { t } = useTranslation();
  const columns = React.useMemo(() => {
    const byDate = new Map<string, GridSlot[]>();
    for (const slot of slots) {
      const column = byDate.get(slot.date) ?? [];
      column.push(slot);
      byDate.set(slot.date, column);
    }
    return [...byDate.entries()];
  }, [slots]);
  const [touchPaint, setTouchPaint] = React.useState(false);
  const [focusKey, setFocusKey] = React.useState(slots[0]?.start);
  const [selectedSlot, setSelectedSlot] = React.useState<GridSlot>();
  const gridRef = React.useRef<HTMLDivElement>(null);
  const gesture = React.useRef<{
    column: number;
    row: number;
    initial: Record<string, GridVote>;
    pointerId: number;
  } | null>(null);

  function paint(column: number, row: number) {
    const start = gesture.current;
    if (!start || !onChange) return;
    const next = { ...start.initial };
    for (
      let c = Math.min(column, start.column);
      c <= Math.max(column, start.column);
      c++
    ) {
      for (
        let r = Math.min(row, start.row);
        r <= Math.max(row, start.row);
        r++
      ) {
        const slot = columns[c]?.[1][r];
        if (slot) next[slot.start] = brush;
      }
    }
    onChange(next);
  }

  function focusCell(column: number, row: number) {
    const safeColumn = Math.max(0, Math.min(columns.length - 1, column));
    const safeRow = Math.max(
      0,
      Math.min(columns[safeColumn][1].length - 1, row),
    );
    gridRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-column="${safeColumn}"][data-row="${safeRow}"]`,
      )
      ?.focus();
  }

  return (
    <div className="space-y-3">
      {onChange ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-muted-foreground text-sm">
            <Trans
              i18nKey="availabilityGridInstructions"
              defaults="Drag across times to paint. Use arrow keys to move and Space to mark a time, or use the time range form below."
            />
          </p>
          <fieldset
            className="flex gap-1"
            aria-label={t("availabilityTouchMode", {
              defaultValue: "Touch interaction",
            })}
          >
            <Button
              size="sm"
              type="button"
              variant={!touchPaint ? "default" : "ghost"}
              aria-pressed={!touchPaint}
              onClick={() => setTouchPaint(false)}
            >
              <Trans i18nKey="availabilityScrollMode" defaults="Scroll" />
            </Button>
            <Button
              size="sm"
              type="button"
              variant={touchPaint ? "default" : "ghost"}
              aria-pressed={touchPaint}
              onClick={() => setTouchPaint(true)}
            >
              <Trans i18nKey="availabilityPaintMode" defaults="Paint" />
            </Button>
          </fieldset>
        </div>
      ) : null}
      <div
        ref={gridRef}
        className="max-h-[34rem] overflow-auto overscroll-contain rounded-xl border"
        style={{ touchAction: onChange && touchPaint ? "none" : "auto" }}
        onPointerMove={(event) => {
          if (!gesture.current || gesture.current.pointerId !== event.pointerId)
            return;
          const target = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>("[data-column][data-row]");
          if (target && gridRef.current?.contains(target)) {
            paint(Number(target.dataset.column), Number(target.dataset.row));
          }
        }}
        onPointerUp={() => {
          gesture.current = null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onLostPointerCapture={() => {
          gesture.current = null;
        }}
      >
        <div
          className="grid min-w-full"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(7.5rem, 1fr))`,
          }}
        >
          {columns.map(([date, daySlots], column) => (
            <div key={date} className="border-r last:border-r-0">
              <div className="sticky top-0 z-10 border-b bg-card px-2 py-3 text-center font-medium text-sm">
                {formatDate(new Date(`${date}T12:00:00Z`), {
                  locale,
                  preset: "weekdayMonthDay",
                })}
              </div>
              {daySlots.map((slot, row) => {
                const vote = values?.[slot.start] ?? "no";
                const count = counts?.[slot.start];
                const range = formatDateTimeRange(
                  new Date(slot.start),
                  new Date(slot.end),
                  {
                    locale,
                    timeZone,
                    preset: "datetime",
                  },
                );
                const description = onChange
                  ? `${range}: ${t(vote === "yes" ? "yes" : vote === "maybe" ? "ifNeedBe" : "no")}`
                  : `${range}: ${count?.yes ?? 0}/${participantCount} ${t("yes")}, ${count?.maybe ?? 0} ${t("ifNeedBe")}`;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    data-column={column}
                    data-row={row}
                    tabIndex={focusKey === slot.start ? 0 : -1}
                    aria-label={description}
                    aria-pressed={onChange ? vote !== "no" : undefined}
                    title={description}
                    className={cn(
                      "flex h-9 w-full select-none items-center justify-between gap-1 border-b border-dashed px-2 text-xs tabular-nums outline-none transition-colors last:border-b-0 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                      onChange ? voteStyles[vote] : "text-foreground",
                    )}
                    style={
                      !onChange && count && participantCount
                        ? {
                            backgroundColor: `color-mix(in srgb, var(--color-green-500) ${Math.round(((count.yes + count.maybe * 0.35) / participantCount) * 65)}%, var(--color-card))`,
                          }
                        : undefined
                    }
                    onFocus={() => {
                      setFocusKey(slot.start);
                      setSelectedSlot(slot);
                    }}
                    onPointerDown={(event) => {
                      setSelectedSlot(slot);
                      if (
                        !onChange ||
                        event.button !== 0 ||
                        (event.pointerType === "touch" && !touchPaint)
                      )
                        return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      gridRef.current?.setPointerCapture(event.pointerId);
                      gesture.current = {
                        column,
                        row,
                        initial: { ...values },
                        pointerId: event.pointerId,
                      };
                      paint(column, row);
                    }}
                    onClick={(event) => {
                      setSelectedSlot(slot);
                      // Native keyboard activation has detail 0. Touch in scroll
                      // mode remains a normal tap, without intercepting scrolling.
                      if (
                        onChange &&
                        (event.detail === 0 ||
                          (!touchPaint &&
                            event.nativeEvent instanceof PointerEvent &&
                            event.nativeEvent.pointerType === "touch"))
                      ) {
                        onChange({ ...values, [slot.start]: brush });
                      }
                    }}
                    onKeyDown={(event) => {
                      const offsets: Record<string, [number, number]> = {
                        ArrowUp: [0, -1],
                        ArrowDown: [0, 1],
                        ArrowLeft: [-1, 0],
                        ArrowRight: [1, 0],
                      };
                      const offset = offsets[event.key];
                      if (offset) {
                        event.preventDefault();
                        focusCell(column + offset[0], row + offset[1]);
                      }
                      if (event.key === "Home") {
                        event.preventDefault();
                        focusCell(column, 0);
                      }
                      if (event.key === "End") {
                        event.preventDefault();
                        focusCell(column, daySlots.length - 1);
                      }
                    }}
                  >
                    <span>
                      {formatDateTime(new Date(slot.start), {
                        locale,
                        timeZone,
                        preset: "time",
                      })}
                    </span>
                    <span aria-hidden="true">
                      {onChange
                        ? vote === "yes"
                          ? "✓"
                          : vote === "maybe"
                            ? "?"
                            : "—"
                        : `${count?.yes ?? 0}/${participantCount}`}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="min-h-5 text-muted-foreground text-xs" aria-live="polite">
        {selectedSlot
          ? formatDateTimeRange(
              new Date(selectedSlot.start),
              new Date(selectedSlot.end),
              {
                locale,
                timeZone,
                preset: "datetime",
                showTimeZone: true,
              },
            )
          : timeZone}
      </p>
    </div>
  );
}
