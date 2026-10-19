"use client";

import { Button } from "@rallly/ui/button";
import { Label } from "@rallly/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rallly/ui/select";
import React from "react";
import type {
  GridSlot,
  GridVote,
} from "@/features/poll/availability/components/availability-grid";
import { Trans } from "@/i18n/client";
import { formatDate, formatDateTime } from "@/lib/datetime/format";

export function AvailabilityRangeInput({
  slots,
  brush,
  onApply,
  timeZone,
  locale,
}: {
  slots: GridSlot[];
  brush: GridVote;
  onApply: (slots: GridSlot[]) => void;
  timeZone: string;
  locale: string;
}) {
  const dates = [...new Set(slots.map((slot) => slot.date))];
  const [date, setDate] = React.useState(dates[0]);
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(0);
  const daySlots = slots.filter((slot) => slot.date === date);
  const id = React.useId();
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-medium text-sm">
        <Trans
          i18nKey="availabilityRangeInput"
          defaults="Mark a time range without dragging"
        />
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`${id}-date`}>
            <Trans i18nKey="date" defaults="Date" />
          </Label>
          <Select
            value={date}
            onValueChange={(value) => {
              if (value) {
                setDate(value);
                setStart(0);
                setEnd(0);
              }
            }}
          >
            <SelectTrigger id={`${id}-date`} className="w-full">
              <SelectValue>
                {(value) =>
                  formatDate(new Date(`${value}T12:00:00Z`), {
                    locale,
                    preset: "monthDay",
                  })
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {dates.map((value) => (
                <SelectItem key={value} value={value}>
                  {formatDate(new Date(`${value}T12:00:00Z`), {
                    locale,
                    preset: "weekdayMonthDay",
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-start`}>
            <Trans i18nKey="availabilityDailyStart" defaults="From" />
          </Label>
          <Select
            value={String(start)}
            onValueChange={(value) => {
              if (value !== null) {
                setStart(Number(value));
                setEnd(Math.max(end, Number(value)));
              }
            }}
          >
            <SelectTrigger id={`${id}-start`} className="w-full">
              <SelectValue>
                {(value) =>
                  daySlots[Number(value)]
                    ? formatDateTime(new Date(daySlots[Number(value)].start), {
                        locale,
                        timeZone,
                        preset: "time",
                        showTimeZone: true,
                      })
                    : ""
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {daySlots.map((slot, index) => (
                <SelectItem key={slot.start} value={String(index)}>
                  {formatDateTime(new Date(slot.start), {
                    locale,
                    timeZone,
                    preset: "time",
                    showTimeZone: true,
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-end`}>
            <Trans i18nKey="availabilityDailyEnd" defaults="Until" />
          </Label>
          <Select
            value={String(end)}
            onValueChange={(value) => {
              if (value !== null) setEnd(Number(value));
            }}
          >
            <SelectTrigger id={`${id}-end`} className="w-full">
              <SelectValue>
                {(value) =>
                  daySlots[Number(value)]
                    ? formatDateTime(new Date(daySlots[Number(value)].end), {
                        locale,
                        timeZone,
                        preset: "time",
                        showTimeZone: true,
                      })
                    : ""
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {daySlots.map((slot, index) =>
                index >= start ? (
                  <SelectItem key={slot.end} value={String(index)}>
                    {formatDateTime(new Date(slot.end), {
                      locale,
                      timeZone,
                      preset: "time",
                      showTimeZone: true,
                    })}
                  </SelectItem>
                ) : null,
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          <Trans
            i18nKey="availabilityRangeBrush"
            defaults="Uses your selected answer: {answer}"
            values={{ answer: brush }}
          />
        </p>
        <Button
          type="button"
          onClick={() => onApply(daySlots.slice(start, end + 1))}
        >
          <Trans i18nKey="availabilityApplyRange" defaults="Apply range" />
        </Button>
      </div>
    </details>
  );
}
