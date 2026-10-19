import "server-only";
import { prisma } from "@rallly/database";

/** Compare-and-swap prevents concurrent tabs from silently invalidating a new link. */
export async function replaceManagementTokenHash(
  pollId: string,
  previousHash: string | null,
  nextHash: string,
) {
  const result = await prisma.poll.updateMany({
    where: { id: pollId, deleted: false, managementTokenHash: previousHash },
    data: { managementTokenHash: nextHash },
  });
  return result.count === 1;
}
