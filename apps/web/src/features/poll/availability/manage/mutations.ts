import "server-only";
import type { Prisma } from "@rallly/database";
import { prisma } from "@rallly/database";
import { revalidatePath } from "next/cache";
import type * as z from "zod";
import { recordPollActivities } from "@/features/poll/activity/mutations";
import { AppError } from "@/lib/errors/app-error";
import type {
  changeAvailabilityPollStatusSchema,
  editAvailabilityPollSchema,
} from "./schema";

async function lockAvailabilityPoll(
  tx: Prisma.TransactionClient,
  pollId: string,
) {
  await tx.$queryRaw`SELECT id FROM polls WHERE id = ${pollId} FOR UPDATE`;
  const poll = await tx.poll.findFirst({
    where: {
      id: pollId,
      deleted: false,
      schedulingMode: "availability",
      user: { banned: false, deletedAt: null },
    },
    select: { status: true },
  });
  if (!poll)
    throw new AppError({ code: "NOT_FOUND", message: "Poll not found" });
  return poll;
}

export async function editAvailabilityPoll({
  input,
  userId,
}: {
  input: z.infer<typeof editAvailabilityPollSchema>;
  userId?: string;
}) {
  await prisma.$transaction(async (tx) => {
    await lockAvailabilityPoll(tx, input.pollId);
    await tx.poll.update({
      where: { id: input.pollId },
      data: {
        title: input.title,
        description: input.description || null,
        location: input.location || null,
      },
    });
    await recordPollActivities(tx, [
      { pollId: input.pollId, userId, type: "poll_updated", payload: {} },
    ]);
  });
  revalidatePath(`/availability/${input.pollId}`);
  return { pollId: input.pollId };
}

export async function changeAvailabilityPollStatus({
  input,
  userId,
}: {
  input: z.infer<typeof changeAvailabilityPollStatusSchema>;
  userId?: string;
}) {
  await prisma.$transaction(async (tx) => {
    const poll = await lockAvailabilityPoll(tx, input.pollId);
    if (poll.status === input.status) return;
    if (input.status === "closed" && poll.status !== "open") {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Reopen the poll before closing responses",
      });
    }
    if (input.status === "open") {
      // Availability options represent only the chosen time. Responses are
      // stored independently and survive reopening unchanged.
      await tx.option.deleteMany({ where: { pollId: input.pollId } });
      await tx.poll.update({
        where: { id: input.pollId },
        data: {
          status: "open",
          closedReason: null,
          deadline: null,
          eventId: null,
        },
      });
      await recordPollActivities(tx, [
        { pollId: input.pollId, userId, type: "poll_reopened", payload: {} },
      ]);
    } else {
      await tx.poll.update({
        where: { id: input.pollId },
        data: { status: "closed", closedReason: "manual" },
      });
      await recordPollActivities(tx, [
        {
          pollId: input.pollId,
          userId,
          type: "poll_closed",
          payload: { reason: "manual" },
        },
      ]);
    }
  });
  revalidatePath(`/availability/${input.pollId}`);
  return { pollId: input.pollId };
}

export async function deleteAvailabilityPoll(pollId: string) {
  await prisma.$transaction(async (tx) => {
    await lockAvailabilityPoll(tx, pollId);
    await tx.poll.update({
      where: { id: pollId },
      data: { deleted: true, deletedAt: new Date() },
    });
  });
  revalidatePath(`/availability/${pollId}`);
  return { pollId };
}
