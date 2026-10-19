import "server-only";

import { prisma } from "@rallly/database";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { SELF_HOSTED_CAPABILITIES } from "@/features/instance-policy/constants";
import { INSTANCE_LICENSE_TAG } from "@/features/licensing/constants";
import { isSelfHosted } from "@/lib/constants";

export function getInstanceLicense() {
  return prisma.instanceLicense.findFirst({
    orderBy: {
      id: "asc",
    },
  });
}

export const cached_getInstanceLicense = unstable_cache(
  getInstanceLicense,
  [],
  {
    tags: [INSTANCE_LICENSE_TAG],
  },
);

export const loadInstanceLicense = cache(async () => {
  if (!isSelfHosted) {
    return null;
  }

  const license = await cached_getInstanceLicense();

  if (!license) {
    return null;
  }

  return {
    licenseKey: license.licenseKey,
    licenseeName: license.licenseeName,
    licenseeEmail: license.licenseeEmail,
    issuedAt: license.issuedAt,
    expiresAt: license.expiresAt,
    seats:
      license.seats ??
      (license.type === "ENTERPRISE" ? Number.POSITIVE_INFINITY : 1),
    type: license.type,
    whiteLabelAddon: license.whiteLabelAddon,
  };
});

export const getUserLimit = async () => {
  return isSelfHosted
    ? SELF_HOSTED_CAPABILITIES.seatLimit
    : Number.POSITIVE_INFINITY;
};

// Historical upstream name retained for callers. In this fork the capability
// comes from local policy; no license record is created or modified.
export const getWhiteLabelAddon = async () => {
  if (isSelfHosted) {
    return SELF_HOSTED_CAPABILITIES.customBranding;
  }
  const license = await loadInstanceLicense();
  return license?.whiteLabelAddon ?? false;
};
