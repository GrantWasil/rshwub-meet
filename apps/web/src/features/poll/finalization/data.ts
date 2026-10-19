import "server-only";

import { prisma } from "@rallly/database";
import { getScheduledEventTimes } from "./utils";

export async function getFinalizedPollCalendarData(pollId: string) {
  const poll = await prisma.poll.findFirst({
    where: {
      id: pollId,
      deleted: false,
      status: "scheduled",
      schedulingMode: "options",
      user: { banned: false, deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      timeZone: true,
      finalizedOption: {
        select: { id: true, pollId: true, startTime: true, duration: true },
      },
    },
  });
  if (!poll?.finalizedOption || poll.finalizedOption.pollId !== poll.id)
    return null;
  return {
    uid: `${poll.id}-${poll.finalizedOption.id}@meet.rshwub.com`,
    title: poll.title,
    description: poll.description ?? undefined,
    location: poll.location ?? undefined,
    ...getScheduledEventTimes({
      ...poll.finalizedOption,
      timeZone: poll.timeZone,
    }),
  };
}
