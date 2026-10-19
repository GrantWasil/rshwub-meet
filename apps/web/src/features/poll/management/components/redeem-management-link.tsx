"use client";

import { Button } from "@rallly/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser } from "@/features/user/client";
import { Trans } from "@/i18n/client";
import { redeemPollManagementLinkAction } from "../actions";

export function RedeemManagementLink({ pollId }: { pollId: string }) {
  const router = useRouter();
  const { createGuestIfNeeded } = useUser();
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  // Capture and redeem in the same effect. A session refresh can remount the
  // page, so the in-flight request must retain its own copy until it completes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: redeem only the fragment present when this link is opened
  useEffect(() => {
    const secret = window.location.hash.slice(1);
    if (secret) {
      setToken(secret);
      void openOrganizer(secret);
      // Keep the capability out of browser history and referrers after reading it.
      // Preserve the App Router's history state: replacing it with null dispatches
      // a route restore that can remount this component and discard the secret.
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    }
  }, []);

  async function openOrganizer(secret = token) {
    setPending(true);
    setError(false);
    try {
      await createGuestIfNeeded();
      const result = await redeemPollManagementLinkAction({
        pollId,
        token: secret,
      });
      if (!result?.data) throw new Error("Invalid management link");
      router.replace(result.data.destination);
      router.refresh();
    } catch {
      setPending(false);
      setError(true);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 p-6 py-16">
      <h1 className="font-semibold text-2xl">
        <Trans
          i18nKey="openPollOrganizer"
          defaults="Open your poll organizer"
        />
      </h1>
      <p className="text-muted-foreground">
        <Trans
          i18nKey="organizerLinkPrivacy"
          defaults="This private link gives you permission to manage one poll on this device."
        />
      </p>
      <Button
        variant="primary"
        disabled={!token || pending}
        onClick={() => openOrganizer()}
      >
        <Trans i18nKey="managePoll" defaults="Manage poll" />
      </Button>
      {error || !token ? (
        <output className="block text-sm">
          <Trans
            i18nKey="invalidOrganizerLink"
            defaults="If this link is incomplete or has been replaced, open the complete saved link or ask the organizer for a new one."
          />
        </output>
      ) : null}
    </main>
  );
}
