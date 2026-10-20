"use client";

import { cn } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HelpCircleIcon,
  MinusIcon,
} from "lucide-react";
import React from "react";
import { getAvailabilityGridLayout } from "@/features/poll/availability/components/availability-grid-layout";
import { formatAvailabilityTimeRange } from "@/features/poll/availability/components/availability-time-label";
import { Trans, useTranslation } from "@/i18n/client";
import {
  formatDate,
  formatDateParts,
  formatDateTime,
} from "@/lib/datetime/format";
import { resolveTimeZone } from "@/lib/datetime/time-zone-overrides";
import { createWallClockReader } from "@/lib/datetime/utils";

export type GridSlot = { start: string; end: string; date: string };
export type GridVote = "yes" | "maybe" | "no";

const voteStyles = {
  yes: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  maybe: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  no: "bg-muted/30 text-muted-foreground",
};

const dayEditorQuery = "(max-width: 639px), (pointer: coarse)";

function subscribeToDayEditor(callback: () => void) {
  const query = window.matchMedia(dayEditorQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function prefersDayEditor() {
  return window.matchMedia(dayEditorQuery).matches;
}

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
  const dayEditorAvailable = React.useSyncExternalStore(
    subscribeToDayEditor,
    prefersDayEditor,
    () => false,
  );
  const [editingDate, setEditingDate] = React.useState<string | null>(null);
  const [focusKey, setFocusKey] = React.useState(slots[0]?.start);
  const [selectedSlot, setSelectedSlot] = React.useState<GridSlot>();
  const editingColumn = onChange
    ? columns.findIndex(([date]) => date === editingDate)
    : -1;
  const editingDay = editingColumn >= 0;
  const visibleColumns = columns.flatMap((column, index) =>
    !editingDay || index === editingColumn ? [{ column, index }] : [],
  );
  const visibleSlots = visibleColumns.flatMap(({ column: [, daySlots] }) =>
    daySlots.filter((slot): slot is GridSlot => slot !== undefined),
  );
  const activeFocusKey = visibleSlots.some((slot) => slot.start === focusKey)
    ? focusKey
    : visibleSlots[0]?.start;
  const activeSlot = slots.find((slot) => slot.start === selectedSlot?.start);
  const hourRows = React.useMemo(() => {
    const readers = new Map<string, ReturnType<typeof createWallClockReader>>();
    return rows.map(({ slot }) => {
      const date = new Date(slot.start);
      const zone = resolveTimeZone(timeZone, date);
      let read = readers.get(zone);
      if (!read) {
        read = createWallClockReader(zone);
        readers.set(zone, read);
      }
      return read(date.getTime()).minute % 60 === 0;
    });
  }, [rows, timeZone]);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const paintedPointer = React.useRef(false);
  const cancelledPointer = React.useRef(false);
  const overviewTouch = React.useRef(false);
  const touchStart = React.useRef<{
    x: number;
    y: number;
    pointerId: number;
    painting: boolean;
  } | null>(null);
  const pendingFocus = React.useRef<{ column: number; row: number } | null>(
    null,
  );
  const gesture = React.useRef<{
    column: number;
    row: number;
    lastColumn: number;
    lastRow: number;
    initial: Record<string, GridVote>;
    pointerId: number;
  } | null>(null);

  React.useEffect(() => {
    // Changing views must not carry a drag or touch-paint mode into another day.
    gesture.current = null;
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    if (editingDate !== null && columns[pending.column]?.[0] !== editingDate)
      return;
    const viewport = gridRef.current;
    const cell = viewport?.querySelector<HTMLButtonElement>(
      `[data-column="${pending.column}"][data-row="${pending.row}"]`,
    );
    if (!viewport || !cell) return;
    cell.focus({ preventScroll: true });
    viewport.scrollTop = 0;
    const offset =
      cell.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    if (offset > viewport.clientHeight - cell.clientHeight) {
      viewport.scrollTop = offset - viewport.clientHeight / 2;
    }
  }, [editingDate, columns]);

  function openDay(column: number, row = 0) {
    const [date, daySlots] = columns[column];
    const selectedRow = daySlots[row]
      ? row
      : daySlots.findIndex((slot) => slot !== undefined);
    setTouchPaint(false);
    overviewTouch.current = false;
    setEditingDate(date);
    setSelectedSlot(daySlots[selectedRow]);
    pendingFocus.current = { column, row: selectedRow };
  }

  function closeDay() {
    pendingFocus.current = {
      column: editingColumn,
      row: columns[editingColumn][1].findIndex(
        (slot) => slot?.start === activeFocusKey,
      ),
    };
    setTouchPaint(false);
    overviewTouch.current = false;
    setEditingDate(null);
  }

  function paint(column: number, row: number) {
    const start = gesture.current;
    if (!start || !onChange) return;
    start.lastColumn = column;
    start.lastRow = row;
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
    const safeColumn = editingDay
      ? editingColumn
      : Math.max(0, Math.min(columns.length - 1, column));
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

  function trackTouchMovement(event: React.PointerEvent<HTMLDivElement>) {
    const start = touchStart.current;
    if (
      start?.pointerId === event.pointerId &&
      !start.painting &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
    ) {
      // Some browsers send a click after a scroll, even without pointer moves.
      // Keep this flag set if the finger later moves back to its starting point.
      cancelledPointer.current = true;
      overviewTouch.current = false;
    }
  }

  function endGesture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.type === "pointerup") trackTouchMovement(event);
    if (event.type === "pointercancel") {
      cancelledPointer.current = true;
      overviewTouch.current = false;
    }
    if (gesture.current?.pointerId === event.pointerId) {
      // Fast or coalesced drags may reach their endpoint without a final move.
      // Only a completed gesture commits that endpoint; cancellation never does.
      if (event.type === "pointerup") {
        const target = document
          .elementFromPoint?.(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-column][data-row]");
        if (target && gridRef.current?.contains(target)) {
          const column = Number(target.dataset.column);
          const row = Number(target.dataset.row);
          if (
            column !== gesture.current.lastColumn ||
            row !== gesture.current.lastRow
          )
            paint(column, row);
        }
      }
      gesture.current = null;
    }
    if (touchStart.current?.pointerId === event.pointerId) {
      touchStart.current = null;
    }
  }

  function dayLabel(date: string) {
    return formatDate(new Date(`${date}T12:00:00Z`), {
      locale,
      preset: weekly ? "weekday" : "weekdayMonthDay",
    });
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
    <div
      className="min-w-0 space-y-2"
      data-grid-view={editingDay ? "day" : "overview"}
    >
      {editingDay ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 px-2"
            onClick={closeDay}
          >
            <ArrowLeftIcon className="size-4" />
            <Trans i18nKey="availabilityAllDays" defaults="All days" />
          </Button>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="size-11 p-0"
              disabled={editingColumn === 0}
              aria-label={t("availabilityPreviousDay", {
                defaultValue: "Previous day",
              })}
              onClick={() => openDay(editingColumn - 1)}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <h3 className="text-center font-medium text-sm">
              {dayLabel(columns[editingColumn][0])}
            </h3>
            <Button
              type="button"
              variant="ghost"
              className="size-11 p-0"
              disabled={editingColumn === columns.length - 1}
              aria-label={t("availabilityNextDay", {
                defaultValue: "Next day",
              })}
              onClick={() => openDay(editingColumn + 1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
      {onChange ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-lg text-muted-foreground text-xs">
            {editingDay ? (
              <Trans
                i18nKey="availabilityDayEditorInstructions"
                defaults="Tap a time to mark it. Choose Paint to drag across times."
              />
            ) : dayEditorAvailable ? (
              <Trans
                i18nKey="availabilityCompactMobileInstructions"
                defaults="Tap a day to select times in a larger view."
              />
            ) : (
              <Trans
                i18nKey="availabilityCompactGridInstructions"
                defaults="Drag to mark times. Use arrow keys and Space, or enter a time range below."
              />
            )}
          </p>
          {editingDay ? (
            <fieldset
              className="flex min-w-0 gap-1 rounded-lg bg-muted/50 p-1"
              aria-label={t("availabilityTouchMode", {
                defaultValue: "Touch interaction",
              })}
            >
              <Button
                className="min-h-11"
                type="button"
                variant={!touchPaint ? "default" : "ghost"}
                aria-pressed={!touchPaint}
                onClick={() => setTouchPaint(false)}
              >
                <Trans i18nKey="availabilityScrollMode" defaults="Scroll" />
              </Button>
              <Button
                className="min-h-11"
                type="button"
                variant={touchPaint ? "default" : "ghost"}
                aria-pressed={touchPaint}
                onClick={() => setTouchPaint(true)}
              >
                <Trans i18nKey="availabilityPaintMode" defaults="Paint" />
              </Button>
            </fieldset>
          ) : null}
        </div>
      ) : null}
      <div
        ref={gridRef}
        className={cn(
          "min-w-0 max-w-full scroll-pt-12 scroll-pl-14 overflow-auto overscroll-x-contain rounded-lg border bg-card",
          editingDay && "max-h-[28rem]",
        )}
        style={{ touchAction: editingDay && touchPaint ? "none" : "auto" }}
        onPointerDownCapture={(event) => {
          paintedPointer.current = false;
          cancelledPointer.current = false;
          overviewTouch.current = event.pointerType === "touch";
          touchStart.current = overviewTouch.current
            ? {
                x: event.clientX,
                y: event.clientY,
                pointerId: event.pointerId,
                painting: false,
              }
            : null;
        }}
        onPointerMove={(event) => {
          trackTouchMovement(event);
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
          className={cn(
            "grid w-full",
            editingDay
              ? "[--availability-row-height:3rem]"
              : "[--availability-row-height:1.125rem]",
          )}
          style={{
            gridTemplateColumns: editingDay
              ? "5.5rem minmax(0, 1fr)"
              : `3.375rem repeat(${columns.length}, minmax(0, 1fr))`,
            minWidth:
              !editingDay && columns.length > 7
                ? `${54 + columns.length * 48}px`
                : undefined,
          }}
        >
          <div className="sticky top-0 z-30 col-span-full grid grid-cols-subgrid border-b bg-card">
            <div
              aria-hidden="true"
              className="sticky left-0 z-40 border-r bg-card"
            />
            {visibleColumns.map(({ column: [date], index }) => {
              const day = new Date(`${date}T12:00:00Z`);
              const parts = formatDateParts(day, { locale, timeZone: "UTC" });
              const label = editingDay ? (
                <span className="font-medium">
                  <Trans
                    i18nKey="availabilityDayTimes"
                    defaults="Your availability"
                  />
                </span>
              ) : (
                <>
                  <span className="font-medium">{parts.weekday}</span>
                  {!weekly ? (
                    <span className="text-[0.625rem] text-muted-foreground">
                      {parts.month} {parts.day}
                    </span>
                  ) : null}
                </>
              );
              return (
                <div
                  key={date}
                  className="min-w-0 border-r text-center text-xs last:border-r-0"
                >
                  {onChange && !editingDay && dayEditorAvailable ? (
                    <button
                      type="button"
                      className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-0.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                      aria-label={t("availabilityEditDay", {
                        defaultValue: "Edit {day}",
                        day: dayLabel(date),
                      })}
                      onClick={(event) => {
                        if (cancelledPointer.current && event.detail !== 0)
                          return;
                        openDay(index);
                      }}
                    >
                      {label}
                    </button>
                  ) : (
                    <div
                      className="flex min-h-9 flex-col items-center justify-center gap-0.5 px-0.5"
                      title={dayLabel(date)}
                    >
                      {label}
                    </div>
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
                className={cn(
                  "flex h-(--availability-row-height) items-center justify-end whitespace-nowrap border-t px-1 text-muted-foreground tabular-nums first:border-t-0",
                  hourRows[row] ? "border-border" : "border-border/40",
                  editingDay ? "px-3 text-xs" : "text-[0.625rem]",
                )}
              >
                {editingDay || hourRows[row] || row === 0
                  ? formatDateTime(new Date(slot.start), {
                      locale,
                      timeZone,
                      preset: "time",
                    })
                  : null}
              </div>
            ))}
          </div>
          {visibleColumns.map(({ column: [date, daySlots], index: column }) => (
            <div key={date} className="min-w-0 border-r last:border-r-0">
              {daySlots.map((slot, row) => {
                if (!slot) {
                  return (
                    <div
                      key={rows[row].key}
                      aria-hidden="true"
                      className={cn(
                        "h-(--availability-row-height) border-t bg-muted/20 first:border-t-0",
                        hourRows[row] ? "border-border" : "border-border/40",
                      )}
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
                const range = formatAvailabilityTimeRange({
                  start: slot.start,
                  end: slot.end,
                  locale,
                  timeZone,
                  weekly,
                });
                const localDate = !weekly
                  ? formatDateTime(new Date(slot.start), {
                      locale,
                      timeZone,
                      preset: "date",
                    })
                  : undefined;
                const previousSlot = daySlots[row - 1];
                const showDateShift =
                  !weekly &&
                  localDate !==
                    formatDate(new Date(`${date}T12:00:00Z`), {
                      locale,
                      preset: "date",
                    }) &&
                  (!previousSlot ||
                    localDate !==
                      formatDateTime(new Date(previousSlot.start), {
                        locale,
                        timeZone,
                        preset: "date",
                      }));
                const localParts = showDateShift
                  ? formatDateParts(new Date(slot.start), { locale, timeZone })
                  : undefined;
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
                      "flex h-(--availability-row-height) w-full select-none items-center justify-center gap-2 border-t px-0.5 text-center text-xs tabular-nums outline-none transition-colors first:border-t-0 hover:brightness-95 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 dark:hover:brightness-125",
                      hourRows[row] ? "border-border" : "border-border/40",
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
                    onPointerEnter={(event) => {
                      if (!onChange && event.pointerType !== "touch")
                        setSelectedSlot(slot);
                    }}
                    onPointerDown={(event) => {
                      setSelectedSlot(slot);
                      if (
                        !onChange ||
                        event.button !== 0 ||
                        (!editingDay &&
                          (dayEditorAvailable || overviewTouch.current)) ||
                        (event.pointerType === "touch" && !touchPaint)
                      )
                        return;
                      event.preventDefault();
                      paintedPointer.current = true;
                      if (touchStart.current)
                        touchStart.current.painting = true;
                      event.currentTarget.focus();
                      gridRef.current?.setPointerCapture(event.pointerId);
                      gesture.current = {
                        column,
                        row,
                        lastColumn: column,
                        lastRow: row,
                        initial: { ...values },
                        pointerId: event.pointerId,
                      };
                      paint(column, row);
                    }}
                    onClick={(event) => {
                      if (cancelledPointer.current && event.detail !== 0)
                        return;
                      setSelectedSlot(slot);
                      if (
                        onChange &&
                        !editingDay &&
                        (dayEditorAvailable || overviewTouch.current)
                      ) {
                        overviewTouch.current = false;
                        openDay(column, row);
                        return;
                      }
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
                      if (event.key === "Escape" && editingDay) {
                        event.preventDefault();
                        closeDay();
                      }
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex items-center gap-2"
                    >
                      {localParts ? (
                        <span
                          className={cn(
                            "whitespace-nowrap font-medium",
                            editingDay ? "text-xs" : "text-[0.625rem]",
                          )}
                        >
                          {localParts.month} {localParts.day}
                        </span>
                      ) : null}
                      {onChange && editingDay ? (
                        <>
                          <VoteIcon className="size-4" />
                          {t(
                            vote === "yes"
                              ? "yes"
                              : vote === "maybe"
                                ? "ifNeedBe"
                                : "no",
                          )}
                        </>
                      ) : !showDateShift &&
                        (onChange ? vote === "maybe" : count?.maybe) ? (
                        <HelpCircleIcon className="size-2.5" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          <div
            aria-hidden="true"
            className={cn(
              "sticky left-0 z-20 whitespace-nowrap border-t border-r bg-card px-1 py-1 text-right text-muted-foreground tabular-nums",
              editingDay ? "px-3 text-xs" : "text-[0.625rem]",
            )}
          >
            {formatDateTime(new Date(rows[rows.length - 1].slot.end), {
              locale,
              timeZone,
              preset: "time",
            })}
          </div>
          <div
            aria-hidden="true"
            className="col-span-full col-start-2 border-t"
          />
        </div>
      </div>
      <p className="min-h-8 text-muted-foreground text-xs" aria-live="polite">
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
        {activeSlot && onChange ? (
          <span className="ml-1">
            ·{" "}
            {t(
              values?.[activeSlot.start] === "yes"
                ? "yes"
                : values?.[activeSlot.start] === "maybe"
                  ? "ifNeedBe"
                  : "no",
            )}
          </span>
        ) : null}
      </p>
    </div>
  );
}
