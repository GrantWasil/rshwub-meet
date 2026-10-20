import "server-only";
import { passkey } from "@better-auth/passkey";
import { absoluteUrl } from "@rallly/utils/absolute-url";
import type { GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth";
import { getAuthoritativeSessionFromCtx } from "better-auth/api";
import { env } from "@/env";
import {
  getPasskeyAccount,
  getPasskeyCredentialAccount,
} from "@/features/auth/data";
import {
  getPasskeyAccountError,
  getPasskeyManagementError,
  getPasskeyManagementOperation,
  isPasskeyUserVerified,
} from "@/lib/passkey-policy";

function requireUserVerification(userVerified: boolean | undefined) {
  if (!isPasskeyUserVerified(userVerified)) {
    throw new APIError("FORBIDDEN", {
      code: "PASSKEY_USER_VERIFICATION_REQUIRED",
      message: "Verify using your device PIN or biometrics and try again.",
    });
  }
}

// Derive the RP from trusted deployment configuration, never request headers.
const site = new URL(absoluteUrl());

export const meetPasskeys = passkey({
  rpID: site.hostname,
  rpName: env.APP_NAME,
  origin: site.origin,
  authenticatorSelection: {
    residentKey: "required",
    userVerification: "required",
  },
  registration: {
    requireSession: true,
    afterVerification: async ({ verification }) => {
      // The pinned plugin verifies signatures but does not require the UV bit.
      requireUserVerification(verification.registrationInfo?.userVerified);
    },
  },
  authentication: {
    afterVerification: async ({ verification, clientData }) => {
      requireUserVerification(verification.authenticationInfo.userVerified);
      // Check current account state after signature verification, before the
      // plugin creates a session. Guest and soft-deleted accounts cannot log in.
      const user = await getPasskeyCredentialAccount(clientData.id);
      const error = getPasskeyAccountError(user);
      if (error) {
        throw new APIError("FORBIDDEN", error);
      }
    },
  },
});

// These are plain helpers called inside auth.ts's middleware. Nesting
// createAuthMiddleware would wrap their result in { headers, response } again.
export async function protectPasskeyRequest(ctx: GenericEndpointContext) {
  if (!ctx.path.startsWith("/passkey/")) return;
  ctx.setHeader("Cache-Control", "no-store");

  // Respect instances that deliberately require SSO for every sign-in.
  if (env.EMAIL_LOGIN_ENABLED === "false") {
    throw new APIError("FORBIDDEN", {
      code: "PASSKEY_DISABLED",
      message: "Passkey sign-in is not enabled on this instance.",
    });
  }

  const operation = getPasskeyManagementOperation(ctx.path);
  if (!operation) return;

  // Cookie-cache sessions can outlive revocation. Credential management must
  // consult the session store and current account state on every request.
  const session = await getAuthoritativeSessionFromCtx(ctx);
  const user = session ? await getPasskeyAccount(session.user.id) : null;
  const error = getPasskeyManagementError({
    user,
    session: session?.session,
    requireFresh: operation === "write",
  });
  if (error) throw new APIError("FORBIDDEN", error);

  if (
    (ctx.path === "/passkey/verify-registration" ||
      ctx.path === "/passkey/update-passkey") &&
    ctx.body?.name !== undefined &&
    (typeof ctx.body.name !== "string" || ctx.body.name.trim().length > 100)
  ) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSKEY_NAME_INVALID",
      message: "Use a passkey name of at most 100 characters.",
    });
  }
  if (typeof ctx.body?.name === "string") {
    ctx.body.name = ctx.body.name.trim();
  }
}

export async function enforcePasskeyAuthenticationOptions(
  ctx: GenericEndpointContext & { context: { returned?: unknown } },
) {
  if (ctx.path.startsWith("/passkey/")) {
    ctx.setHeader("Cache-Control", "no-store");
  }
  // Better Auth 1.6 requests "preferred" for assertion ceremonies. Ask the
  // authenticator for the same verification we enforce on the server.
  if (ctx.path === "/passkey/generate-authenticate-options") {
    const options = ctx.context.returned;
    if (options && typeof options === "object" && "challenge" in options) {
      return ctx.json({ ...options, userVerification: "required" });
    }
  }
}
