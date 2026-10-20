import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  manage: vi.fn(),
  current: vi.fn(),
  response: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  finalize: vi.fn(),
  limit: vi.fn(),
  activeSpace: vi.fn(),
}));
vi.mock("./loaders", () => ({ loadAvailabilityActor: mocks.actor }));
vi.mock("@/features/space/data", () => ({
  getActiveSpaceForUser: mocks.activeSpace,
}));
vi.mock("@/features/poll/management/loaders", () => ({
  loadPollAdminAccess: mocks.manage,
}));
vi.mock("./data", () => ({
  getCurrentAvailabilityParticipant: mocks.current,
  getAvailabilityResponseAccess: mocks.response,
}));
vi.mock("./mutations", () => ({
  createAvailabilityPoll: mocks.create,
  saveAvailabilityResponse: mocks.save,
  finalizeAvailabilityPoll: mocks.finalize,
}));
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
  createAvailabilityPollAction,
  finalizeAvailabilityPollAction,
  saveAvailabilityResponseAction,
} from "./actions";

const responseInput = {
  pollId: "poll",
  participantId: "response",
  name: "Alex",
  intervals: [],
};
const config = {
  mode: "dates" as const,
  dates: ["2026-10-20"],
  timeZone: "America/Denver",
  startMinute: 1080,
  endMinute: 1320,
  slotMinutes: 30 as const,
  durationMinutes: 120,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(null);
  mocks.manage.mockResolvedValue(false);
  mocks.current.mockResolvedValue(null);
  mocks.response.mockResolvedValue({
    id: "response",
    userId: "owner",
    tokenMatches: false,
  });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.activeSpace.mockResolvedValue({ id: "space" });
});

describe("availability action authorization", () => {
  it("requires a real guest or account session to create a poll", async () => {
    await expect(
      createAvailabilityPollAction({ title: "Meet", config }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue({ id: "guest", isGuest: true });
    await createAvailabilityPollAction({ title: "Meet", config });
    expect(mocks.create).toHaveBeenCalledWith({
      userId: "guest",
      spaceId: undefined,
      input: { title: "Meet", config },
    });
    expect(mocks.activeSpace).not.toHaveBeenCalled();
  });

  it("uses the registered creator's authorized active space", async () => {
    mocks.actor.mockResolvedValue({ id: "account", isGuest: false });
    await createAvailabilityPollAction({ title: "Meet", config });
    expect(mocks.activeSpace).toHaveBeenCalledWith("account");
    expect(mocks.create).toHaveBeenCalledWith({
      userId: "account",
      spaceId: "space",
      input: { title: "Meet", config },
    });
  });

  it("creates a recurring week without persisting representative calendar dates", async () => {
    mocks.actor.mockResolvedValue({ id: "guest", isGuest: true });
    const weeklyConfig = { ...config, mode: "weekly" as const, dates: [] };

    await createAvailabilityPollAction({
      title: "Typical week",
      config: weeklyConfig,
    });

    expect(mocks.create).toHaveBeenCalledWith({
      userId: "guest",
      spaceId: undefined,
      input: { title: "Typical week", config: weeklyConfig },
    });
  });

  it("rejects calendar dates supplied to a recurring week", async () => {
    mocks.actor.mockResolvedValue({ id: "guest", isGuest: true });

    await expect(async () =>
      createAvailabilityPollAction({
        title: "Typical week",
        config: { ...config, mode: "weekly" },
      }),
    ).rejects.toThrow("Weekly availability does not use calendar dates");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    15, 60,
  ] as const)("rejects new polls using %i-minute increments before creation", async (slotMinutes) => {
    mocks.actor.mockResolvedValue({ id: "guest", isGuest: true });

    await expect(async () =>
      createAvailabilityPollAction({
        title: "Meet",
        config: { ...config, slotMinutes },
      }),
    ).rejects.toThrow("New polls use 30-minute increments");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects another guest editing a response by guessed id", async () => {
    mocks.actor.mockResolvedValue({ id: "stranger" });
    await expect(
      saveAvailabilityResponseAction(responseInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("accepts a matching response token without a session", async () => {
    mocks.response.mockResolvedValue({
      id: "response",
      userId: "owner",
      tokenMatches: true,
    });
    await saveAvailabilityResponseAction({
      ...responseInput,
      responseToken: "a".repeat(32),
    });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: "response", userId: undefined }),
    );
  });

  it("rejects a token that names a different poll or response", async () => {
    await expect(
      saveAvailabilityResponseAction({
        ...responseInput,
        responseToken: "b".repeat(32),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.response.mockResolvedValue(null);
    await expect(
      saveAvailabilityResponseAction(responseInput),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("accepts the owner session and the organizer capability", async () => {
    mocks.actor.mockResolvedValue({ id: "owner" });
    await saveAvailabilityResponseAction(responseInput);
    expect(mocks.save).toHaveBeenCalledOnce();
    mocks.actor.mockResolvedValue(null);
    mocks.manage.mockResolvedValue(true);
    await saveAvailabilityResponseAction(responseInput);
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });

  it("will not create a new response with only an invalid response token", async () => {
    await expect(
      saveAvailabilityResponseAction({
        pollId: "poll",
        name: "Alex",
        intervals: [],
        responseToken: "b".repeat(32),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("requires organizer access for finalization", async () => {
    const input = {
      pollId: "poll",
      start: "2026-10-21T00:00:00.000Z",
      end: "2026-10-21T02:00:00.000Z",
    };
    mocks.actor.mockResolvedValue({ id: "participant" });
    await expect(finalizeAvailabilityPollAction(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.finalize).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue(null);
    mocks.manage.mockResolvedValue(true);
    await finalizeAvailabilityPollAction(input);
    expect(mocks.finalize).toHaveBeenCalledWith({ userId: undefined, input });
  });

  it("applies rate limiting before mutations", async () => {
    mocks.actor.mockResolvedValue({ id: "owner" });
    mocks.limit.mockResolvedValue({ success: false });
    await expect(
      saveAvailabilityResponseAction(responseInput),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
