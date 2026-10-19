"use server";

import { loadPollAdminAccess } from "@/features/poll/management/loaders";
import { getActiveSpaceForUser } from "@/features/space/data";
import { AppError } from "@/lib/errors/app-error";
import { createRatelimit } from "@/lib/rate-limit";
import { actionClient } from "@/lib/safe-action/server";
import {
  getAvailabilityResponseAccess,
  getCurrentAvailabilityParticipant,
} from "./data";
import { loadAvailabilityActor } from "./loaders";
import {
  createAvailabilityPoll,
  finalizeAvailabilityPoll,
  saveAvailabilityResponse,
} from "./mutations";
import {
  createAvailabilityPollSchema,
  finalizeAvailabilityPollSchema,
  saveAvailabilityResponseSchema,
} from "./schema";
import { canEditAvailabilityResponse } from "./utils";

// Keep limiter instances alive across requests, including the self-hosted
// in-memory fallback. These are abuse bounds, never a simultaneous-poll cap.
const createLimit = createRatelimit(20, "1 h");
const responseLimit = createRatelimit(60, "1 m");
const finalizeLimit = createRatelimit(20, "1 m");

async function limit(limiter: ReturnType<typeof createRatelimit>, key: string) {
  if (limiter && !(await limiter.limit(key)).success)
    throw new AppError({
      code: "TOO_MANY_REQUESTS",
      message: "Please wait before trying again",
    });
}

export const createAvailabilityPollAction = actionClient
  .metadata({ actionName: "create_availability_poll" })
  .inputSchema(createAvailabilityPollSchema)
  .action(async ({ parsedInput }) => {
    const actor = await loadAvailabilityActor();
    if (!actor)
      throw new AppError({
        code: "UNAUTHORIZED",
        message: "Create a guest session before creating a poll",
      });
    await limit(createLimit, `availability:create:${actor.id}`);
    const activeSpace = actor.isGuest
      ? null
      : await getActiveSpaceForUser(actor.id);
    return createAvailabilityPoll({
      userId: actor.id,
      spaceId: activeSpace?.id,
      input: parsedInput,
    });
  });

export const saveAvailabilityResponseAction = actionClient
  .metadata({ actionName: "save_availability_response" })
  .inputSchema(saveAvailabilityResponseSchema)
  .action(async ({ parsedInput }) => {
    const actor = await loadAvailabilityActor();
    const canManage = await loadPollAdminAccess(parsedInput.pollId, actor?.id);
    const current = parsedInput.participantId
      ? null
      : await getCurrentAvailabilityParticipant({
          pollId: parsedInput.pollId,
          actorUserId: actor?.id,
          responseToken: parsedInput.responseToken,
        });
    const participantId = parsedInput.participantId ?? current?.id;
    if (participantId) {
      const participant = await getAvailabilityResponseAccess(
        parsedInput.pollId,
        participantId,
        parsedInput.responseToken,
      );
      if (!participant)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Response not found",
        });
      if (
        !canEditAvailabilityResponse({
          actorUserId: actor?.id,
          participantUserId: participant.userId,
          canManage,
          tokenMatches: participant.tokenMatches,
        })
      )
        throw new AppError({
          code: "FORBIDDEN",
          message: "You cannot edit this response",
        });
    } else if (!actor)
      throw new AppError({
        code: "UNAUTHORIZED",
        message: "Create a guest session before responding",
      });
    await limit(
      responseLimit,
      `availability:response:${actor?.id ?? participantId}`,
    );
    return saveAvailabilityResponse({
      userId: actor?.id,
      participantId,
      input: parsedInput,
    });
  });

export const finalizeAvailabilityPollAction = actionClient
  .metadata({ actionName: "finalize_availability_poll" })
  .inputSchema(finalizeAvailabilityPollSchema)
  .action(async ({ parsedInput }) => {
    const actor = await loadAvailabilityActor();
    if (!(await loadPollAdminAccess(parsedInput.pollId, actor?.id)))
      throw new AppError({
        code: "FORBIDDEN",
        message: "Only the organizer can choose the final time",
      });
    await limit(
      finalizeLimit,
      `availability:finalize:${actor?.id ?? parsedInput.pollId}`,
    );
    return finalizeAvailabilityPoll({ userId: actor?.id, input: parsedInput });
  });
