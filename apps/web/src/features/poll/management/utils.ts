import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createManagementToken() {
  return randomBytes(32).toString("base64url");
}

export function hashManagementToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyManagementToken(
  token: string,
  expectedHash: string | null,
) {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !expectedHash ||
    !/^[a-f0-9]{64}$/.test(expectedHash)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(hashManagementToken(token), "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}

export function managementCookieName(pollId: string) {
  return `rshwub_manage_${pollId}`;
}
