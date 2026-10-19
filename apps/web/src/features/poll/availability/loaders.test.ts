import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionState: mocks.session }));
vi.mock("@/features/user/data", () => ({ getUser: mocks.user }));
vi.mock("@/features/poll/management/loaders", () => ({
  loadPollAdminAccess: vi.fn(),
}));
vi.mock("./data", () => ({
  getAvailabilityPoll: vi.fn(),
  getCurrentAvailabilityParticipant: vi.fn(),
}));

import { loadAvailabilityActor } from "./loaders";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    status: "authenticated",
    session: { user: { id: "guest", banned: false } },
  });
});

it("accepts an active guest from the database", async () => {
  mocks.user.mockResolvedValue({ id: "guest", isGuest: true, banned: false });
  expect(await loadAvailabilityActor()).toEqual({
    id: "guest",
    isGuest: true,
    banned: false,
  });
  expect(mocks.user).toHaveBeenCalledWith("guest");
});

it.each([
  null,
  { id: "guest", banned: true },
  { id: "guest", deletedAt: new Date() },
])("rejects stale sessions for missing, banned, or deleted users", async (user) => {
  mocks.user.mockResolvedValue(user);
  await expect(loadAvailabilityActor()).rejects.toMatchObject({
    name: "InvalidSessionError",
  });
});

it("distinguishes missing sessions from auth service failures", async () => {
  mocks.session.mockResolvedValue({ status: "unauthenticated" });
  expect(await loadAvailabilityActor()).toBeNull();
  mocks.session.mockResolvedValue({ status: "error" });
  await expect(loadAvailabilityActor()).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
  });
  expect(mocks.user).not.toHaveBeenCalled();
});
