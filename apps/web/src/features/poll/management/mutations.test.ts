import { beforeEach, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn());
vi.mock("@rallly/database", () => ({ prisma: { poll: { updateMany } } }));

import { replaceManagementTokenHash } from "./mutations";

beforeEach(() => vi.clearAllMocks());

it("rotates only the specified live poll when its previous credential still matches", async () => {
  updateMany.mockResolvedValue({ count: 1 });
  expect(
    await replaceManagementTokenHash("poll-a", "previous-hash", "next-hash"),
  ).toBe(true);
  expect(updateMany).toHaveBeenCalledWith({
    where: {
      id: "poll-a",
      deleted: false,
      managementTokenHash: "previous-hash",
    },
    data: { managementTokenHash: "next-hash" },
  });
});

it("reports a lost issuance race without overwriting the winning token", async () => {
  updateMany.mockResolvedValue({ count: 0 });
  expect(await replaceManagementTokenHash("poll-a", null, "next-hash")).toBe(
    false,
  );
  expect(updateMany).toHaveBeenCalledOnce();
  expect(updateMany.mock.calls[0][0].where.managementTokenHash).toBeNull();
});
