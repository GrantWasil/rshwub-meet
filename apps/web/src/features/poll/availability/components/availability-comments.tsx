"use client";

import { passwordManagerIgnoreProps } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rallly/ui/card";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import { Textarea } from "@rallly/ui/textarea";
import React from "react";
import {
  addAvailabilityCommentAction,
  deleteAvailabilityCommentAction,
} from "@/features/poll/availability/comment/actions";
import { useUser } from "@/features/user/client";
import { Trans, useTranslation } from "@/i18n/client";
import { RelativeTime } from "@/lib/datetime/relative-time";
import { trpc } from "@/trpc/client";

export function AvailabilityComments({
  pollId,
  canManage,
  open,
  participantName,
}: {
  pollId: string;
  canManage: boolean;
  open: boolean;
  participantName?: string;
}) {
  const { t } = useTranslation();
  const { user, createGuestIfNeeded } = useUser();
  const [nameOverride, setNameOverride] = React.useState<string>();
  const name =
    nameOverride ?? participantName ?? (user && !user.isGuest ? user.name : "");
  const [content, setContent] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();
  const comments = trpc.polls.comments.list.useQuery({ pollId });
  const queryClient = trpc.useUtils();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans i18nKey="comments" defaults="Comments" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {comments.isLoading ? (
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="availabilityCommentsLoading"
              defaults="Loading comments…"
            />
          </p>
        ) : null}
        {comments.error ? (
          <p role="alert" className="text-destructive text-sm">
            <Trans
              i18nKey="availabilityCommentsFailed"
              defaults="Comments could not be loaded."
            />
          </p>
        ) : null}
        {comments.data?.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <Trans i18nKey="commentsSheetEmpty" defaults="No comments yet" />
          </p>
        ) : null}
        <ul className="divide-y">
          {comments.data?.map((comment) => (
            <li key={comment.id} className="space-y-2 py-4 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{comment.authorName}</p>
                {canManage || comment.userId === user?.id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await createGuestIfNeeded();
                          const result = await deleteAvailabilityCommentAction({
                            pollId,
                            commentId: comment.id,
                          });
                          if (!result?.data) {
                            setError(
                              t("availabilityCommentDeleteFailed", {
                                defaultValue: "Could not delete this comment.",
                              }),
                            );
                            return;
                          }
                          await queryClient.polls.comments.list.invalidate({
                            pollId,
                          });
                        } catch {
                          setError(
                            t("availabilityCommentDeleteFailed", {
                              defaultValue: "Could not delete this comment.",
                            }),
                          );
                        }
                      })
                    }
                  >
                    <Trans i18nKey="delete" defaults="Delete" />
                  </Button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">
                {comment.content}
              </p>
              <p className="text-muted-foreground text-xs">
                <RelativeTime value={comment.createdAt} />
              </p>
            </li>
          ))}
        </ul>
        {open ? (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(undefined);
              startTransition(async () => {
                try {
                  await createGuestIfNeeded();
                  const result = await addAvailabilityCommentAction({
                    pollId,
                    authorName: name,
                    content,
                  });
                  if (!result?.data) {
                    setError(
                      t("availabilityCommentAddFailed", {
                        defaultValue:
                          "Could not add your comment. Please try again.",
                      }),
                    );
                    return;
                  }
                  setContent("");
                  await queryClient.polls.comments.list.invalidate({ pollId });
                } catch {
                  setError(
                    t("availabilityCommentAddFailed", {
                      defaultValue:
                        "Could not add your comment. Please try again.",
                    }),
                  );
                }
              });
            }}
          >
            <div className="max-w-sm space-y-2">
              <Label htmlFor="availability-comment-name">
                <Trans i18nKey="yourName" defaults="Your name" />
              </Label>
              <Input
                id="availability-comment-name"
                value={name}
                onChange={(event) => setNameOverride(event.target.value)}
                required
                maxLength={100}
                {...passwordManagerIgnoreProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="availability-comment">
                <Trans i18nKey="comments" defaults="Comments" />
              </Label>
              <Textarea
                id="availability-comment"
                required
                maxLength={2000}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={pending || !name.trim() || !content.trim()}
              loading={pending}
            >
              <Trans i18nKey="addComment" defaults="Add comment" />
            </Button>
          </form>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
