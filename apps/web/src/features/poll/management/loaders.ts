import "server-only";
import { cookies } from "next/headers";
import { hasPollAdminAccess } from "@/features/poll/data";
import { getPollManagementRecord } from "./data";
import { managementCookieName, verifyManagementToken } from "./utils";

/** A capability for exactly one poll; it never signs in as its creator. */
export async function loadPollManagementAccess(
  pollId: string,
): Promise<boolean> {
  const token = (await cookies()).get(managementCookieName(pollId))?.value;
  if (!token) return false;
  const poll = await getPollManagementRecord(pollId);
  return !!poll && verifyManagementToken(token, poll.managementTokenHash);
}

export async function loadPollAdminAccess(
  pollId: string,
  userId?: string,
): Promise<boolean> {
  return (
    (userId ? await hasPollAdminAccess(pollId, userId) : false) ||
    (await loadPollManagementAccess(pollId))
  );
}
