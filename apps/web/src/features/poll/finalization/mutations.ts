import "server-only";

import type { Prisma } from "@rallly/database";
import { prisma } from "@rallly/database";
import { recordPollActivities } from "@/features/poll/activity/mutations";
import { AppError } from "@/lib/errors/app-error";
import { getScheduledEventTimes } from "./utils";

/** Finalize a poll without requiring a Space or manufacturing an account. */
export async function finalizePollOption({
  pollId,
  optionId,
  userId,
}: {
  pollId: string;
  optionId: string;
  userId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM polls WHERE id = ${pollId} FOR UPDATE`;
    const poll = await tx.poll.findFirst({
      where: {
        id: pollId,
        deleted: false,
        schedulingMode: "options",
        user: { banned: false, deletedAt: null },
      },
      select: { status: true, timeZone: true },
    });
    if (!poll)
      throw new AppError({ code: "NOT_FOUND", message: "Poll not found" });
    if (poll.status !== "open" && poll.status !== "closed")
      throw new AppError({
        code: "FORBIDDEN",
        message: "Reopen the poll before choosing another final time",
      });
    const option = await tx.option.findFirst({
      where: { id: optionId, pollId },
      select: { startTime: true, duration: true },
    });
    if (!option)
      throw new AppError({ code: "NOT_FOUND", message: "Option not found" });
    await tx.poll.update({
      where: { id: pollId },
      data: {
        status: "scheduled",
        closedReason: null,
        finalizedOptionId: optionId,
        scheduledEventId: null,
      },
    });
    await recordPollActivities(tx, [
      {
        pollId,
        userId,
        type: "poll_scheduled",
        optionId,
        payload: {
          start: option.startTime.toISOString(),
          duration: option.duration,
        },
      },
    ]);
    return getScheduledEventTimes({ ...option, timeZone: poll.timeZone });
  });
}

/** Reopening clears the chosen result while retaining all choices and responses. */
export async function reopenOptionsPoll({
  pollId,
  userId,
}: {
  pollId: string;
  userId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM polls WHERE id = ${pollId} FOR UPDATE`;
    const poll = await tx.poll.findFirst({
      where: {
        id: pollId,
        deleted: false,
        schedulingMode: "options",
        user: { banned: false, deletedAt: null },
      },
      select: { status: true, scheduledEventId: true },
    });
    if (!poll)
      throw new AppError({ code: "NOT_FOUND", message: "Poll not found" });
    if (poll.status === "open") return;
    await tx.poll.update({
      where: { id: pollId },
      data: {
        status: "open",
        closedReason: null,
        finalizedOptionId: null,
        scheduledEventId: null,
        deadline: null,
      },
    });
    if (poll.scheduledEventId)
      await tx.scheduledEvent.delete({ where: { id: poll.scheduledEventId } });
    await recordPollActivities(tx, [
      { pollId, userId, type: "poll_reopened", payload: {} },
    ]);
  });
}

/** Shares the organizer's row lock so responses cannot commit after finalization. */
export async function lockOpenOptionsPoll(
  tx: Prisma.TransactionClient,
  pollId: string,
) {
  await tx.$queryRaw`SELECT id FROM polls WHERE id = ${pollId} FOR UPDATE`;
  const poll = await tx.poll.findFirst({
    where: {
      id: pollId,
      schedulingMode: "options",
      status: "open",
      deleted: false,
      user: { banned: false, deletedAt: null },
    },
    select: { id: true },
  });
  if (!poll)
    throw new AppError({
      code: "FORBIDDEN",
      message: "This poll is no longer accepting changes",
    });
}
