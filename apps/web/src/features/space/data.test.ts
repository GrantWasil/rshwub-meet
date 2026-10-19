import { describe, expect, it, vi } from "vitest";

const { subscription } = vi.hoisted(() => ({ subscription: vi.fn() }));
vi.mock("@rallly/database", () => ({ prisma: {} }));
vi.mock("@/features/billing/constants", () => ({ isBillingEnabled: false }));
vi.mock("@/features/billing/data", () => ({
  getSpaceSubscription: subscription,
}));
vi.mock("@/features/instance-policy/data", () => ({
  getInstancePolicy: vi.fn(),
}));
vi.mock("@/features/space/utils", () => ({
  createSpaceDTO: vi.fn(),
  fromDBRole: vi.fn(),
  isSpaceBrandingActive: vi.fn(),
}));

import { getTotalSeatsForSpace } from "./data";

// Exercise the public seat query so membership checks see the same unrestricted
// capacity as the control panel without DB/subscription access.
describe("self-hosted space capacity", () => {
  it("has no paid membership cap for any space", async () => {
    expect(await getTotalSeatsForSpace("friend-group")).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(subscription).not.toHaveBeenCalled();
  });
});
