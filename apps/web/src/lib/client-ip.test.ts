import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  TRUST_PROXY_X_REAL_IP: "true",
  NEXT_PUBLIC_SELF_HOSTED: "true",
}));
vi.mock("@/env", () => ({ env: config }));

beforeEach(() => {
  vi.resetModules();
  config.TRUST_PROXY_X_REAL_IP = "true";
  config.NEXT_PUBLIC_SELF_HOSTED = "true";
});

describe("explicitly trusted proxy IP", () => {
  it("ignores spoofed forwarding chains and JA4 when selecting quota keys", async () => {
    const { getClientIp, getTrpcClientIdentity } = await import("./client-ip");
    for (const spoof of ["198.51.100.9", "198.51.100.10, 192.0.2.55"]) {
      const headers = new Headers({
        "x-real-ip": "203.0.113.7",
        "x-forwarded-for": spoof,
        "cf-connecting-ip": spoof,
        "x-vercel-ja4-digest": spoof,
      });
      expect(getClientIp(headers)).toBe("203.0.113.7");
      expect(getTrpcClientIdentity(headers)).toEqual({
        ip: "203.0.113.7",
        ja4Digest: undefined,
        identifier: "203.0.113.7",
      });
      expect(getTrpcClientIdentity(headers, "guest-id").identifier).toBe(
        "guest-id",
      );
    }
  });

  it("keeps independently resolved IPv4 and IPv6 visitors distinct", async () => {
    const { getTrpcClientIdentity } = await import("./client-ip");
    const identities = ["203.0.113.7", "203.0.113.8", "2001:db8::1"].map(
      (ip) =>
        getTrpcClientIdentity(new Headers({ "x-real-ip": ip })).identifier,
    );
    expect(new Set(identities).size).toBe(3);
  });

  it.each([
    undefined,
    "",
    "not-an-ip",
    "203.0.113.7, 203.0.113.8",
    "203.0.113.7:80",
    "[2001:db8::1]",
  ])("uses a shared fallback for missing or malformed trusted header %s without accepting other headers", async (value) => {
    const { getClientIp, getTrpcClientIdentity } = await import("./client-ip");
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.9",
      "cf-connecting-ip": "198.51.100.10",
      "x-vercel-ja4-digest": "spoofed",
      ...(value === undefined ? {} : { "x-real-ip": value }),
    });
    expect(getClientIp(headers)).toBeUndefined();
    expect(getTrpcClientIdentity(headers)).toEqual({
      ip: "unknown",
      ja4Digest: undefined,
      identifier: "unknown",
    });
  });

  it("configures Better Auth to use only the proxy-overwritten single header", async () => {
    const { trustedProxyAuthIpAddress } = await import("./client-ip");
    expect(trustedProxyAuthIpAddress).toEqual({
      ipAddressHeaders: ["x-real-ip"],
    });
    expect(trustedProxyAuthIpAddress).not.toHaveProperty("trustedProxies");
    expect(trustedProxyAuthIpAddress).not.toHaveProperty("disableIpTracking");
  });

  it("rejects opt-in outside self-hosted mode even if environment validation was skipped", async () => {
    config.NEXT_PUBLIC_SELF_HOSTED = "false";
    await expect(import("./client-ip")).rejects.toThrow(
      "requires NEXT_PUBLIC_SELF_HOSTED=true",
    );
  });
});

describe("default deployment behavior", () => {
  it.each([
    "true",
    "false",
  ])("preserves existing IP and JA4 semantics when opt-in is false (self-hosted=%s)", async (selfHosted) => {
    config.TRUST_PROXY_X_REAL_IP = "false";
    config.NEXT_PUBLIC_SELF_HOSTED = selfHosted;
    const { getClientIp, getTrpcClientIdentity, trustedProxyAuthIpAddress } =
      await import("./client-ip");
    const headers = new Headers({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.9, 192.0.2.55",
      "x-vercel-ja4-digest": "vercel-ja4",
    });
    expect(getClientIp(headers)).toBe("198.51.100.9");
    expect(getTrpcClientIdentity(headers)).toEqual({
      ip: "203.0.113.7",
      ja4Digest: "vercel-ja4",
      identifier: "vercel-ja4",
    });
    expect(getTrpcClientIdentity(headers, "user-id").identifier).toBe(
      "user-id",
    );
    expect(getTrpcClientIdentity(new Headers())).toEqual({
      ip: "127.0.0.1",
      ja4Digest: undefined,
      identifier: "127.0.0.1",
    });
    expect(trustedProxyAuthIpAddress).toBeUndefined();
  });
});
