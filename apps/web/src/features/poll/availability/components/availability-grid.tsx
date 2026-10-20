"use client";

import { cn } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import { CheckIcon, HelpCircleIcon, MinusIcon } from "lucide-react";
import React from "react";
import { getAvailabilityGridLayout } from "@/features/poll/availability/components/availability-grid-layout";
import { formatAvailabilityTimeRange } from "@/features/poll/availability/components/availability-time-label";
import { Trans, useTranslation } from "@/i18n/client";
import {
  formatDate,
  formatDateParts,
  formatDateTime,
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
  weekly = false,
}: {
  slots: GridSlot[];
  values?: Record<string, GridVote>;
  brush?: GridVote;
  onChange?: (values: Record<string, GridVote>) => void;
  timeZone: string;
  locale: string;
  counts?: Record<string, { yes: number; maybe: number }>;
  participantCount?: number;
  weekly?: boolean;
}) {
  const { t } = useTranslation();
  const { columns, rows } = React.useMemo(
    () => getAvailabilityGridLayout(slots, timeZone),
    [slots, timeZone],
  );
  const [touchPaint, setTouchPaint] = React.useState(false);
  const [focusKey, setFocusKey] = React.useState(slots[0]?.start);
  const [selectedSlot, setSelectedSlot] = React.useState<GridSlot>();
  const activeFocusKey = slots.some((slot) => slot.start === focusKey)
    ? focusKey
    : slots[0]?.start;
  const activeSlot = slots.find((slot) => slot.start === selectedSlot?.start);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const paintedPointer = React.useRef(false);
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

  function focusCell(column: number, row: number, direction = 0) {
    if (!columns.length) return;
    const safeColumn = Math.max(0, Math.min(columns.length - 1, column));
    const daySlots = columns[safeColumn][1];
    let safeRow = Math.max(0, Math.min(daySlots.length - 1, row));
    if (direction) {
      while (safeRow >= 0 && safeRow < daySlots.length && !daySlots[safeRow]) {
        safeRow += direction;
      }
    } else {
      const availableRows = daySlots.flatMap((slot, index) =>
        slot ? [index] : [],
      );
      safeRow = availableRows.reduce((nearest, index) =>
        Math.abs(index - row) < Math.abs(nearest - row) ? index : nearest,
      );
    }
    if (!daySlots[safeRow]) return;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-column="${safeColumn}"][data-row="${safeRow}"]`,
      )
      ?.focus();
  }

  function endGesture(event: React.PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId === event.pointerId) {
      gesture.current = null;
    }
  }

  if (!slots.length) {
    return (
      <p className="rounded-xl border border-dashed p-5 text-muted-foreground text-sm">
        <Trans
          i18nKey="availabilityNoTimes"
          defaults="No time slots are available for these dates."
        />
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {onChange ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-muted-foreground text-sm">
            <Trans
              i18nKey="availabilityGridInstructions"
              defaults="Drag to mark times. On touch screens, scroll or tap a time; choose Paint to drag. Use arrow keys and Space, or the time range form below."
            />
          </p>
          <fieldset
            className="flex min-w-0 gap-1 rounded-lg bg-muted/50 p-1"
            aria-label={t("availabilityTouchMode", {
              defaultValue: "Touch interaction",
            })}
          >
            <Button
              className="min-h-11 sm:min-h-9"
              type="button"
              variant={!touchPaint ? "default" : "ghost"}
              aria-pressed={!touchPaint}
              onClick={() => setTouchPaint(false)}
            >
              <Trans i18nKey="availabilityScrollMode" defaults="Scroll" />
            </Button>
            <Button
              className="min-h-11 sm:min-h-9"
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
        className="max-h-[34rem] min-w-0 max-w-full scroll-pt-16 scroll-pl-22 overflow-auto overscroll-contain rounded-xl border bg-card"
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
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
      >
        <div
          className="grid w-max min-w-full [--availability-row-height:2rem] [@media(any-pointer:coarse)]:[--availability-row-height:2.75rem]"
          style={{
            gridTemplateColumns: `5.5rem repeat(${columns.length}, minmax(6.5rem, 1fr))`,
          }}
        >
          <div className="sticky top-0 z-30 col-span-full grid grid-cols-subgrid border-b bg-card">
            <div
              aria-hidden="true"
              className="sticky left-0 z-40 border-r bg-card"
            />
            {columns.map(([date]) => {
              const day = new Date(`${date}T12:00:00Z`);
              return (
                <div
                  key={date}
                  className="space-y-0.5 border-r px-2 py-2 text-center text-sm last:border-r-0"
                >
                  {weekly ? (
                    <div className="font-medium">
                      {formatDate(day, { locale, preset: "weekday" })}
                    </div>
                  ) : (
                    <>
                      <div className="text-muted-foreground text-xs">
                        {
                          formatDateParts(day, { locale, timeZone: "UTC" })
                            .weekday
                        }
                      </div>
                      <div className="font-medium">
                        {formatDate(day, { locale, preset: "monthDay" })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div
            aria-hidden="true"
            className="sticky left-0 z-20 border-r bg-card"
          >
            {rows.map(({ key, slot }, row) => (
              <div
                key={key}
                data-time-row={row}
                className="flex h-(--availability-row-height) items-center justify-end whitespace-nowrap border-b border-dashed px-3 text-muted-foreground text-xs tabular-nums last:border-b-0"
              >
                {formatDateTime(new Date(slot.start), {
                  locale,
                  timeZone,
                  preset: "time",
                })}
              </div>
            ))}
          </div>
          {columns.map(([date, daySlots], column) => (
            <div key={date} className="min-w-0 border-r last:border-r-0">
              {daySlots.map((slot, row) => {
                if (!slot) {
                  return (
                    <div
                      key={rows[row].key}
                      aria-hidden="true"
                      className="h-(--availability-row-height) border-b border-dashed bg-muted/20 last:border-b-0"
                    />
                  );
                }
                const vote = values?.[slot.start] ?? "no";
                const count = counts?.[slot.start];
                const VoteIcon =
                  vote === "yes"
                    ? CheckIcon
                    : vote === "maybe"
                      ? HelpCircleIcon
                      : MinusIcon;
                const localDate = formatDateTime(new Date(slot.start), {
                  locale,
                  timeZone,
                  preset: "monthDay",
                });
                const hasDateShift =
                  !weekly &&
                  localDate !==
                    formatDate(new Date(`${date}T12:00:00Z`), {
                      locale,
                      preset: "monthDay",
                    });
                const range = formatAvailabilityTimeRange({
                  start: slot.start,
                  end: slot.end,
                  locale,
                  timeZone,
                  weekly,
                });
                const description = onChange
                  ? `${range}: ${t(vote === "yes" ? "yes" : vote === "maybe" ? "ifNeedBe" : "no")}`
                  : `${range}: ${count?.yes ?? 0}/${participantCount} ${t("yes")}, ${count?.maybe ?? 0} ${t("ifNeedBe")}`;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    data-column={column}
                    data-row={row}
                    tabIndex={activeFocusKey === slot.start ? 0 : -1}
                    aria-label={description}
                    aria-pressed={onChange ? vote !== "no" : undefined}
                    title={description}
                    className={cn(
                      "flex h-(--availability-row-height) w-full select-none flex-col items-center justify-center gap-0.5 border-b border-dashed px-2 text-center text-xs tabular-nums outline-none transition-colors last:border-b-0 hover:brightness-95 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 dark:hover:brightness-125",
                      onChange ? voteStyles[vote] : "text-foreground",
                      "[--availability-heat:var(--color-green-500)] dark:[--availability-heat:var(--color-green-900)]",
                    )}
                    style={
                      !onChange && count && participantCount
                        ? {
                            backgroundColor: `color-mix(in srgb, var(--availability-heat) ${Math.round(((count.yes + count.maybe * 0.35) / participantCount) * 65)}%, var(--color-card))`,
                          }
                        : undefined
                    }
                    onFocus={() => {
                      setFocusKey(slot.start);
                      setSelectedSlot(slot);
                    }}
                    onPointerDown={(event) => {
                      setSelectedSlot(slot);
                      paintedPointer.current = false;
                      if (
                        !onChange ||
                        event.button !== 0 ||
                        (event.pointerType === "touch" && !touchPaint)
                      )
                        return;
                      event.preventDefault();
                      paintedPointer.current = true;
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
                      // Keyboard activation and taps also work in browsers that
                      // deliver click as MouseEvent rather than PointerEvent.
                      // A painted drag must not be applied again as a single cell.
                      if (
                        onChange &&
                        (event.detail === 0 || !paintedPointer.current)
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
                        focusCell(
                          column + offset[0],
                          row + offset[1],
                          offset[1],
                        );
                      }
                      if (event.key === "Home") {
                        event.preventDefault();
                        focusCell(column, 0, 1);
                      }
                      if (event.key === "End") {
                        event.preventDefault();
                        focusCell(column, daySlots.length - 1, -1);
                      }
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex items-center gap-2"
                    >
                      {onChange ? (
                        <VoteIcon className="size-3.5" />
                      ) : (
                        <>
                          {count?.yes ? (
                            <span className="block font-medium">
                              {count.yes}/{participantCount}
                            </span>
                          ) : null}
                          {count?.maybe ? (
                            <span className="flex items-center gap-0.5">
                              <HelpCircleIcon className="size-3" />
                              {count.maybe}
                            </span>
                          ) : null}
                        </>
                      )}
                    </span>
                    {hasDateShift ? (
                      <span className="text-[0.625rem] leading-3">
                        {localDate}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="min-h-10 text-muted-foreground text-xs" aria-live="polite">
        {activeSlot
          ? formatAvailabilityTimeRange({
              start: activeSlot.start,
              end: activeSlot.end,
              locale,
              timeZone,
              weekly,
            })
          : timeZone}
        {activeSlot && !onChange ? (
          <span className="mt-1 block">
            <Trans
              i18nKey="availabilityWindowCounts"
              defaults="{yes} yes · {maybe} maybe · {no} unavailable"
              values={{
                yes: counts?.[activeSlot.start]?.yes ?? 0,
                maybe: counts?.[activeSlot.start]?.maybe ?? 0,
                no:
                  participantCount -
                  (counts?.[activeSlot.start]?.yes ?? 0) -
                  (counts?.[activeSlot.start]?.maybe ?? 0),
              }}
            />
          </span>
        ) : null}
      </p>
    </div>
  );
}
