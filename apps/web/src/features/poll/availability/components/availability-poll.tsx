"use client";

import { buttonVariants, passwordManagerIgnoreProps } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rallly/ui/card";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import {
  CalendarCheckIcon,
  CopyIcon,
  MapPinIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { TimeZoneSelect } from "@/components/time-zone-picker/time-zone-select";
import { AvailabilityComments } from "@/features/poll/availability/components/availability-comments";
import { AvailabilityManage } from "@/features/poll/availability/components/availability-manage";
import { AvailabilityResponseForm } from "@/features/poll/availability/components/availability-response-form";
import { AvailabilityResults } from "@/features/poll/availability/components/availability-results";
import type { AvailabilityPoll as AvailabilityPollData } from "@/features/poll/availability/types";
import { getAvailabilitySlots } from "@/features/poll/availability/utils";
import { PollManagementLink } from "@/features/poll/management/components/poll-management-link";
import { UserDropdown } from "@/features/user/components/user-dropdown";
import { Trans } from "@/i18n/client";
import { formatDateTimeRange } from "@/lib/datetime/format";
import { useLocale } from "@/lib/locale/client";
import { getBrowserTimeZone } from "@/lib/utils/date-time-utils";

export function AvailabilityPoll({
  poll,
  responseToken,
}: {
  poll: AvailabilityPollData;
  responseToken?: string;
}) {
  const { locale } = useLocale();
  const router = useRouter();
  const slots = React.useMemo(
    () => getAvailabilitySlots(poll.config),
    [poll.config],
  );
  const [timeZone, setTimeZone] = React.useState(poll.config.timeZone);
  const [publicLink, setPublicLink] = React.useState(
    `/availability/${poll.id}`,
  );
  const [copied, setCopied] = React.useState(false);
  const [refreshing, startTransition] = React.useTransition();
  React.useEffect(() => {
    setTimeZone(getBrowserTimeZone());
    setPublicLink(`${window.location.origin}/availability/${poll.id}`);
  }, [poll.id]);
  return (
    <div className="absolute inset-0 overflow-auto bg-gray-100 dark:bg-gray-900">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-gray-100/90 p-3 backdrop-blur-md dark:bg-gray-900/90">
        <Link href="/new" className={buttonVariants({ variant: "ghost" })}>
          <PlusIcon className="size-4" />
          <Trans i18nKey="newPoll" defaults="New poll" />
        </Link>
        <UserDropdown />
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-5xl space-y-5 px-3 pt-4 pb-12"
      >
        <div className="space-y-3 py-3">
          <p className="font-medium text-muted-foreground text-sm">
            <Trans
              i18nKey="schedulingModeAvailability"
              defaults="Availability grid"
            />
          </p>
          <h1 className="break-words font-bold text-3xl tracking-tight">
            {poll.title}
          </h1>
          {poll.description ? (
            <p className="max-w-3xl whitespace-pre-wrap break-words text-muted-foreground">
              {poll.description}
            </p>
          ) : null}
          {poll.location ? (
            <p className="flex items-center gap-2 text-sm">
              <MapPinIcon className="size-4 shrink-0" />
              {poll.location}
            </p>
          ) : null}
        </div>
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="space-y-2">
              <Label htmlFor="availability-public-link">
                <Trans
                  i18nKey="availabilityInviteLink"
                  defaults="Invite link"
                />
              </Label>
              <div className="flex gap-2">
                <Input
                  id="availability-public-link"
                  readOnly
                  value={publicLink}
                  onFocus={(event) => event.currentTarget.select()}
                  {...passwordManagerIgnoreProps}
                />
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(publicLink);
                      setCopied(true);
                    } catch {
                      document
                        .getElementById("availability-public-link")
                        ?.focus();
                    }
                  }}
                >
                  <CopyIcon className="size-4" />
                  {copied ? (
                    <Trans i18nKey="copied" defaults="Copied" />
                  ) : (
                    <Trans i18nKey="copy" defaults="Copy" />
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                <Trans
                  i18nKey="availabilityPublicLinkHelp"
                  defaults="Anyone with this link can see the poll and respond. No account required."
                />
              </p>
            </div>
            {poll.canManage ? <PollManagementLink pollId={poll.id} /> : null}
          </CardContent>
        </Card>
        {poll.canManage ? <AvailabilityManage poll={poll} /> : null}
        {poll.finalized ? (
          <Card className="border-green-500/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheckIcon className="size-5 text-green-600" />
                <Trans
                  i18nKey="availabilityFinalTime"
                  defaults="The time is set"
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-medium">
                {formatDateTimeRange(
                  new Date(poll.finalized.start),
                  new Date(poll.finalized.end),
                  {
                    locale,
                    timeZone,
                    preset: "datetime",
                    showTimeZone: true,
                  },
                )}
              </p>
              <a
                href={`/api/availability/${poll.id}/ics`}
                className={buttonVariants({ variant: "primary" })}
              >
                <Trans
                  i18nKey="availabilityDownloadCalendar"
                  defaults="Download calendar event"
                />
              </a>
            </CardContent>
          </Card>
        ) : poll.status !== "open" ? (
          <p className="rounded-xl border bg-card p-4">
            <Trans
              i18nKey="availabilityPollClosed"
              defaults="This poll is closed. Existing responses are shown below."
            />
          </p>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Label htmlFor="availability-display-zone">
              <Trans
                i18nKey="availabilityDisplayZone"
                defaults="Show times in"
              />
            </Label>
            <TimeZoneSelect
              id="availability-display-zone"
              value={timeZone}
              onValueChange={setTimeZone}
            />
          </div>
          <Button
            type="button"
            loading={refreshing}
            disabled={refreshing}
            onClick={() => startTransition(() => router.refresh())}
          >
            <RefreshCwIcon className="size-4" />
            <Trans
              i18nKey="availabilityRefreshResults"
              defaults="Refresh results"
            />
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          <Trans
            i18nKey="availabilityColumnTimeZone"
            defaults="Columns follow event dates in {timeZone}. Times within each column convert to your selected time zone; focus a cell to see its full date and time."
            values={{ timeZone: poll.config.timeZone }}
          />
        </p>
        {poll.status === "open" ? (
          <AvailabilityResponseForm
            key={poll.currentParticipant?.id ?? poll.id}
            poll={poll}
            slots={slots}
            responseToken={responseToken}
            timeZone={timeZone}
            locale={locale}
          />
        ) : null}
        <AvailabilityResults
          poll={poll}
          slots={slots}
          timeZone={timeZone}
          locale={locale}
        />
        <AvailabilityComments
          pollId={poll.id}
          canManage={poll.canManage}
          open={poll.status === "open"}
          participantName={poll.currentParticipant?.name}
        />
        <footer className="flex flex-wrap justify-center gap-x-4 gap-y-2 py-5 text-muted-foreground text-xs">
          <a
            href="https://github.com/GrantWasil/rshwub-meet"
            className="underline underline-offset-4"
          >
            <Trans i18nKey="rshwubViewSource" defaults="View source" />
          </a>
          <a
            href="https://github.com/lukevella/rallly"
            className="underline underline-offset-4"
          >
            <Trans i18nKey="rshwubBasedOnRallly" defaults="Based on Rallly" />
          </a>
        </footer>
      </main>
    </div>
  );
}
