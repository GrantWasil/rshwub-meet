import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, deployment } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  deployment: { isSelfHosted: true },
}));
vi.mock("@rallly/database", () => ({
  prisma: { instanceLicense: { findFirst } },
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/constants", () => deployment);

import { getUserLimit, getWhiteLabelAddon, loadInstanceLicense } from "./data";

describe("community fork capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deployment.isSelfHosted = true;
    findFirst.mockResolvedValue(null);
  });

  it("allows unlimited users and branding without consulting the license database", async () => {
    expect(await getUserLimit()).toBe(Number.POSITIVE_INFINITY);
    expect(await getWhiteLabelAddon()).toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("keeps the actual license absent instead of fabricating an entitlement", async () => {
    expect(await loadInstanceLicense()).toBeNull();
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it("does not turn an imported seat-limited license into a fork limit", async () => {
    findFirst.mockResolvedValue({ seats: 1, whiteLabelAddon: false });
    expect(await getUserLimit()).toBe(Number.POSITIVE_INFINITY);
    expect(await getWhiteLabelAddon()).toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
