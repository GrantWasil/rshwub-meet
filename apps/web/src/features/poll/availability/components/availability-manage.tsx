"use client";

import { passwordManagerIgnoreProps } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rallly/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useDialog,
} from "@rallly/ui/dialog";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import { Textarea } from "@rallly/ui/textarea";
import { useRouter } from "next/navigation";
import React from "react";
import {
  changeAvailabilityPollStatusAction,
  deleteAvailabilityPollAction,
  editAvailabilityPollAction,
} from "@/features/poll/availability/manage/actions";
import { editAvailabilityPollSchema } from "@/features/poll/availability/manage/schema";
import type { AvailabilityPoll } from "@/features/poll/availability/types";
import { Trans, useTranslation } from "@/i18n/client";

export function AvailabilityManage({ poll }: { poll: AvailabilityPoll }) {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useDialog();
  const [operation, setOperation] = React.useState<
    "edit" | "close" | "reopen" | "delete"
  >("edit");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string>();

  function open(operation: "edit" | "close" | "reopen" | "delete") {
    setOperation(operation);
    setError(undefined);
    dialog.trigger();
  }

  function failed() {
    setError(
      t("availabilityManageFailed", {
        defaultValue:
          "Could not update this poll. Refresh the page and try again.",
      }),
    );
  }

  function confirm() {
    startTransition(async () => {
      try {
        const result =
          operation === "delete"
            ? await deleteAvailabilityPollAction({ pollId: poll.id })
            : await changeAvailabilityPollStatusAction({
                pollId: poll.id,
                status: operation === "close" ? "closed" : "open",
              });
        if (!result?.data) return failed();
        dialog.dismiss();
        if (operation === "delete") router.replace("/new");
        router.refresh();
      } catch {
        failed();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans
            i18nKey="availabilityOrganizerTools"
            defaults="Organizer tools"
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => open("edit")}>
          <Trans i18nKey="availabilityEditDetails" defaults="Edit details" />
        </Button>
        {poll.status === "open" ? (
          <Button type="button" onClick={() => open("close")}>
            <Trans
              i18nKey="availabilityCloseResponses"
              defaults="Close responses"
            />
          </Button>
        ) : (
          <Button type="button" onClick={() => open("reopen")}>
            <Trans i18nKey="availabilityReopenPoll" defaults="Reopen poll" />
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => open("delete")}>
          <Trans i18nKey="deletePoll" defaults="Delete poll" />
        </Button>
      </CardContent>
      <Dialog {...dialog.dialogProps}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {operation === "edit" ? (
                <Trans
                  i18nKey="availabilityEditDetails"
                  defaults="Edit details"
                />
              ) : operation === "delete" ? (
                <Trans
                  i18nKey="availabilityDeleteTitle"
                  defaults="Delete this poll?"
                />
              ) : operation === "close" ? (
                <Trans
                  i18nKey="availabilityCloseTitle"
                  defaults="Close responses?"
                />
              ) : (
                <Trans
                  i18nKey="availabilityReopenTitle"
                  defaults="Reopen this poll?"
                />
              )}
            </DialogTitle>
            <DialogDescription>
              {operation === "edit" ? (
                <Trans
                  i18nKey="availabilityEditDescription"
                  defaults="Update the event details. Existing responses and dates will stay in place."
                />
              ) : operation === "delete" ? (
                <Trans
                  i18nKey="availabilityDeleteDescription"
                  defaults="The invite and management links will stop working. This cannot be undone from this page. Calendar events people already downloaded will stay in their calendars."
                />
              ) : operation === "close" ? (
                <Trans
                  i18nKey="availabilityCloseDescription"
                  defaults="Pause new responses and comments. Existing responses stay visible, and you can reopen the poll at any time."
                />
              ) : poll.finalized ? (
                <Trans
                  i18nKey="availabilityReopenFinalizedDescription"
                  defaults="Clear the chosen time and reopen responses. Everyone's availability will be kept. Ask guests to remove the old event from their calendars; previously downloaded events will not update automatically."
                />
              ) : (
                <Trans
                  i18nKey="availabilityReopenDescription"
                  defaults="Allow responses and comments again. Everyone's existing availability will be kept."
                />
              )}
            </DialogDescription>
          </DialogHeader>
          {operation === "edit" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const parsed = editAvailabilityPollSchema.safeParse({
                  pollId: poll.id,
                  title: data.get("title"),
                  description: data.get("description"),
                  location: data.get("location"),
                });
                if (!parsed.success) {
                  setError(parsed.error.issues[0]?.message);
                  return;
                }
                setError(undefined);
                startTransition(async () => {
                  try {
                    const result = await editAvailabilityPollAction(
                      parsed.data,
                    );
                    if (!result?.data) return failed();
                    dialog.dismiss();
                    router.refresh();
                  } catch {
                    failed();
                  }
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="availability-edit-title">
                  <Trans i18nKey="title" defaults="Title" />
                </Label>
                <Input
                  id="availability-edit-title"
                  name="title"
                  defaultValue={poll.title}
                  required
                  maxLength={200}
                  {...passwordManagerIgnoreProps}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availability-edit-description">
                  <Trans i18nKey="description" defaults="Description" />
                </Label>
                <Textarea
                  id="availability-edit-description"
                  name="description"
                  defaultValue={poll.description ?? ""}
                  rows={3}
                  maxLength={5000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availability-edit-location">
                  <Trans i18nKey="location" defaults="Location" />
                </Label>
                <Input
                  id="availability-edit-location"
                  name="location"
                  defaultValue={poll.location ?? ""}
                  maxLength={500}
                  {...passwordManagerIgnoreProps}
                />
              </div>
              {poll.finalized ? (
                <p className="text-muted-foreground text-sm">
                  <Trans
                    i18nKey="availabilityEditedCalendarWarning"
                    defaults="Guests who already downloaded the calendar event will need to update its details themselves."
                  />
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
                  type="submit"
                  variant="primary"
                  disabled={pending}
                  loading={pending}
                >
                  <Trans i18nKey="save" defaults="Save" />
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <p className="break-words font-medium">{poll.title}</p>
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
                  variant={operation === "delete" ? "destructive" : "primary"}
                  disabled={pending}
                  loading={pending}
                  onClick={confirm}
                >
                  {operation === "delete" ? (
                    <Trans i18nKey="deletePoll" defaults="Delete poll" />
                  ) : operation === "close" ? (
                    <Trans
                      i18nKey="availabilityCloseResponses"
                      defaults="Close responses"
                    />
                  ) : (
                    <Trans
                      i18nKey="availabilityReopenPoll"
                      defaults="Reopen poll"
                    />
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
