import type { Metadata } from "next";
import {
  SettingsPage,
  SettingsPageContent,
  SettingsPageDescription,
  SettingsPageHeader,
  SettingsPageTitle,
} from "@/components/settings-layout";
import { Trans } from "@/i18n/client";

export default function LicensePage() {
  return (
    <SettingsPage>
      <SettingsPageHeader>
        <SettingsPageTitle>
          <Trans i18nKey="license" defaults="License" />
        </SettingsPageTitle>
        <SettingsPageDescription>
          Rshwub Meet is a community fork of Rallly.
        </SettingsPageDescription>
      </SettingsPageHeader>
      <SettingsPageContent>
        <div className="max-w-prose space-y-4 text-sm leading-relaxed">
          <p>
            This self-hosted fork includes unlimited users, space members, and
            simultaneous polls, plus custom branding. These are this fork’s
            product settings; no Rallly commercial license is required or
            represented as active.
          </p>
          <p>
            The code remains licensed under the GNU Affero General Public
            License v3. Rallly’s copyright and license notices are preserved.
            Anyone using this service can access its corresponding source.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              className="text-link"
              href="https://github.com/GrantWasil/rshwub-meet"
              target="_blank"
              rel="noopener noreferrer"
            >
              Rshwub Meet source
            </a>
            <a
              className="text-link"
              href="https://github.com/GrantWasil/rshwub-meet/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              AGPL-3.0 license
            </a>
            <a
              className="text-link"
              href="https://github.com/lukevella/rallly"
              target="_blank"
              rel="noopener noreferrer"
            >
              Upstream Rallly
            </a>
          </div>
        </div>
      </SettingsPageContent>
    </SettingsPage>
  );
}

export const metadata: Metadata = { title: "License and source" };
