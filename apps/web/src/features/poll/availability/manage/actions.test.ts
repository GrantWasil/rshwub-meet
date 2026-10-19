import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  manage: vi.fn(),
  edit: vi.fn(),
  changeStatus: vi.fn(),
  delete: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/features/poll/availability/loaders", () => ({
  loadAvailabilityActor: mocks.actor,
}));
vi.mock("@/features/poll/management/loaders", () => ({
  loadPollAdminAccess: mocks.manage,
}));
vi.mock("./mutations", () => ({
  editAvailabilityPoll: mocks.edit,
  changeAvailabilityPollStatus: mocks.changeStatus,
  deleteAvailabilityPoll: mocks.delete,
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
  changeAvailabilityPollStatusAction,
  deleteAvailabilityPollAction,
  editAvailabilityPollAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(null);
  mocks.manage.mockResolvedValue(false);
  mocks.limit.mockResolvedValue({ success: true });
});

describe("availability organizer authorization", () => {
  it("rejects editing, closing, reopening and deleting with only a public poll id", async () => {
    for (const operation of [
      () =>
        editAvailabilityPollAction({
          pollId: "poll",
          title: "Changed",
          description: "",
          location: "",
        }),
      () =>
        changeAvailabilityPollStatusAction({
          pollId: "poll",
          status: "closed",
        }),
      () =>
        changeAvailabilityPollStatusAction({ pollId: "poll", status: "open" }),
      () => deleteAvailabilityPollAction({ pollId: "poll" }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.changeStatus).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("allows a valid private management capability without an account session", async () => {
    mocks.manage.mockResolvedValue(true);
    await changeAvailabilityPollStatusAction({
      pollId: "poll",
      status: "open",
    });
    expect(mocks.manage).toHaveBeenCalledWith("poll", undefined);
    expect(mocks.changeStatus).toHaveBeenCalledWith({
      input: { pollId: "poll", status: "open" },
      userId: undefined,
    });
    await deleteAvailabilityPollAction({ pollId: "poll" });
    expect(mocks.delete).toHaveBeenCalledWith("poll");
  });

  it("does not accept date or availability changes through the details action", async () => {
    mocks.actor.mockResolvedValue({ id: "owner" });
    mocks.manage.mockResolvedValue(true);
    await editAvailabilityPollAction({
      pollId: "poll",
      title: " Changed ",
      description: "",
      location: "",
      config: { dates: [] },
    } as never);
    expect(mocks.edit).toHaveBeenCalledWith({
      input: {
        pollId: "poll",
        title: "Changed",
        description: "",
        location: "",
      },
      userId: "owner",
    });
  });
});
