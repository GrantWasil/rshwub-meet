import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSettings, maintenance } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  maintenance: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    APP_NAME: "Rshwub Meet",
    PRIMARY_COLOR: "#336699",
    HIDE_ATTRIBUTION: "false",
  },
}));
vi.mock("@/features/instance-settings/data", () => ({
  getInstanceSettings: getSettings,
}));
vi.mock("@/lib/constants", () => ({ isSelfHosted: true }));
vi.mock("@/lib/maintenance", () => ({ isMaintenanceModeEnabled: maintenance }));

import { getInstanceBrandingConfig } from "./data";

describe("self-hosted fork branding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maintenance.mockReturnValue(false);
    getSettings.mockResolvedValue({ appName: "Our meetup nights" });
  });

  it("uses saved custom branding without a commercial license", async () => {
    const branding = await getInstanceBrandingConfig();
    expect(branding.appName).toBe("Our meetup nights");
    expect(branding.hideAttribution).toBe(false);
  });

  it("keeps env branding and attribution in maintenance without reading the database", async () => {
    maintenance.mockReturnValue(true);
    getSettings.mockRejectedValue(new Error("database unavailable"));
    const branding = await getInstanceBrandingConfig();
    expect(branding.appName).toBe("Rshwub Meet");
    expect(branding.hideAttribution).toBe(false);
    expect(getSettings).not.toHaveBeenCalled();
  });
});
