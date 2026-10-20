"use client";

import { buttonVariants, passwordManagerIgnoreProps } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import { Calendar } from "@rallly/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@rallly/ui/card";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import { Textarea } from "@rallly/ui/textarea";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { TimeZoneSelect } from "@/components/time-zone-picker/time-zone-select";
import { createAvailabilityPollAction } from "@/features/poll/availability/actions";
import { SchedulingModeSwitch } from "@/features/poll/availability/components/scheduling-mode-switch";
import { createAvailabilityPollSchema } from "@/features/poll/availability/schema";
import type { AvailabilityConfig } from "@/features/poll/availability/types";
import { useUser } from "@/features/user/client";
import { UserDropdown } from "@/features/user/components/user-dropdown";
import { Trans, useTranslation } from "@/i18n/client";
import { getBrowserTimeZone } from "@/lib/utils/date-time-utils";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function clockValue(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function CreateAvailabilityPoll() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, createGuestIfNeeded } = useUser();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string>();
  const form = useForm<{
    title: string;
    description: string;
    location: string;
    config: AvailabilityConfig;
  }>({
    defaultValues: {
      title: "",
      description: "",
      location: "",
      config: {
        mode: "weekly",
        dates: [],
        timeZone: "America/Denver",
        startMinute: 17 * 60,
        endMinute: 23 * 60,
        slotMinutes: 30,
        durationMinutes: 120,
      },
    },
  });
  React.useEffect(() => {
    form.setValue("config.timeZone", user?.timeZone || getBrowserTimeZone());
  }, [form, user?.timeZone]);
  const dates = form.watch("config.dates");
  const weekly = form.watch("config.mode") === "weekly";

  return (
    <div className="absolute inset-0 overflow-auto bg-gray-100 dark:bg-gray-900">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-gray-100/90 p-3 backdrop-blur-md dark:bg-gray-900/90">
        <Link href="/new" className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeftIcon className="size-4" />
          <Trans i18nKey="newPoll" defaults="New poll" />
        </Link>
        <UserDropdown />
      </header>
      <main id="main-content" className="mx-auto max-w-4xl px-3 pt-4 pb-12">
        <SchedulingModeSwitch mode="availability" />
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => {
            setError(undefined);
            const validated = createAvailabilityPollSchema.safeParse({
              ...values,
              config: {
                ...values.config,
                dates: weekly ? [] : values.config.dates,
              },
            });
            if (!validated.success) {
              setError(validated.error.issues[0].message);
              return;
            }
            startTransition(async () => {
              try {
                await createGuestIfNeeded();
                const result = await createAvailabilityPollAction(
                  validated.data,
                );
                if (!result?.data) {
                  setError(
                    t("availabilityCreateFailed", {
                      defaultValue:
                        "Could not create this poll. Check the dates and times, then try again.",
                    }),
                  );
                  return;
                }
                router.push(`/availability/${result.data.pollId}`);
              } catch {
                setError(
                  t("availabilityNetworkError", {
                    defaultValue:
                      "The connection was interrupted. Your changes are still here; please try again.",
                  }),
                );
              }
            });
          })}
        >
          <Card>
            <CardHeader>
              <CardTitle>
                <Trans
                  i18nKey="availabilityCreateTitle"
                  defaults="Find a time together"
                />
              </CardTitle>
              <CardDescription>
                <Trans
                  i18nKey="availabilityCreateDescription"
                  defaults="Share a typical week or choose specific dates. Everyone marks when they are free, and you find the best overlap."
                />
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="availability-title">
                  <Trans i18nKey="title" defaults="Title" />
                </Label>
                <Input
                  id="availability-title"
                  required
                  maxLength={200}
                  {...passwordManagerIgnoreProps}
                  {...form.register("title", {
                    required: true,
                    validate: (value) => value.trim().length > 0,
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availability-description">
                  <Trans i18nKey="description" defaults="Description" />
                </Label>
                <Textarea
                  id="availability-description"
                  maxLength={5000}
                  {...form.register("description")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availability-location">
                  <Trans i18nKey="location" defaults="Location" />
                </Label>
                <Input
                  id="availability-location"
                  maxLength={500}
                  {...passwordManagerIgnoreProps}
                  {...form.register("location")}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <Trans i18nKey="availabilitySchedule" defaults="When to meet" />
              </CardTitle>
              <CardDescription>
                <Trans
                  i18nKey="availabilityScheduleHelp"
                  defaults="Start with a typical week to find a regular meeting time. Choose specific dates for a one-time event."
                />
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">
                  <Trans
                    i18nKey="availabilityScheduleType"
                    defaults="Schedule type"
                  />
                </legend>
                {(["weekly", "dates"] as const).map((mode) => (
                  <label
                    key={mode}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      value={mode}
                      className="size-4 accent-primary"
                      {...form.register("config.mode")}
                    />
                    {mode === "weekly" ? (
                      <Trans
                        i18nKey="availabilityTypicalWeek"
                        defaults="Typical week"
                      />
                    ) : (
                      <Trans
                        i18nKey="availabilitySpecificDates"
                        defaults="Specific dates"
                      />
                    )}
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-6 md:grid-cols-2">
                {weekly ? (
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm">
                      <Trans
                        i18nKey="availabilityMondaySunday"
                        defaults="Monday–Sunday"
                      />
                    </h3>
                    <p className="max-w-sm text-muted-foreground text-sm">
                      <Trans
                        i18nKey="availabilityTypicalWeekHelp"
                        defaults="Everyone shares their usual availability across all seven days, using the event time zone. No calendar dates are needed."
                      />
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-muted-foreground text-sm">
                      <Trans
                        i18nKey="availabilityDateInstructions"
                        defaults="Select up to 31 specific dates. Tap a selected date again to remove it."
                      />
                    </p>
                    <Controller
                      name="config.dates"
                      control={form.control}
                      render={({ field }) => (
                        <Calendar
                          mode="multiple"
                          max={31}
                          selected={field.value.map(
                            (date) => new Date(`${date}T12:00:00`),
                          )}
                          onSelect={(selected) =>
                            field.onChange((selected ?? []).map(dateKey).sort())
                          }
                          className="mx-auto [--cell-size:--spacing(10)]"
                        />
                      )}
                    />
                  </div>
                )}
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="availability-zone">
                      <Trans
                        i18nKey="availabilityEventTimeZone"
                        defaults="Event time zone"
                      />
                    </Label>
                    <Controller
                      name="config.timeZone"
                      control={form.control}
                      render={({ field }) => (
                        <TimeZoneSelect
                          id="availability-zone"
                          value={field.value}
                          onValueChange={field.onChange}
                          className="min-w-0"
                        />
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(["startMinute", "endMinute"] as const).map((name) => (
                      <div key={name} className="space-y-2">
                        <Label htmlFor={`availability-${name}`}>
                          {name === "startMinute" ? (
                            <Trans
                              i18nKey="availabilityDailyStart"
                              defaults="From"
                            />
                          ) : (
                            <Trans
                              i18nKey="availabilityDailyEnd"
                              defaults="Until"
                            />
                          )}
                        </Label>
                        <Controller
                          name={`config.${name}`}
                          control={form.control}
                          render={({ field }) => (
                            <Input
                              id={`availability-${name}`}
                              type="time"
                              required
                              step={1800}
                              value={clockValue(field.value)}
                              onChange={(event) => {
                                const [hours, minutes] = event.target.value
                                  .split(":")
                                  .map(Number);
                                if (Number.isFinite(hours + minutes))
                                  field.onChange(hours * 60 + minutes);
                              }}
                            />
                          )}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="availability-duration">
                      <Trans
                        i18nKey="availabilityEventDuration"
                        defaults="Event duration (minutes)"
                      />
                    </Label>
                    <Input
                      id="availability-duration"
                      type="number"
                      min={30}
                      max={1440}
                      step={30}
                      required
                      {...form.register("config.durationMinutes", {
                        valueAsNumber: true,
                        min: 30,
                        max: 1440,
                      })}
                    />
                    <p className="text-muted-foreground text-xs">
                      <Trans
                        i18nKey="availabilityDurationHelp"
                        defaults="Results find a continuous block this long. The grid uses 30-minute intervals."
                      />
                    </p>
                  </div>
                  {!weekly ? (
                    <p className="text-sm">
                      <Trans
                        i18nKey="availabilityDatesSelected"
                        defaults="{count, plural, =0 {No dates selected} one {1 date selected} other {# dates selected}}"
                        values={{ count: dates.length }}
                      />
                    </p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="createPollGuestManagementLinkDescription"
              defaults="Save your private management link to manage this poll from another device. An account is optional."
            />
          </p>
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={pending}
              disabled={pending || (!weekly && !dates.length)}
            >
              <Trans i18nKey="createPoll" defaults="Create poll" />
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
