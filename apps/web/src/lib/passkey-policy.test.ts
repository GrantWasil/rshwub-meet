import { describe, expect, it } from "vitest";
import {
  getPasskeyAccountError,
  getPasskeyManagementError,
  getPasskeyManagementOperation,
  isPasskeyUserVerified,
  PASSKEY_FRESH_SESSION_SECONDS,
} from "./passkey-policy";

const now = Date.parse("2026-10-19T12:00:00Z");
const user = {
  isAnonymous: false,
  emailVerified: true,
  banned: false,
  deletedAt: null,
};
const session = {
  createdAt: new Date(now - 60_000),
  expiresAt: new Date(now + 60_000),
  impersonatedBy: null,
};

describe("passkey management authorization", () => {
  it("permits a fresh verified account without granting or requiring an admin role", () => {
    expect(
      getPasskeyManagementError({ user, session, requireFresh: true, now }),
    ).toBeNull();
  });

  it.each([
    ["missing account", null],
    ["guest account", { ...user, isAnonymous: true }],
    ["unverified email", { ...user, emailVerified: false }],
    ["unknown verification", { ...user, emailVerified: null }],
    ["banned account", { ...user, banned: true }],
    ["deleted account", { ...user, deletedAt: new Date(now) }],
  ])("rejects %s even with a fresh session", (_description, currentUser) => {
    expect(getPasskeyAccountError(currentUser)?.code).toBe(
      "PASSKEY_ACCOUNT_REQUIRED",
    );
    expect(
      getPasskeyManagementError({
        user: currentUser,
        session,
        requireFresh: true,
        now,
      })?.code,
    ).toBe("PASSKEY_ACCOUNT_REQUIRED");
  });

  it.each([
    ["missing session", null],
    ["impersonated session", { ...session, impersonatedBy: "administrator" }],
    ["expired session", { ...session, expiresAt: new Date(now) }],
    ["invalid expiry", { ...session, expiresAt: "invalid" }],
  ])("rejects %s", (_description, currentSession) => {
    expect(
      getPasskeyManagementError({
        user,
        session: currentSession,
        requireFresh: true,
        now,
      })?.code,
    ).toBe("PASSKEY_ACCOUNT_REQUIRED");
  });

  it("allows reading existing credentials without fresh authentication", () => {
    expect(
      getPasskeyManagementError({
        user,
        session: { ...session, createdAt: new Date(now - 86_400_000) },
        requireFresh: false,
        now,
      }),
    ).toBeNull();
  });

  it("requires new authentication exactly at the freshness boundary", () => {
    const boundary = now - PASSKEY_FRESH_SESSION_SECONDS * 1000;
    expect(
      getPasskeyManagementError({
        user,
        session: { ...session, createdAt: new Date(boundary + 1) },
        requireFresh: true,
        now,
      }),
    ).toBeNull();
    expect(
      getPasskeyManagementError({
        user,
        session: { ...session, createdAt: new Date(boundary) },
        requireFresh: true,
        now,
      })?.code,
    ).toBe("PASSKEY_REAUTHENTICATION_REQUIRED");
  });

  it("does not treat rolling session updates as recent authentication", () => {
    const refreshedSession = {
      ...session,
      createdAt: new Date(now - 86_400_000),
      updatedAt: new Date(now),
    };
    expect(
      getPasskeyManagementError({
        user,
        session: refreshedSession,
        requireFresh: true,
        now,
      })?.code,
    ).toBe("PASSKEY_REAUTHENTICATION_REQUIRED");
  });

  it.each([
    "invalid",
    new Date(now + 1),
  ])("fails closed for invalid or future session creation time %s", (createdAt) => {
    expect(
      getPasskeyManagementError({
        user,
        session: { ...session, createdAt },
        requireFresh: true,
        now,
      })?.code,
    ).toBe("PASSKEY_REAUTHENTICATION_REQUIRED");
  });
});

describe("passkey endpoint selection", () => {
  it.each([
    "/passkey/generate-register-options",
    "/passkey/verify-registration",
    "/passkey/delete-passkey",
    "/passkey/update-passkey",
  ])("requires fresh authentication for %s", (path) => {
    expect(getPasskeyManagementOperation(path)).toBe("write");
  });

  it("treats the list endpoint as read-only", () => {
    expect(getPasskeyManagementOperation("/passkey/list-user-passkeys")).toBe(
      "read",
    );
  });

  it.each([
    "/passkey/generate-authenticate-options",
    "/passkey/verify-authentication",
    "/email-otp/send-verification-otp",
    "/sign-in/email-otp",
  ])("leaves the sign-in and email recovery endpoint %s available", (path) => {
    expect(getPasskeyManagementOperation(path)).toBeUndefined();
  });
});

describe("WebAuthn user verification", () => {
  it("requires positive evidence of the verified UV flag", () => {
    expect(isPasskeyUserVerified(true)).toBe(true);
    expect(isPasskeyUserVerified(false)).toBe(false);
    expect(isPasskeyUserVerified(undefined)).toBe(false);
  });
});
