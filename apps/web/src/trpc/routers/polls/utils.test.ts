import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  participant: vi.fn(),
  tokenIds: vi.fn(),
  admin: vi.fn(),
  options: vi.fn(),
}));
vi.mock("@/features/poll/data", () => ({
  getParticipant: mocks.participant,
  listParticipantIdsByToken: mocks.tokenIds,
  isOptionsPoll: mocks.options,
}));
vi.mock("@/features/poll/management/loaders", () => ({
  loadPollAdminAccess: mocks.admin,
}));

import { authorizeParticipantEdit, requireOptionsPoll } from "./utils";

const participant = {
  id: "response",
  userId: "owner",
  pollId: "poll",
  poll: { deleted: false, status: "open" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.participant.mockResolvedValue(participant);
  mocks.tokenIds.mockResolvedValue([]);
  mocks.admin.mockResolvedValue(false);
  mocks.options.mockResolvedValue(true);
});

describe("legacy response permissions with organizer capabilities", () => {
  it("keeps response owner and response-token editing working", async () => {
    await expect(
      authorizeParticipantEdit({
        participantId: "response",
        token: undefined,
        ctxUser: { id: "owner", isGuest: true },
      }),
    ).resolves.toMatchObject({ participant });
    mocks.tokenIds.mockResolvedValue(["response"]);
    await expect(
      authorizeParticipantEdit({
        participantId: "response",
        token: "valid-token",
        ctxUser: undefined,
      }),
    ).resolves.toMatchObject({ participant });
  });

  it("accepts the new guest actor created when redeeming an organizer link", async () => {
    mocks.admin.mockResolvedValue(true);
    const ctxUser = { id: "new-device-guest", isGuest: true };
    await expect(
      authorizeParticipantEdit({
        participantId: "response",
        token: undefined,
        ctxUser,
      }),
    ).resolves.toMatchObject({ actor: ctxUser });
    expect(mocks.admin).toHaveBeenCalledWith("poll", "new-device-guest");
  });

  it("does not let another guest edit a response or use a token for another response", async () => {
    mocks.tokenIds.mockResolvedValue(["different-response"]);
    await expect(
      authorizeParticipantEdit({
        participantId: "response",
        token: "other-token",
        ctxUser: { id: "stranger", isGuest: true },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("still refuses closed and deleted polls even with organizer access", async () => {
    mocks.admin.mockResolvedValue(true);
    mocks.participant.mockResolvedValueOnce({
      ...participant,
      poll: { status: "closed", deleted: false },
    });
    await expect(
      authorizeParticipantEdit({
        participantId: "response",
        token: undefined,
        ctxUser: { id: "organizer", isGuest: true },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mocks.participant.mockResolvedValueOnce({
      ...participant,
      poll: { status: "open", deleted: true },
    });
    await expect(
      authorizeParticipantEdit({
        participantId: "response",
        token: undefined,
        ctxUser: { id: "organizer", isGuest: true },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("keeps the legacy vote/option endpoints out of availability polls", async () => {
    await expect(requireOptionsPoll("legacy-poll")).resolves.toBeUndefined();
    mocks.options.mockResolvedValue(false);
    await expect(requireOptionsPoll("availability-poll")).rejects.toMatchObject(
      { code: "BAD_REQUEST" },
    );
  });
});
