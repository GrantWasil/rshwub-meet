"use client";

import { passwordManagerIgnoreProps } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@rallly/ui/card";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import { useRouter } from "next/navigation";
import React from "react";
import { saveAvailabilityResponseAction } from "@/features/poll/availability/actions";
import type { GridVote } from "@/features/poll/availability/components/availability-grid";
import { AvailabilityGrid } from "@/features/poll/availability/components/availability-grid";
import { AvailabilityRangeInput } from "@/features/poll/availability/components/availability-range-input";
import { voteForSlot } from "@/features/poll/availability/results/utils";
import type {
  AvailabilityPoll,
  AvailabilitySlot,
} from "@/features/poll/availability/types";
import { useUser } from "@/features/user/client";
import { Trans, useTranslation } from "@/i18n/client";

export function AvailabilityResponseForm({
  poll,
  slots,
  timeZone,
  locale,
  responseToken,
}: {
  poll: AvailabilityPoll;
  slots: AvailabilitySlot[];
  timeZone: string;
  locale: string;
  responseToken?: string;
}) {
  const { t } = useTranslation();
  const { user, createGuestIfNeeded } = useUser();
  const router = useRouter();
  const [name, setName] = React.useState(
    poll.currentParticipant?.name ?? (user && !user.isGuest ? user.name : ""),
  );
  const [values, setValues] = React.useState<Record<string, GridVote>>(() =>
    Object.fromEntries(
      slots.map((slot) => {
        const vote = voteForSlot(
          poll.currentParticipant?.intervals ?? [],
          slot,
        );
        return [slot.start, vote === "ifNeedBe" ? "maybe" : (vote ?? "no")];
      }),
    ),
  );
  const [brush, setBrush] = React.useState<GridVote>("yes");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string>();
  const [saved, setSaved] = React.useState(false);
  const [privateLink, setPrivateLink] = React.useState("");
  const [storedToken, setStoredToken] = React.useState(responseToken);
  const [participantId, setParticipantId] = React.useState(
    poll.currentParticipant?.id,
  );
  const storageKey = `rshwub-meet:availability-response:v1:${poll.id}`;

  React.useEffect(() => {
    let token = responseToken;
    try {
      token ??= localStorage.getItem(storageKey) ?? undefined;
    } catch {
      /* Browser storage is optional. */
    }
    if (!token) return;
    setStoredToken(token);
    setPrivateLink(
      `${window.location.origin}/availability/${poll.id}?responseToken=${encodeURIComponent(token)}`,
    );
    // The server verifies the bearer token and loads only its matching response.
    if (!poll.currentParticipant && !responseToken) {
      router.replace(
        `/availability/${poll.id}?responseToken=${encodeURIComponent(token)}`,
      );
    }
  }, [poll.id, poll.currentParticipant, responseToken, router, storageKey]);

  function updateValues(next: Record<string, GridVote>) {
    setValues(next);
    setSaved(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans
            i18nKey="availabilityYourAvailability"
            defaults="Your availability"
          />
        </CardTitle>
        <CardDescription>
          <Trans
            i18nKey="availabilityResponseInstructions"
            defaults="Mark yes, maybe, or no. Unmarked times count as no. Save when you are done."
          />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            setSaved(false);
            startTransition(async () => {
              try {
                await createGuestIfNeeded();
                const intervals = slots.flatMap((slot) => {
                  const value = values[slot.start];
                  return value && value !== "no"
                    ? [
                        {
                          start: slot.start,
                          end: slot.end,
                          type:
                            value === "maybe"
                              ? ("ifNeedBe" as const)
                              : ("yes" as const),
                        },
                      ]
                    : [];
                });
                const result = await saveAvailabilityResponseAction({
                  pollId: poll.id,
                  participantId,
                  responseToken: storedToken,
                  name,
                  intervals,
                });
                if (!result?.data) {
                  setError(
                    t("availabilitySaveFailed", {
                      defaultValue:
                        "Could not save your response. Check your name and try again; the poll may have closed.",
                    }),
                  );
                  return;
                }
                setParticipantId(result.data.participantId);
                setStoredToken(result.data.responseToken);
                setPrivateLink(
                  `${window.location.origin}/availability/${poll.id}?responseToken=${encodeURIComponent(result.data.responseToken)}`,
                );
                try {
                  localStorage.setItem(storageKey, result.data.responseToken);
                } catch {
                  /* The visible private link still allows recovery. */
                }
                setSaved(true);
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
          <div className="max-w-sm space-y-2">
            <Label htmlFor="availability-name">
              <Trans i18nKey="yourName" defaults="Your name" />
            </Label>
            <Input
              id="availability-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              required
              maxLength={100}
              {...passwordManagerIgnoreProps}
            />
          </div>
          <fieldset
            className="flex flex-wrap gap-2"
            aria-label={t("availabilityPaintAnswer", {
              defaultValue: "Answer to paint",
            })}
          >
            {(["yes", "maybe", "no"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                aria-pressed={brush === value}
                variant={brush === value ? "primary" : "default"}
                onClick={() => setBrush(value)}
              >
                {value === "yes" ? (
                  <Trans i18nKey="yes" defaults="Yes" />
                ) : value === "maybe" ? (
                  <Trans i18nKey="availabilityMaybe" defaults="Maybe" />
                ) : (
                  <Trans i18nKey="no" defaults="No" />
                )}
              </Button>
            ))}
          </fieldset>
          <fieldset disabled={pending} className="space-y-4">
            <AvailabilityGrid
              slots={slots}
              values={values}
              brush={brush}
              onChange={updateValues}
              timeZone={timeZone}
              locale={locale}
            />
            <AvailabilityRangeInput
              slots={slots}
              brush={brush}
              onApply={(range) =>
                updateValues({
                  ...values,
                  ...Object.fromEntries(
                    range.map((slot) => [slot.start, brush]),
                  ),
                })
              }
              timeZone={timeZone}
              locale={locale}
            />
          </fieldset>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <output className="text-green-700 text-sm dark:text-green-400">
              {saved ? (
                <Trans
                  i18nKey="availabilityResponseSaved"
                  defaults="Your availability is saved."
                />
              ) : null}
            </output>
            <Button
              type="submit"
              variant="primary"
              loading={pending}
              disabled={pending || !name.trim()}
            >
              <Trans
                i18nKey="availabilitySaveResponse"
                defaults="Save availability"
              />
            </Button>
          </div>
          {privateLink ? (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
              <Label htmlFor="availability-response-link">
                <Trans
                  i18nKey="availabilityPrivateResponseLink"
                  defaults="Your private response link"
                />
              </Label>
              <p className="text-muted-foreground text-xs">
                <Trans
                  i18nKey="availabilityPrivateResponseHelp"
                  defaults="Keep this link to edit your response on another device. Anyone with it can edit your response."
                />
              </p>
              <Input
                id="availability-response-link"
                readOnly
                value={privateLink}
                onFocus={(event) => event.currentTarget.select()}
                {...passwordManagerIgnoreProps}
              />
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
