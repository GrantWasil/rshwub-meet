import "server-only";

import { prisma } from "@rallly/database";

export async function getAvailabilityCommentPoll(pollId: string) {
  return prisma.poll.findFirst({
    where: {
      id: pollId,
      deleted: false,
      schedulingMode: "availability",
      user: { banned: false, deletedAt: null },
    },
    select: { id: true, status: true, disableComments: true },
  });
}

export async function getAvailabilityComment(
  pollId: string,
  commentId: string,
) {
  return prisma.comment.findFirst({
    where: {
      id: commentId,
      pollId,
      poll: {
        deleted: false,
        schedulingMode: "availability",
        user: { banned: false, deletedAt: null },
      },
    },
    select: { id: true, userId: true },
  });
}
