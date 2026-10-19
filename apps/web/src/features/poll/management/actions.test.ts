import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  admin: vi.fn(),
  record: vi.fn(),
  replace: vi.fn(),
  limit: vi.fn(),
  setCookie: vi.fn(),
  cookieValues: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookieValues.get(name);
      return value ? { value } : undefined;
    },
    set: mocks.setCookie,
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.23" }),
}));
vi.mock("@/lib/auth", () => ({ getSessionState: mocks.session }));
vi.mock("@/features/user/data", () => ({ getUser: mocks.user }));
vi.mock("@/features/poll/data", () => ({ hasPollAdminAccess: mocks.admin }));
vi.mock("./data", () => ({ getPollManagementRecord: mocks.record }));
vi.mock("./mutations", () => ({ replaceManagementTokenHash: mocks.replace }));
vi.mock("@/lib/rate-limit", () => ({
  createRatelimit: () => ({ limit: mocks.limit }),
}));
vi.mock("@/lib/safe-action/server", () => ({
  actionClient: {
    metadata: () => ({
      inputSchema: (schema: ZodType) => ({
        action:
          (callback: (args: { parsedInput: unknown }) => Promise<unknown>) =>
          (input: unknown) =>
            callback({ parsedInput: schema.parse(input) }),
      }),
    }),
  },
}));

import {
  issuePollManagementLinkAction,
  redeemPollManagementLinkAction,
} from "./actions";
import { loadPollAdminAccess, loadPollManagementAccess } from "./loaders";
import {
  createManagementToken,
  hashManagementToken,
  managementCookieName,
} from "./utils";

type Record = {
  id: string;
  managementTokenHash: string | null;
  schedulingMode: "options" | "availability";
};
const records = new Map<string, Record>();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieValues.clear();
  records.clear();
  records.set("poll-a", {
    id: "poll-a",
    managementTokenHash: null,
    schedulingMode: "availability",
  });
  mocks.session.mockResolvedValue({
    status: "authenticated",
    session: { user: { id: "creator" } },
  });
  mocks.user.mockResolvedValue({
    id: "creator",
    banned: false,
    deletedAt: null,
  });
  mocks.admin.mockImplementation(
    async (pollId, userId) => pollId === "poll-a" && userId === "creator",
  );
  mocks.record.mockImplementation(
    async (pollId) => records.get(pollId) ?? null,
  );
  mocks.replace.mockImplementation(async (pollId, previousHash, nextHash) => {
    const record = records.get(pollId);
    if (!record || record.managementTokenHash !== previousHash) return false;
    records.set(pollId, { ...record, managementTokenHash: nextHash });
    return true;
  });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.setCookie.mockImplementation((name, value) =>
    mocks.cookieValues.set(name, value),
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("organizer capability issuance", () => {
  it("mints a strong token for the authenticated owner and persists only its hash", async () => {
    const result = await issuePollManagementLinkAction({
      pollId: "poll-a",
      replace: false,
    });
    const token = mocks.cookieValues.get(managementCookieName("poll-a"));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(records.get("poll-a")?.managementTokenHash).toBe(
      hashManagementToken(token as string),
    );
    expect(mocks.replace).toHaveBeenCalledWith(
      "poll-a",
      null,
      hashManagementToken(token as string),
    );
    expect(result).toEqual({
      path: `/manage/poll-a#${token}`,
      needsReplacement: false,
    });
    expect(mocks.setCookie).toHaveBeenCalledWith(
      managementCookieName("poll-a"),
      token,
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 15_552_000,
      },
    );
  });

  it("denies a stranger who guesses the poll ID", async () => {
    mocks.session.mockResolvedValue({ status: "unauthenticated" });
    await expect(
      issuePollManagementLinkAction({ pollId: "poll-a", replace: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: "creator", banned: true },
    { id: "creator", deletedAt: new Date() },
  ])("checks fresh actor state before using even an existing organizer cookie", async (actor) => {
    const token = createManagementToken();
    records.set("poll-a", {
      id: "poll-a",
      managementTokenHash: hashManagementToken(token),
      schedulingMode: "availability",
    });
    mocks.cookieValues.set(managementCookieName("poll-a"), token);
    mocks.user.mockResolvedValue(actor);
    await expect(
      issuePollManagementLinkAction({ pollId: "poll-a", replace: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("fails closed when session verification is unavailable", async () => {
    mocks.session.mockResolvedValue({ status: "error" });
    await expect(
      issuePollManagementLinkAction({ pollId: "poll-a", replace: false }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("reuses a valid cookie without rotating the saved link", async () => {
    const token = createManagementToken();
    records.set("poll-a", {
      id: "poll-a",
      managementTokenHash: hashManagementToken(token),
      schedulingMode: "availability",
    });
    mocks.cookieValues.set(managementCookieName("poll-a"), token);
    mocks.session.mockResolvedValue({ status: "unauthenticated" });
    const result = await issuePollManagementLinkAction({
      pollId: "poll-a",
      replace: false,
    });
    expect(result).toEqual({
      path: `/manage/poll-a#${token}`,
      needsReplacement: false,
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("requires explicit replacement when another device already has a link", async () => {
    const token = createManagementToken();
    records.set("poll-a", {
      id: "poll-a",
      managementTokenHash: hashManagementToken(token),
      schedulingMode: "availability",
    });
    expect(
      await issuePollManagementLinkAction({ pollId: "poll-a", replace: false }),
    ).toEqual({ path: null, needsReplacement: true });
    expect(mocks.replace).not.toHaveBeenCalled();
    await issuePollManagementLinkAction({ pollId: "poll-a", replace: true });
    expect(records.get("poll-a")?.managementTokenHash).not.toBe(
      hashManagementToken(token),
    );
    mocks.cookieValues.set(managementCookieName("poll-a"), token);
    expect(await loadPollManagementAccess("poll-a")).toBe(false);
  });

  it("does not publish a token that lost the compare-and-swap race", async () => {
    mocks.replace.mockResolvedValue(false);
    await expect(
      issuePollManagementLinkAction({ pollId: "poll-a", replace: false }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("rate-limits before issuing or redeeming credentials", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    await expect(
      issuePollManagementLinkAction({ pollId: "poll-a", replace: false }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(
      redeemPollManagementLinkAction({
        pollId: "poll-a",
        token: createManagementToken(),
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});

describe("organizer capability redemption and scope", () => {
  it("redeems to a secure, HTTP-only, host-only cookie and the correct mode route", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const token = createManagementToken();
    records.set("poll-a", {
      id: "poll-a",
      managementTokenHash: hashManagementToken(token),
      schedulingMode: "availability",
    });
    expect(
      await redeemPollManagementLinkAction({ pollId: "poll-a", token }),
    ).toEqual({ destination: "/availability/poll-a" });
    expect(mocks.setCookie).toHaveBeenCalledWith(
      managementCookieName("poll-a"),
      token,
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: "lax",
      }),
    );
    expect(mocks.setCookie.mock.calls[0][2]).not.toHaveProperty("domain");
    records.set("poll-a", {
      id: "poll-a",
      managementTokenHash: hashManagementToken(token),
      schedulingMode: "options",
    });
    expect(
      await redeemPollManagementLinkAction({ pollId: "poll-a", token }),
    ).toEqual({ destination: "/poll/poll-a" });
  });

  it("rejects a forged token, a revoked token, and a token for another poll", async () => {
    const token = createManagementToken();
    records.set("poll-a", {
      id: "poll-a",
      managementTokenHash: hashManagementToken(token),
      schedulingMode: "availability",
    });
    records.set("poll-b", {
      id: "poll-b",
      managementTokenHash: hashManagementToken(createManagementToken()),
      schedulingMode: "options",
    });
    await expect(
      redeemPollManagementLinkAction({
        pollId: "poll-a",
        token: createManagementToken(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      redeemPollManagementLinkAction({ pollId: "poll-b", token }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    records.set("poll-a", {
      id: "poll-a",
      managementTokenHash: hashManagementToken(createManagementToken()),
      schedulingMode: "availability",
    });
    await expect(
      redeemPollManagementLinkAction({ pollId: "poll-a", token }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("an unavailable poll or creator cannot redeem a formerly valid token", async () => {
    const token = createManagementToken();
    mocks.record.mockResolvedValue(null);
    await expect(
      redeemPollManagementLinkAction({ pollId: "poll-a", token }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("a capability cookie authorizes only its own poll", async () => {
    const token = createManagementToken();
    records.set("poll-a", {
      id: "poll-a",
      managementTokenHash: hashManagementToken(token),
      schedulingMode: "availability",
    });
    records.set("poll-b", {
      id: "poll-b",
      managementTokenHash: hashManagementToken(createManagementToken()),
      schedulingMode: "options",
    });
    mocks.cookieValues.set(managementCookieName("poll-a"), token);
    expect(await loadPollAdminAccess("poll-a")).toBe(true);
    expect(await loadPollAdminAccess("poll-b")).toBe(false);
    mocks.cookieValues.set(managementCookieName("poll-b"), token);
    expect(await loadPollAdminAccess("poll-b")).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
