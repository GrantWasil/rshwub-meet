"use server";

import { cookies, headers } from "next/headers";
import * as z from "zod";
import { getUser } from "@/features/user/data";
import { getSessionState } from "@/lib/auth";
import { AppError } from "@/lib/errors/app-error";
import { createRatelimit } from "@/lib/rate-limit";
import { actionClient } from "@/lib/safe-action/server";
import { getPollManagementRecord } from "./data";
import { loadPollAdminAccess } from "./loaders";
import { replaceManagementTokenHash } from "./mutations";
import {
  createManagementToken,
  hashManagementToken,
  managementCookieName,
  verifyManagementToken,
} from "./utils";

const limiter = createRatelimit(30, "1m");
const pollIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);

async function limitRequests(pollId: string) {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limiter && !(await limiter.limit(`management:${ip}:${pollId}`)).success) {
    throw new AppError({
      code: "TOO_MANY_REQUESTS",
      message: "Please try again shortly.",
    });
  }
}

async function storeCookie(pollId: string, token: string) {
  (await cookies()).set(managementCookieName(pollId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export const issuePollManagementLinkAction = actionClient
  .metadata({ actionName: "issuePollManagementLink" })
  .inputSchema(
    z.object({ pollId: pollIdSchema, replace: z.boolean().default(false) }),
  )
  .action(async ({ parsedInput: { pollId, replace } }) => {
    await limitRequests(pollId);
    const state = await getSessionState();
    if (state.status === "error")
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message: "Unable to read your session.",
      });
    const session = state.status === "authenticated" ? state.session : null;
    const actor = session?.user ? await getUser(session.user.id) : null;
    if (session?.user && (!actor || actor.banned || actor.deletedAt)) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Account unavailable.",
      });
    }
    if (!(await loadPollAdminAccess(pollId, actor?.id))) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Organizer access required.",
      });
    }
    const poll = await getPollManagementRecord(pollId);
    if (!poll)
      throw new AppError({ code: "NOT_FOUND", message: "Poll not found." });
    const existing = (await cookies()).get(managementCookieName(pollId))?.value;
    if (
      !replace &&
      existing &&
      verifyManagementToken(existing, poll.managementTokenHash)
    ) {
      return { path: `/manage/${pollId}#${existing}`, needsReplacement: false };
    }
    if (!replace && poll.managementTokenHash)
      return { path: null, needsReplacement: true };
    const token = createManagementToken();
    if (
      !(await replaceManagementTokenHash(
        pollId,
        poll.managementTokenHash,
        hashManagementToken(token),
      ))
    ) {
      throw new AppError({
        code: "TOO_MANY_REQUESTS",
        message: "Another tab created a link. Please retry.",
      });
    }
    await storeCookie(pollId, token);
    return { path: `/manage/${pollId}#${token}`, needsReplacement: false };
  });

export const redeemPollManagementLinkAction = actionClient
  .metadata({ actionName: "redeemPollManagementLink" })
  .inputSchema(
    z.object({
      pollId: pollIdSchema,
      token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    }),
  )
  .action(async ({ parsedInput: { pollId, token } }) => {
    await limitRequests(pollId);
    const poll = await getPollManagementRecord(pollId);
    if (!poll || !verifyManagementToken(token, poll.managementTokenHash)) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "This private link is invalid or has been replaced.",
      });
    }
    await storeCookie(pollId, token);
    return {
      destination:
        poll.schedulingMode === "availability"
          ? `/availability/${pollId}`
          : `/poll/${pollId}`,
    };
  });
