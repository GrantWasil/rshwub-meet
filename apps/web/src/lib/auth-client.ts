import { passkeyClient } from "@better-auth/passkey/client";
import { posthog } from "@rallly/posthog/client";
import { absoluteUrl } from "@rallly/utils/absolute-url";
import {
  anonymousClient,
  emailOTPClient,
  genericOAuthClient,
  inferAdditionalFields,
  lastLoginMethodClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "@/lib/auth";
import { clearBrowserQueryCache } from "@/lib/query-client";

export const authClient = createAuthClient({
  baseURL: absoluteUrl("/api/better-auth"),
  plugins: [
    inferAdditionalFields<Auth>(),
    emailOTPClient(),
    genericOAuthClient(),
    lastLoginMethodClient(),
    anonymousClient(),
    passkeyClient(),
  ],
});

export async function signOut() {
  const result = await authClient.signOut();
  if (result.error) throw new Error(result.error.message);
  posthog?.reset();
  clearBrowserQueryCache();
}
