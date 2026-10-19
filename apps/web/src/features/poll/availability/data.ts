import "server-only";

import { prisma } from "@rallly/database";
import {
  availabilityConfigSchema,
  availabilityIntervalsSchema,
} from "./schema";
import type { AvailabilityParticipant } from "./types";

const participantSelect = { id: true, name: true, availability: true } as const;

function toParticipant(row: {
  id: string;
  name: string;
  availability: unknown;
}): AvailabilityParticipant {
  return {
    id: row.id,
    name: row.name,
    intervals: availabilityIntervalsSchema.parse(row.availability ?? []),
  };
}

export async function getAvailabilityPoll(pollId: string, canManage = false) {
  const poll = await prisma.poll.findFirst({
    where: {
      id: pollId,
      deleted: false,
      schedulingMode: "availability",
      user: { banned: false, deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      status: true,
      availabilityConfig: true,
      hideParticipants: true,
      hideScores: true,
      participants: {
        select: participantSelect,
        orderBy: { createdAt: "asc" },
      },
      options: {
        select: { startTime: true, duration: true },
        take: 1,
        orderBy: { startTime: "asc" },
      },
    },
  });
  if (!poll) return null;
  const config = availabilityConfigSchema.parse(poll.availabilityConfig);
  const option = poll.status === "scheduled" ? poll.options[0] : undefined;
  return {
    id: poll.id,
    title: poll.title,
    description: poll.description,
    location: poll.location,
    status: poll.status,
    config,
    participants:
      canManage || (!poll.hideParticipants && !poll.hideScores)
        ? poll.participants.map(toParticipant)
        : [],
    finalized: option
      ? {
          start: option.startTime.toISOString(),
          end: new Date(
            option.startTime.getTime() + option.duration * 60_000,
          ).toISOString(),
        }
      : null,
  };
}

export async function getCurrentAvailabilityParticipant({
  pollId,
  actorUserId,
  responseToken,
}: {
  pollId: string;
  actorUserId?: string;
  responseToken?: string;
}) {
  if (!actorUserId && !responseToken) return null;
  const participant = await prisma.participant.findFirst({
    where: {
      pollId,
      poll: {
        deleted: false,
        schedulingMode: "availability",
        user: { banned: false, deletedAt: null },
      },
      ...(responseToken ? { token: responseToken } : { userId: actorUserId }),
    },
    select: participantSelect,
    orderBy: { createdAt: "asc" },
  });
  return participant ? toParticipant(participant) : null;
}

export async function getAvailabilityResponseAccess(
  pollId: string,
  participantId: string,
  responseToken?: string,
) {
  const participant = await prisma.participant.findFirst({
    where: {
      id: participantId,
      pollId,
      poll: {
        deleted: false,
        schedulingMode: "availability",
        user: { banned: false, deletedAt: null },
      },
    },
    select: { id: true, userId: true },
  });
  if (!participant) return null;
  const tokenMatches = responseToken
    ? !!(await prisma.participant.findFirst({
        where: { id: participantId, pollId, token: responseToken },
        select: { id: true },
      }))
    : false;
  return { ...participant, tokenMatches };
}

export async function getAvailabilityCalendarData(pollId: string) {
  const poll = await prisma.poll.findFirst({
    where: {
      id: pollId,
      schedulingMode: "availability",
      status: "scheduled",
      deleted: false,
      user: { banned: false, deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      timeZone: true,
      options: {
        select: { id: true, startTime: true, duration: true },
        take: 1,
        orderBy: { startTime: "asc" },
      },
    },
  });
  if (!poll || !poll.options[0]) return null;
  const option = poll.options[0];
  return {
    uid: `${poll.id}-${option.id}@meet.rshwub.com`,
    title: poll.title,
    description: poll.description ?? undefined,
    location: poll.location ?? undefined,
    timeZone: poll.timeZone ?? "UTC",
    start: option.startTime,
    end: new Date(option.startTime.getTime() + option.duration * 60_000),
  };
}
