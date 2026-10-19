import "server-only";
import { prisma } from "@rallly/database";

export async function getPollManagementRecord(pollId: string) {
  return prisma.poll.findFirst({
    where: {
      id: pollId,
      deleted: false,
      user: { banned: false, deletedAt: null },
    },
    select: { id: true, managementTokenHash: true, schedulingMode: true },
  });
}
