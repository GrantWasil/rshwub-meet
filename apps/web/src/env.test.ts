import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", undefined);
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  vi.stubEnv("SECRET_PASSWORD", "test-secret-for-validation-only-123456789");
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://meet.example.com");
  vi.stubEnv("SUPPORT_EMAIL", "support@example.com");
  vi.stubEnv("SMTP_USER", undefined);
  vi.stubEnv("SMTP_PWD", undefined);
  vi.stubEnv("SKIP_ENV_VALIDATION", undefined);
  vi.stubEnv("TRUST_PROXY_X_REAL_IP", undefined);
  vi.stubEnv("NEXT_PUBLIC_SELF_HOSTED", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("trusted proxy environment configuration", () => {
  it("defaults to not trusting the proxy", async () => {
    const { env } = await import("./env");
    expect(env.TRUST_PROXY_X_REAL_IP).toBe("false");
  });

  it("rejects opt-in outside self-hosted mode", async () => {
    vi.stubEnv("TRUST_PROXY_X_REAL_IP", "true");
    await expect(import("./env")).rejects.toThrow(
      "Invalid environment variables",
    );
  });

  it("accepts an explicit self-hosted opt-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_HOSTED", "true");
    vi.stubEnv("TRUST_PROXY_X_REAL_IP", "true");
    const { env } = await import("./env");
    expect(env.TRUST_PROXY_X_REAL_IP).toBe("true");
  });

  it("rejects misspelled flag values", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_HOSTED", "true");
    vi.stubEnv("TRUST_PROXY_X_REAL_IP", "yes");
    await expect(import("./env")).rejects.toThrow(
      "Invalid environment variables",
    );
  });
});
