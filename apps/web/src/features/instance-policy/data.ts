import "server-only";

import { cache } from "react";
import { isSelfHosted } from "@/lib/constants";
import { deriveInstancePolicy } from "./utils";

/**
 * Instance policy for the current request. Callable from any server
 * context (tRPC, API routes, emails, other features' data.ts); pages read
 * it through `loadInstancePolicy`.
 */
export const getInstancePolicy = cache(async () => {
  // Deployment policy is independent of paid license records, including when
  // the database is unavailable for maintenance. No entitlement is fabricated.
  return deriveInstancePolicy({
    isSelfHosted,
    whiteLabelAddon: false,
  });
});
