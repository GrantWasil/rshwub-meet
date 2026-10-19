import type { InstancePolicy } from "./types";

/**
 * The one derivation of instance policy from deployment facts. Each field
 * is one line with its reason, so this function is the inventory of what
 * differs between cloud and self-hosted at the policy level.
 */
export function deriveInstancePolicy({
  isSelfHosted,
  whiteLabelAddon,
}: {
  isSelfHosted: boolean;
  whiteLabelAddon: boolean;
}): InstancePolicy {
  return {
    // Single-tenant instance: the instance is the org boundary, so adding a
    // member to a space only makes sense to collaborate
    spacesAlwaysShared: isSelfHosted,
    // This fork permits instance and space branding together, regardless of
    // an imported upstream license record.
    spaceBrandingAllowed: isSelfHosted || !whiteLabelAddon,
    // Self-hosted attribution remains an instance-wide operator setting,
    // not a per-space choice. Source/license notices are preserved separately.
    spaceAttributionConfigurable: !isSelfHosted,
  };
}
