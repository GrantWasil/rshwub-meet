import "server-only";

import { prisma } from "@rallly/database";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import type * as z from "zod";
import { recordPollActivities } from "@/features/poll/activity/mutations";
import { generateAccessToken } from "@/features/poll/utils";
import { AppError } from "@/lib/errors/app-error";
import type {
  createAvailabilityPollSchema,
  finalizeAvailabilityPollSchema,
  saveAvailabilityResponseSchema,
} from "./schema";
import { availabilityConfigSchema } from "./schema";
import type { AvailabilityInterval } from "./types";
import { getAvailabilitySlots, normalizeAvailabilityIntervals } from "./utils";

export async function createAvailabilityPoll({
  userId,
  spaceId,
  input,
}: {
  userId: string;
  spaceId?: string;
  input: z.infer<typeof createAvailabilityPollSchema>;
}) {
  if (getAvailabilitySlots(input.config).length === 0)
    throw new AppError({
      code: "FORBIDDEN",
      message: "Choose dates with available times",
    });
  const pollId = nanoid();
  await prisma.$transaction(async (tx) => {
    await tx.poll.create({
      data: {
        id: pollId,
        userId,
        spaceId,
        title: input.title,
        description: input.description,
        location: input.location,
        kind: "time",
        schedulingMode: "availability",
        availabilityConfig: input.config,
        timeZone: input.config.timeZone,
        disableComments: false,
      },
    });
    await recordPollActivities(tx, [
      { pollId, type: "poll_created", userId, payload: { title: input.title } },
    ]);
  });
  return { pollId };
}

export async function saveAvailabilityResponse({
  userId,
  participantId,
  input,
}: {
  userId?: string;
  participantId?: string;
  input: z.infer<typeof saveAvailabilityResponseSchema>;
}) {
  const result = await prisma.$transaction(async (tx) => {
    // Serialize saves with finalization; an in-flight response cannot reopen
    // or modify a poll that was finalized after the action authorized it.
    await tx.$queryRaw`SELECT id FROM polls WHERE id = ${input.pollId} FOR UPDATE`;
    const poll = await tx.poll.findFirst({
      where: {
        id: input.pollId,
        deleted: false,
        schedulingMode: "availability",
        user: { banned: false, deletedAt: null },
      },
      select: { status: true, deadline: true, availabilityConfig: true },
    });
    if (!poll)
      throw new AppError({ code: "NOT_FOUND", message: "Poll not found" });
    if (
      poll.status !== "open" ||
      (poll.deadline && poll.deadline <= new Date())
    )
      throw new AppError({ code: "FORBIDDEN", message: "This poll is closed" });
    const config = availabilityConfigSchema.parse(poll.availabilityConfig);
    let intervals: AvailabilityInterval[];
    try {
      intervals = normalizeAvailabilityIntervals(config, input.intervals);
    } catch (cause) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Availability must fit the poll's time grid",
        cause,
      });
    }
    const existing = participantId
      ? await tx.participant.findFirst({
          where: { id: participantId, pollId: input.pollId },
          select: { id: true, token: true },
        })
      : userId
        ? await tx.participant.findFirst({
            where: { pollId: input.pollId, userId },
            select: { id: true, token: true },
          })
        : null;
    if (participantId && !existing)
      throw new AppError({ code: "NOT_FOUND", message: "Response not found" });
    if (!existing && !userId)
      throw new AppError({
        code: "UNAUTHORIZED",
        message: "Create a guest session before responding",
      });
    if (
      !existing &&
      (await tx.participant.count({ where: { pollId: input.pollId } })) >= 500
    )
      throw new AppError({
        code: "POLL_FULL",
        message: "This poll has reached its response limit",
      });
    const response = existing
      ? await tx.participant.update({
          where: { id: existing.id },
          data: { name: input.name, availability: intervals },
          select: { id: true, token: true },
        })
      : await tx.participant.create({
          data: {
            pollId: input.pollId,
            userId,
            name: input.name,
            availability: intervals,
            token: generateAccessToken(),
            timeZone: config.timeZone,
          },
          select: { id: true, token: true },
        });
    await recordPollActivities(tx, [
      {
        pollId: input.pollId,
        type: existing ? "response_updated" : "response_created",
        userId,
        participantId: response.id,
        payload: { name: input.name },
      },
    ]);
    return { participantId: response.id, responseToken: response.token };
  });
  revalidatePath(`/availability/${input.pollId}`);
  return result;
}

export async function finalizeAvailabilityPoll({
  userId,
  input,
}: {
  userId?: string;
  input: z.infer<typeof finalizeAvailabilityPollSchema>;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM polls WHERE id = ${input.pollId} FOR UPDATE`;
    const poll = await tx.poll.findFirst({
      where: {
        id: input.pollId,
        deleted: false,
        schedulingMode: "availability",
        user: { banned: false, deletedAt: null },
      },
      select: { status: true, availabilityConfig: true },
    });
    if (!poll)
      throw new AppError({ code: "NOT_FOUND", message: "Poll not found" });
    if (poll.status !== "open")
      throw new AppError({ code: "FORBIDDEN", message: "This poll is closed" });
    const config = availabilityConfigSchema.parse(poll.availabilityConfig);
    const duration = (Date.parse(input.end) - Date.parse(input.start)) / 60_000;
    try {
      normalizeAvailabilityIntervals(config, [
        { start: input.start, end: input.end, type: "yes" },
      ]);
      if (duration !== config.durationMinutes)
        throw new Error("Choose the requested meeting duration");
    } catch (cause) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Choose a meeting time within the poll's time grid",
        cause,
      });
    }
    const option = await tx.option.create({
      data: {
        pollId: input.pollId,
        startTime: new Date(input.start),
        duration,
      },
      select: { id: true },
    });
    await tx.poll.update({
      where: { id: input.pollId },
      data: { status: "scheduled", closedReason: null },
    });
    await recordPollActivities(tx, [
      {
        pollId: input.pollId,
        userId,
        type: "poll_scheduled",
        optionId: option.id,
        payload: { start: new Date(input.start).toISOString(), duration },
      },
    ]);
  });
  revalidatePath(`/availability/${input.pollId}`);
  return { pollId: input.pollId };
}
