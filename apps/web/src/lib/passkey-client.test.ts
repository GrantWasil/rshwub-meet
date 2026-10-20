import { afterEach, describe, expect, it, vi } from "vitest";
import { passkeyErrorKind, supportsPasskeys } from "./passkey-client";

afterEach(() => vi.unstubAllGlobals());

describe("passkey client feedback", () => {
  it.each([
    ["PASSKEY_REAUTHENTICATION_REQUIRED", "reauth"],
    ["PASSKEY_ACCOUNT_REQUIRED", "account"],
    ["ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", "duplicate"],
    ["AUTH_CANCELLED", "cancelled"],
    ["REGISTRATION_CANCELLED", "cancelled"],
    ["ERROR_CEREMONY_ABORTED", "cancelled"],
    ["ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", "cancelled"],
    ["SOMETHING_ELSE", "failed"],
  ])("maps %s to actionable feedback", (code, kind) => {
    expect(passkeyErrorKind({ code })).toBe(kind);
  });

  it("recognizes native cancellation without showing raw error text", () => {
    expect(
      passkeyErrorKind(new DOMException("private detail", "NotAllowedError")),
    ).toBe("cancelled");
    expect(passkeyErrorKind(null)).toBe("failed");
  });

  it("requires a secure context and the browser credential API", () => {
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("PublicKeyCredential", class {});
    vi.stubGlobal("navigator", { credentials: {} });
    expect(supportsPasskeys()).toBe(false);
    vi.stubGlobal("isSecureContext", true);
    expect(supportsPasskeys()).toBe(true);
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(supportsPasskeys()).toBe(false);
  });
});
