export const PASSKEY_FRESH_SESSION_SECONDS = 15 * 60;

type PasskeyUser = {
  isAnonymous: boolean;
  emailVerified: boolean | null;
  banned: boolean;
  deletedAt?: Date | string | null;
};

type PasskeySession = {
  createdAt: Date | string;
  expiresAt: Date | string;
  impersonatedBy?: string | null;
};

type PasskeyManagementError = {
  code: "PASSKEY_ACCOUNT_REQUIRED" | "PASSKEY_REAUTHENTICATION_REQUIRED";
  message: string;
};

/** Check the current database user for both enrollment and assertion login. */
export function getPasskeyAccountError(
  user: PasskeyUser | null | undefined,
): PasskeyManagementError | null {
  if (
    !user ||
    user.isAnonymous ||
    user.emailVerified !== true ||
    user.banned ||
    user.deletedAt != null
  ) {
    return {
      code: "PASSKEY_ACCOUNT_REQUIRED",
      message: "Sign in to your verified account to manage passkeys.",
    };
  }
  return null;
}

/** The authentication ceremony must remain available before sign-in. */
export function getPasskeyManagementOperation(
  path: string,
): "read" | "write" | undefined {
  switch (path) {
    case "/passkey/list-user-passkeys":
      return "read";
    case "/passkey/generate-register-options":
    case "/passkey/verify-registration":
    case "/passkey/delete-passkey":
    case "/passkey/update-passkey":
      return "write";
    default:
      return undefined;
  }
}

/**
 * Call with the authoritative session and current database user, not the
 * cookie cache. Roles are deliberately irrelevant: passkeys belong to the
 * signed-in account and do not grant additional application permissions.
 */
export function getPasskeyManagementError({
  user,
  session,
  requireFresh,
  now = Date.now(),
}: {
  user: PasskeyUser | null | undefined;
  session: PasskeySession | null | undefined;
  requireFresh: boolean;
  now?: number;
}): PasskeyManagementError | null {
  const accountError = getPasskeyAccountError(user);
  if (accountError) {
    return accountError;
  }

  const expiresAt = session
    ? new Date(session.expiresAt).getTime()
    : Number.NaN;

  if (
    !session ||
    session.impersonatedBy ||
    !Number.isFinite(now) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  ) {
    return {
      code: "PASSKEY_ACCOUNT_REQUIRED",
      message: "Sign in to your verified account to manage passkeys.",
    };
  }

  // Rolling session refresh updates updatedAt without proving identity again.
  // Only the creation time of a newly authenticated session is meaningful.
  const createdAt = new Date(session.createdAt).getTime();
  if (
    requireFresh &&
    (!Number.isFinite(createdAt) ||
      createdAt > now ||
      now - createdAt >= PASSKEY_FRESH_SESSION_SECONDS * 1000)
  ) {
    return {
      code: "PASSKEY_REAUTHENTICATION_REQUIRED",
      message: "Verify your sign-in again before changing passkeys.",
    };
  }

  return null;
}

/** Pinned Better Auth's verifier does not itself require the WebAuthn UV bit. */
export function isPasskeyUserVerified(
  userVerified: boolean | undefined,
): boolean {
  return userVerified === true;
}
