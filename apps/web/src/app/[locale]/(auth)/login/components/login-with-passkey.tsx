"use client";

import { Button } from "@rallly/ui/button";
import { KeyRoundIcon } from "lucide-react";
import React from "react";
import { Trans, useTranslation } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";
import { passkeyErrorKind, supportsPasskeys } from "@/lib/passkey-client";
import { validateRedirectUrl } from "@/lib/utils/redirect";

export function LoginWithPasskey({ redirectTo }: { redirectTo?: string }) {
  const { t } = useTranslation();
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => setSupported(supportsPasskeys()), []);

  async function signIn() {
    setPending(true);
    setError(undefined);
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Missing session");
      window.location.assign(validateRedirectUrl(redirectTo) ?? "/");
    } catch (error) {
      setError(
        passkeyErrorKind(error) === "cancelled"
          ? t("passkeySignInCancelled", {
              defaultValue:
                "Passkey sign-in was canceled or timed out. Try again or use another sign-in method.",
            })
          : t("passkeySignInFailed", {
              defaultValue:
                "Could not sign in with that passkey. Try again or use another sign-in method.",
            }),
      );
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        onClick={signIn}
        disabled={supported !== true || pending}
        loading={pending}
      >
        <KeyRoundIcon />
        <Trans i18nKey="signInWithPasskey" defaults="Sign in with a passkey" />
      </Button>
      {supported === false ? (
        <p className="text-muted-foreground text-sm">
          <Trans
            i18nKey="passkeyBrowserUnsupported"
            defaults="Passkeys are unavailable in this browser. Use another sign-in method or a browser that supports passkeys over HTTPS."
          />
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
