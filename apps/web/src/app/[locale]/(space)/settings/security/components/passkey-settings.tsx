"use client";

import { passwordManagerIgnoreProps } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useDialog,
} from "@rallly/ui/dialog";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import { toast } from "@rallly/ui/sonner";
import React from "react";
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionHeader,
  PageSectionTitle,
} from "@/components/page-layout";
import { Trans, useTranslation } from "@/i18n/client";
import { authClient, signOut } from "@/lib/auth-client";
import { passkeyErrorKind, supportsPasskeys } from "@/lib/passkey-client";

export function PasskeySettings() {
  const { t } = useTranslation();
  const passkeys = authClient.useListPasskeys();
  const dialog = useDialog();
  const nameId = React.useId();
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [operation, setOperation] = React.useState<"add" | "rename" | "delete">(
    "add",
  );
  const [selected, setSelected] = React.useState<{
    id: string;
    name?: string | null;
  }>();
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] =
    React.useState<ReturnType<typeof passkeyErrorKind>>();

  React.useEffect(() => setSupported(supportsPasskeys()), []);

  function open(
    operation: "add" | "rename" | "delete",
    passkey?: { id: string; name?: string | null },
  ) {
    setOperation(operation);
    setSelected(passkey);
    setName(passkey?.name ?? "");
    setError(undefined);
    dialog.trigger();
  }

  const messages = {
    reauth: t("passkeyReauthenticationRequired", {
      defaultValue:
        "Sign in again before changing your passkeys. Your account and polls will stay saved.",
    }),
    account: t("passkeyAccountRequired", {
      defaultValue:
        "Sign in to your own verified account to manage passkeys. Guest and impersonated sessions cannot add passkeys.",
    }),
    duplicate: t("passkeyAlreadyRegistered", {
      defaultValue:
        "This passkey is already registered. Choose another authenticator or use the existing passkey.",
    }),
    cancelled: t("passkeyRegistrationCancelled", {
      defaultValue:
        "Passkey creation was canceled or timed out. You can try again when you are ready.",
    }),
    failed: t("passkeyManagementFailed", {
      defaultValue:
        "Could not update your passkeys. Check your connection and try again.",
    }),
  };

  async function reauthenticate() {
    setPending(true);
    try {
      await signOut();
      window.location.assign("/login?redirectTo=%2Fsettings%2Fsecurity");
    } catch {
      setError("failed");
      setPending(false);
    }
  }

  function feedback(kind: ReturnType<typeof passkeyErrorKind>) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-destructive text-sm">
          {messages[kind]}
        </p>
        {kind === "reauth" || kind === "account" ? (
          <Button
            type="button"
            onClick={reauthenticate}
            disabled={pending}
            loading={pending}
          >
            <Trans i18nKey="passkeySignInAgain" defaults="Sign in again" />
          </Button>
        ) : null}
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (
      pending ||
      (operation !== "delete" && (!trimmedName || trimmedName.length > 100))
    )
      return;
    setPending(true);
    setError(undefined);
    try {
      const result =
        operation === "add"
          ? await authClient.passkey.addPasskey({ name: trimmedName })
          : operation === "rename" && selected
            ? await authClient.passkey.updatePasskey({
                id: selected.id,
                name: trimmedName,
              })
            : operation === "delete" && selected
              ? await authClient.passkey.deletePasskey({ id: selected.id })
              : undefined;
      if (!result) throw new Error("Missing passkey");
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Missing result");
      dialog.dismiss();
      toast.success(
        operation === "delete"
          ? t("passkeyRemoved", { defaultValue: "Passkey removed" })
          : operation === "rename"
            ? t("passkeyRenamed", { defaultValue: "Passkey renamed" })
            : t("passkeyAdded", { defaultValue: "Passkey added" }),
      );
    } catch (error) {
      setError(passkeyErrorKind(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <PageSection variant="card">
      <PageSectionHeader>
        <PageSectionTitle>
          <Trans i18nKey="passkeys" defaults="Passkeys" />
        </PageSectionTitle>
        <PageSectionDescription>
          <Trans
            i18nKey="passkeysDescription"
            defaults="Sign in with your device's fingerprint, face recognition, PIN, or a security key. Email and password sign-in remain available."
          />
        </PageSectionDescription>
      </PageSectionHeader>
      <PageSectionContent className="space-y-4">
        {passkeys.isPending ? (
          <output className="text-muted-foreground text-sm">
            <Trans i18nKey="passkeysLoading" defaults="Loading passkeys…" />
          </output>
        ) : passkeys.error ? (
          <div className="space-y-2">
            {feedback(error ?? passkeyErrorKind(passkeys.error))}
            <Button
              type="button"
              onClick={() => passkeys.refetch()}
              disabled={pending}
            >
              <Trans i18nKey="retry" defaults="Retry" />
            </Button>
          </div>
        ) : passkeys.data?.length ? (
          <ul className="divide-y">
            {passkeys.data.map((passkey) => (
              <li
                key={passkey.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
              >
                <span className="min-w-0 break-words font-medium text-sm">
                  {passkey.name ||
                    t("unnamedPasskey", { defaultValue: "Unnamed passkey" })}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => open("rename", passkey)}
                    disabled={pending}
                  >
                    <Trans i18nKey="passkeyRename" defaults="Rename" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => open("delete", passkey)}
                    disabled={pending}
                  >
                    <Trans i18nKey="passkeyRemove" defaults="Remove" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="noPasskeys"
              defaults="You haven't added any passkeys yet."
            />
          </p>
        )}
        <Button
          type="button"
          onClick={() => open("add")}
          disabled={
            supported !== true ||
            pending ||
            passkeys.isPending ||
            !!passkeys.error
          }
        >
          <Trans i18nKey="passkeyAdd" defaults="Add a passkey" />
        </Button>
        {supported === false ? (
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="passkeyRegistrationUnsupported"
              defaults="This browser cannot create passkeys. Use a browser that supports passkeys over HTTPS. You can still rename or remove existing passkeys here."
            />
          </p>
        ) : null}
        <Dialog
          {...dialog.dialogProps}
          onOpenChange={(open) => {
            if (!pending) dialog.dialogProps.onOpenChange(open);
          }}
        >
          <DialogContent showCloseButton={!pending}>
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>
                  {operation === "add" ? (
                    <Trans i18nKey="passkeyAdd" defaults="Add a passkey" />
                  ) : operation === "rename" ? (
                    <Trans
                      i18nKey="passkeyRenameTitle"
                      defaults="Rename passkey"
                    />
                  ) : (
                    <Trans
                      i18nKey="passkeyRemoveTitle"
                      defaults="Remove this passkey?"
                    />
                  )}
                </DialogTitle>
                <DialogDescription>
                  {operation === "delete" ? (
                    <>
                      <strong className="mb-2 block break-words text-foreground">
                        {selected?.name ||
                          t("unnamedPasskey", {
                            defaultValue: "Unnamed passkey",
                          })}
                      </strong>
                      <Trans
                        i18nKey="passkeyRemoveConfirmation"
                        defaults="Remove this passkey from your account? It will no longer work for sign-in. You can still sign in with email or another passkey. This does not delete its copy from your device or password manager."
                      />
                    </>
                  ) : (
                    <Trans
                      i18nKey="passkeyNameHint"
                      defaults="Choose a name you'll recognize, such as “Personal laptop” or “1Password”. Use up to 100 characters."
                    />
                  )}
                </DialogDescription>
              </DialogHeader>
              {operation !== "delete" ? (
                <div className="space-y-2">
                  <Label htmlFor={nameId}>
                    <Trans i18nKey="passkeyName" defaults="Passkey name" />
                  </Label>
                  <Input
                    {...passwordManagerIgnoreProps}
                    id={nameId}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    required
                    disabled={pending}
                  />
                </div>
              ) : null}
              {error ? feedback(error) : null}
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => dialog.dismiss()}
                  disabled={pending}
                >
                  <Trans i18nKey="cancel" defaults="Cancel" />
                </Button>
                <Button
                  type="submit"
                  variant={operation === "delete" ? "destructive" : "primary"}
                  loading={pending}
                  disabled={
                    pending ||
                    error === "reauth" ||
                    error === "account" ||
                    (operation !== "delete" && !name.trim())
                  }
                >
                  {operation === "delete" ? (
                    <Trans i18nKey="passkeyRemove" defaults="Remove" />
                  ) : operation === "rename" ? (
                    <Trans i18nKey="save" defaults="Save" />
                  ) : (
                    <Trans i18nKey="passkeyAdd" defaults="Add a passkey" />
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageSectionContent>
    </PageSection>
  );
}
