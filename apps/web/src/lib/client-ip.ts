import "server-only";

import { isIP } from "node:net";
import { ipAddress } from "@vercel/functions";
import { env } from "@/env";

// Opt in only behind a proxy that overwrites X-Real-IP, with direct access to
// the application blocked. A header cannot prove the identity of its sender.
const trustProxy = env.TRUST_PROXY_X_REAL_IP === "true";
if (trustProxy && env.NEXT_PUBLIC_SELF_HOSTED !== "true") {
  throw new Error(
    "TRUST_PROXY_X_REAL_IP requires NEXT_PUBLIC_SELF_HOSTED=true",
  );
}

function getTrustedProxyIp(headers: Headers) {
  const value = headers.get("x-real-ip")?.trim();
  // Never fall back to caller-controlled forwarding headers if the trusted
  // header is missing, malformed, or contains a chain of multiple addresses.
  return value && isIP(value) ? value : undefined;
}

/** Preserve the existing first-XFF behavior unless proxy trust is explicit. */
export function getClientIp(headers: Headers) {
  return trustProxy
    ? getTrustedProxyIp(headers)
    : headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

/** Better Auth applies the same single-header policy to sessions and quotas. */
export const trustedProxyAuthIpAddress = trustProxy
  ? { ipAddressHeaders: ["x-real-ip"] }
  : undefined;

export function getTrpcClientIdentity(headers: Headers, userId?: string) {
  const ip = trustProxy
    ? (getTrustedProxyIp(headers) ?? "unknown")
    : (ipAddress(headers) ?? "127.0.0.1");
  // JA4 is supplied by Vercel in cloud mode, but is caller-controlled behind
  // our own edge. It must not let a visitor choose a new rate-limit bucket.
  const ja4Digest = trustProxy
    ? undefined
    : (headers.get("x-vercel-ja4-digest") ?? undefined);
  return { ip, ja4Digest, identifier: userId ?? ja4Digest ?? ip };
}
