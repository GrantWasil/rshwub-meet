import "server-only";

import { cache } from "react";
import { loadPollAdminAccess } from "@/features/poll/management/loaders";
import { getUser } from "@/features/user/data";
import { getSessionState } from "@/lib/auth";
import { AppError } from "@/lib/errors/app-error";
import { InvalidSessionError } from "@/lib/errors/invalid-session-error";
import { getAvailabilityPoll, getCurrentAvailabilityParticipant } from "./data";
import type { AvailabilityPoll } from "./types";

/** Guests are actors too; verify current database state rather than the cookie snapshot. */
export const loadAvailabilityActor = cache(async () => {
  const state = await getSessionState();
  if (state.status === "error")
    throw new AppError({
      code: "SERVICE_UNAVAILABLE",
      message: "Unable to read your session",
    });
  if (state.status === "unauthenticated") return null;
  const actor = await getUser(state.session.user.id);
  if (!actor || actor.banned || actor.deletedAt)
    throw new InvalidSessionError();
  return actor;
});

export const loadAvailabilityPoll = cache(
  async (
    pollId: string,
    responseToken?: string,
  ): Promise<AvailabilityPoll | null> => {
    const actor = await loadAvailabilityActor();
    const canManage = await loadPollAdminAccess(pollId, actor?.id);
    const [poll, currentParticipant] = await Promise.all([
      getAvailabilityPoll(pollId, canManage),
      getCurrentAvailabilityParticipant({
        pollId,
        actorUserId: actor?.id,
        responseToken,
      }),
    ]);
    return poll ? { ...poll, currentParticipant, canManage } : null;
  },
);
