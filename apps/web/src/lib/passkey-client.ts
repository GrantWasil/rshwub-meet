export function supportsPasskeys() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== "undefined" &&
    !!navigator.credentials
  );
}

export function passkeyErrorKind(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const name =
    error && typeof error === "object" && "name" in error
      ? error.name
      : undefined;
  if (code === "PASSKEY_REAUTHENTICATION_REQUIRED") return "reauth";
  if (code === "PASSKEY_ACCOUNT_REQUIRED") return "account";
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "duplicate";
  if (
    code === "AUTH_CANCELLED" ||
    code === "REGISTRATION_CANCELLED" ||
    code === "ERROR_CEREMONY_ABORTED" ||
    code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" ||
    name === "NotAllowedError" ||
    name === "AbortError"
  ) {
    return "cancelled";
  }
  return "failed";
}
