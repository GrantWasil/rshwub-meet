"use client";

import { Button } from "@rallly/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@rallly/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useDialog,
} from "@rallly/ui/dialog";
import { useRouter } from "next/navigation";
import React from "react";
import { finalizeAvailabilityPollAction } from "@/features/poll/availability/actions";
import { AvailabilityGrid } from "@/features/poll/availability/components/availability-grid";
import { formatAvailabilityTimeRange } from "@/features/poll/availability/components/availability-time-label";
import { getAvailabilityResults } from "@/features/poll/availability/results/utils";
import type {
  AvailabilityPoll,
  AvailabilitySlot,
} from "@/features/poll/availability/types";
import { isWeeklyAvailability } from "@/features/poll/availability/utils";
import { Trans, useTranslation } from "@/i18n/client";
import { formatDateTimeRange } from "@/lib/datetime/format";

export function AvailabilityResults({
  poll,
  slots,
  timeZone,
  locale,
}: {
  poll: AvailabilityPoll;
  slots: AvailabilitySlot[];
  timeZone: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useDialog();
  const weekly = isWeeklyAvailability(poll.config);
  const [selected, setSelected] = React.useState<{
    start: string;
    end: string;
  }>();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string>();
  const { counts, windows } = React.useMemo(
    () =>
      getAvailabilityResults(
        slots,
        poll.participants,
        poll.config.durationMinutes,
      ),
    [slots, poll.participants, poll.config.durationMinutes],
  );
  const best = windows
    .filter((window) => window.yes.length + window.maybe.length > 0)
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans
            i18nKey="availabilityGroupResults"
            defaults="Group availability"
          />
        </CardTitle>
        <CardDescription>
          <Trans
            i18nKey="availabilityResultsExplanation"
            defaults="Darker green means more people are free; maybe responses add lighter shading. Each cell shows yes responses out of everyone who responded, with a question mark for maybe responses. Select a time for the full breakdown."
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AvailabilityGrid
          slots={slots}
          counts={counts}
          participantCount={poll.participants.length}
          timeZone={timeZone}
          locale={locale}
          weekly={weekly}
        />
        <div className="space-y-3">
          <h3 className="font-semibold">
            {weekly ? (
              <Trans
                i18nKey="availabilityBestWeeklyWindows"
                defaults="Best weekly times"
              />
            ) : (
              <Trans
                i18nKey="availabilityBestWindows"
                defaults="Best continuous times"
              />
            )}
          </h3>
          <p className="text-muted-foreground text-sm">
            {weekly ? (
              <Trans
                i18nKey="availabilityBestWeeklyWindowsDescription"
                defaults="The top recurring {minutes}-minute windows, ranked by yes responses, then maybe responses. Each person counted is available for the whole event."
                values={{ minutes: poll.config.durationMinutes }}
              />
            ) : (
              <Trans
                i18nKey="availabilityBestWindowsDescription"
                defaults="Each person counted can attend the entire {minutes}-minute event. Maybe means at least part of their response is tentative."
                values={{ minutes: poll.config.durationMinutes }}
              />
            )}
          </p>
          {best.length ? (
            <ol className="divide-y rounded-xl border">
              {best.map((window, index) => (
                <li
                  key={window.start}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-sm">
                      <span
                        className="mr-2 text-muted-foreground tabular-nums"
                        aria-hidden="true"
                      >
                        {index + 1}.
                      </span>
                      {formatAvailabilityTimeRange({
                        start: window.start,
                        end: window.end,
                        locale,
                        timeZone,
                        weekly,
                      })}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      <Trans
                        i18nKey="availabilityWindowCounts"
                        defaults="{yes} yes · {maybe} maybe · {no} unavailable"
                        values={{
                          yes: window.yes.length,
                          maybe: window.maybe.length,
                          no:
                            poll.participants.length -
                            window.yes.length -
                            window.maybe.length,
                        }}
                      />
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        ...window.yes,
                        ...window.maybe.map((name) => `${name} (?)`),
                      ].join(", ")}
                    </p>
                  </div>
                  {!weekly && poll.canManage && poll.status === "open" ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setSelected(window);
                        setError(undefined);
                        dialog.trigger();
                      }}
                    >
                      <Trans
                        i18nKey="availabilityChooseTime"
                        defaults="Choose this time"
                      />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl border border-dashed p-5 text-muted-foreground text-sm">
              <Trans
                i18nKey="availabilityNoContinuousTime"
                defaults="No continuous time fits yet. Add availability or invite more responses."
              />
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {poll.participants.map((participant) => (
            <span
              key={participant.id}
              className="rounded-full bg-muted px-3 py-1 text-sm"
            >
              {participant.name}
              {participant.id === poll.currentParticipant?.id
                ? ` (${t("you")})`
                : ""}
            </span>
          ))}
        </div>
      </CardContent>
      {!weekly ? (
        <Dialog {...dialog.dialogProps}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <Trans
                  i18nKey="availabilityFinalizeTitle"
                  defaults="Finalize this time?"
                />
              </DialogTitle>
              <DialogDescription>
                <Trans
                  i18nKey="availabilityFinalizeDescription"
                  defaults="Responses will close and everyone can download the calendar event."
                />
              </DialogDescription>
            </DialogHeader>
            {selected ? (
              <p className="font-medium">
                {formatDateTimeRange(
                  new Date(selected.start),
                  new Date(selected.end),
                  {
                    locale,
                    timeZone,
                    preset: "datetime",
                    showTimeZone: true,
                  },
                )}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                disabled={pending}
                onClick={() => dialog.dismiss()}
              >
                <Trans i18nKey="cancel" defaults="Cancel" />
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={pending || !selected}
                loading={pending}
                onClick={() => {
                  if (!selected) return;
                  startTransition(async () => {
                    try {
                      const result = await finalizeAvailabilityPollAction({
                        pollId: poll.id,
                        ...selected,
                      });
                      if (!result?.data) {
                        setError(
                          t("availabilityFinalizeFailed", {
                            defaultValue:
                              "Could not finalize this time. Refresh the poll and try again.",
                          }),
                        );
                        return;
                      }
                      dialog.dismiss();
                      router.refresh();
                    } catch {
                      setError(
                        t("availabilityNetworkError", {
                          defaultValue:
                            "The connection was interrupted. Your changes are still here; please try again.",
                        }),
                      );
                    }
                  });
                }}
              >
                <Trans
                  i18nKey="availabilityFinalizeTime"
                  defaults="Finalize time"
                />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}
