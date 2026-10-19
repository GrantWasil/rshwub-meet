"use client";

import { Button } from "@rallly/ui/button";
import { Input } from "@rallly/ui/input";
import { useEffect, useState } from "react";
import { Trans } from "@/i18n/client";
import { issuePollManagementLinkAction } from "../actions";

export function PollManagementLink({ pollId }: { pollId: string }) {
  const [link, setLink] = useState<string>();
  const [needsReplacement, setNeedsReplacement] = useState(false);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    issuePollManagementLinkAction({ pollId, replace: false })
      .then((result) => {
        if (!active) return;
        if (result?.data) {
          setLink(
            result.data.path
              ? new URL(result.data.path, window.location.origin).href
              : undefined,
          );
          setNeedsReplacement(result.data.needsReplacement);
        } else setError(true);
        setPending(false);
      })
      .catch(() => {
        if (active) {
          setError(true);
          setPending(false);
        }
      });
    return () => {
      active = false;
    };
  }, [pollId]);

  async function replaceLink() {
    setPending(true);
    setError(false);
    const result = await issuePollManagementLinkAction({
      pollId,
      replace: true,
    }).catch(() => null);
    if (result?.data?.path) {
      setLink(new URL(result.data.path, window.location.origin).href);
      setNeedsReplacement(false);
      setCopied(false);
    } else setError(true);
    setPending(false);
  }

  return (
    <section
      className="space-y-2 rounded-lg border p-4"
      aria-label="Private organizer link"
    >
      <h3 className="font-medium">
        <Trans
          i18nKey="privateManagementLinkTitle"
          defaults="Your private organizer link"
        />
      </h3>
      <p className="text-muted-foreground text-sm">
        <Trans
          i18nKey="privateManagementLinkHelp"
          defaults="Save this link to manage this poll from any device. Anyone with it can edit the poll, so share the invite link with friends instead."
        />
      </p>
      {link ? (
        <div className="flex gap-2">
          <Input
            aria-label="Private organizer link"
            type="password"
            value={link}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setError(true);
              }
            }}
          >
            {copied ? (
              <Trans i18nKey="copied" defaults="Copied" />
            ) : (
              <Trans i18nKey="copy" defaults="Copy" />
            )}
          </Button>
        </div>
      ) : null}
      {pending ? (
        <output className="block text-sm">
          <Trans
            i18nKey="preparingOrganizerLink"
            defaults="Preparing your private link…"
          />
        </output>
      ) : null}
      {needsReplacement ? (
        <p className="text-muted-foreground text-sm">
          <Trans
            i18nKey="replaceOrganizerLinkHelp"
            defaults="A link was saved on another device. Creating a replacement will revoke the old link."
          />
        </p>
      ) : null}
      {needsReplacement || error ? (
        <Button disabled={pending} onClick={replaceLink}>
          <Trans
            i18nKey="replaceOrganizerLink"
            defaults="Create replacement link"
          />
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          <Trans
            i18nKey="organizerLinkError"
            defaults="The link could not be prepared or copied. Please try again."
          />
        </p>
      ) : null}
    </section>
  );
}
