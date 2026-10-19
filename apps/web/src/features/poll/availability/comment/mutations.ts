import "server-only";

import { prisma } from "@rallly/database";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors/app-error";

export async function addAvailabilityComment(input: {
  pollId: string;
  userId: string;
  authorName: string;
  content: string;
}) {
  const comment = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM polls WHERE id = ${input.pollId} FOR UPDATE`;
    const poll = await tx.poll.findFirst({
      where: {
        id: input.pollId,
        deleted: false,
        schedulingMode: "availability",
        status: "open",
        disableComments: false,
        user: { banned: false, deletedAt: null },
      },
      select: { id: true },
    });
    if (!poll)
      throw new AppError({ code: "FORBIDDEN", message: "Comments are closed" });
    return tx.comment.create({ data: input, select: { id: true } });
  });
  revalidatePath(`/availability/${input.pollId}`);
  return comment;
}

export async function deleteAvailabilityComment(input: {
  pollId: string;
  commentId: string;
}) {
  await prisma.comment.deleteMany({
    where: { id: input.commentId, pollId: input.pollId },
  });
  revalidatePath(`/availability/${input.pollId}`);
  return { deleted: true };
}
