"use server";

import {
  getAvailabilityComment,
  getAvailabilityCommentPoll,
} from "@/features/poll/availability/comment/data";
import {
  addAvailabilityComment,
  deleteAvailabilityComment,
} from "@/features/poll/availability/comment/mutations";
import {
  addAvailabilityCommentSchema,
  deleteAvailabilityCommentSchema,
} from "@/features/poll/availability/comment/schema";
import { loadAvailabilityActor } from "@/features/poll/availability/loaders";
import { loadPollAdminAccess } from "@/features/poll/management/loaders";
import { MAX_COMMENT_AUTHOR_NAME_LENGTH } from "@/features/poll/schema";
import { AppError } from "@/lib/errors/app-error";
import { createRatelimit } from "@/lib/rate-limit";
import { actionClient } from "@/lib/safe-action/server";

const commentLimit = createRatelimit(10, "1 m");

const commentActionClient = actionClient.use(async ({ next }) => {
  const user = await loadAvailabilityActor();
  if (!user)
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Create a guest session before commenting",
    });
  return next({ ctx: { user } });
});

export const addAvailabilityCommentAction = commentActionClient
  .metadata({ actionName: "add_availability_comment" })
  .inputSchema(addAvailabilityCommentSchema)
  .action(async ({ ctx, parsedInput }) => {
    if (
      commentLimit &&
      !(await commentLimit.limit(`availability:comment:${ctx.user.id}`)).success
    ) {
      throw new AppError({
        code: "TOO_MANY_REQUESTS",
        message: "Please wait before adding another comment",
      });
    }
    const poll = await getAvailabilityCommentPoll(parsedInput.pollId);
    if (!poll)
      throw new AppError({ code: "NOT_FOUND", message: "Poll not found" });
    if (poll.disableComments || poll.status !== "open")
      throw new AppError({ code: "FORBIDDEN", message: "Comments are closed" });
    return addAvailabilityComment({
      ...parsedInput,
      userId: ctx.user.id,
      authorName: ctx.user.isGuest
        ? parsedInput.authorName
        : ctx.user.name.trim().slice(0, MAX_COMMENT_AUTHOR_NAME_LENGTH),
    });
  });

export const deleteAvailabilityCommentAction = commentActionClient
  .metadata({ actionName: "delete_availability_comment" })
  .inputSchema(deleteAvailabilityCommentSchema)
  .action(async ({ ctx, parsedInput }) => {
    const comment = await getAvailabilityComment(
      parsedInput.pollId,
      parsedInput.commentId,
    );
    if (!comment)
      throw new AppError({ code: "NOT_FOUND", message: "Comment not found" });
    if (
      comment.userId !== ctx.user.id &&
      !(await loadPollAdminAccess(parsedInput.pollId, ctx.user.id))
    ) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "You cannot delete this comment",
      });
    }
    return deleteAvailabilityComment(parsedInput);
  });
