"use server";

import { loadAvailabilityActor } from "@/features/poll/availability/loaders";
import { loadPollAdminAccess } from "@/features/poll/management/loaders";
import { AppError } from "@/lib/errors/app-error";
import { createRatelimit } from "@/lib/rate-limit";
import { actionClient } from "@/lib/safe-action/server";
import {
  changeAvailabilityPollStatus,
  deleteAvailabilityPoll,
  editAvailabilityPoll,
} from "./mutations";
import {
  changeAvailabilityPollStatusSchema,
  editAvailabilityPollSchema,
  manageAvailabilityPollSchema,
} from "./schema";

const manageLimit = createRatelimit(30, "1 m");

async function authorize(pollId: string) {
  const actor = await loadAvailabilityActor();
  if (!(await loadPollAdminAccess(pollId, actor?.id))) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Only the organizer can manage this poll",
    });
  }
  if (
    manageLimit &&
    !(await manageLimit.limit(`availability:manage:${actor?.id ?? pollId}`))
      .success
  ) {
    throw new AppError({
      code: "TOO_MANY_REQUESTS",
      message: "Please wait before trying again",
    });
  }
  return actor?.id;
}

export const editAvailabilityPollAction = actionClient
  .metadata({ actionName: "edit_availability_poll" })
  .inputSchema(editAvailabilityPollSchema)
  .action(async ({ parsedInput }) => {
    const userId = await authorize(parsedInput.pollId);
    return editAvailabilityPoll({ input: parsedInput, userId });
  });

export const changeAvailabilityPollStatusAction = actionClient
  .metadata({ actionName: "change_availability_poll_status" })
  .inputSchema(changeAvailabilityPollStatusSchema)
  .action(async ({ parsedInput }) => {
    const userId = await authorize(parsedInput.pollId);
    return changeAvailabilityPollStatus({ input: parsedInput, userId });
  });

export const deleteAvailabilityPollAction = actionClient
  .metadata({ actionName: "delete_availability_poll" })
  .inputSchema(manageAvailabilityPollSchema)
  .action(async ({ parsedInput }) => {
    await authorize(parsedInput.pollId);
    return deleteAvailabilityPoll(parsedInput.pollId);
  });
