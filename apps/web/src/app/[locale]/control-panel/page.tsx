import { cn } from "@rallly/ui";
import { Tile, TileGrid, TileTitle } from "@rallly/ui/tile";
import {
  InfinityIcon,
  KeySquareIcon,
  PaletteIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageIcon } from "@/components/page-icons";
import {
  SettingsPage,
  SettingsPageContent,
  SettingsPageHeader,
  SettingsPageTitle,
} from "@/components/settings-layout";
import { getUserLimit } from "@/features/licensing/data";
import { getUserCount } from "@/features/user/data";
import { Trans } from "@/i18n/client";
import { VersionTile } from "./version-tile";

async function loadData() {
  const [userCount, userLimit] = await Promise.all([
    getUserCount(),
    getUserLimit(),
  ]);

  return {
    userCount,
    userLimit,
  };
}

export default async function AdminPage() {
  const { userCount, userLimit } = await loadData();

  return (
    <SettingsPage>
      <SettingsPageHeader>
        <SettingsPageTitle>
          <Trans i18nKey="home" defaults="Home" />
        </SettingsPageTitle>
      </SettingsPageHeader>
      <SettingsPageContent>
        <div className="space-y-4">
          <TileGrid>
            {/* USERS */}
            <Tile render={<Link href="/control-panel/users" />}>
              <div className="flex justify-between">
                <div>
                  <PageIcon>
                    <UsersIcon />
                  </PageIcon>
                  <TileTitle>
                    <Trans i18nKey="users" defaults="Users" />
                  </TileTitle>
                </div>
                <div className="text-muted-foreground text-sm">
                  <span
                    className={cn({
                      "text-destructive":
                        userLimit !== null && userCount > userLimit,
                    })}
                  >
                    <Trans
                      i18nKey="userCount"
                      defaults="{count, number, ::compact-short}"
                      values={{ count: userCount }}
                    />
                    /
                    {userLimit === Number.POSITIVE_INFINITY ? (
                      <InfinityIcon className="inline-flex size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      userLimit
                    )}
                  </span>
                </div>
              </div>
            </Tile>
            {/* LICENSE */}
            <Tile render={<Link href="/control-panel/license" />}>
              <div className="flex justify-between">
                <PageIcon>
                  <KeySquareIcon />
                </PageIcon>
                <span className="text-muted-foreground text-sm">AGPL-3.0</span>
              </div>
              <TileTitle>
                <Trans i18nKey="license" defaults="License" />
              </TileTitle>
            </Tile>
            {/* BRANDING */}
            <Tile render={<Link href="/control-panel/branding" />}>
              <div className="flex justify-between">
                <PageIcon>
                  <PaletteIcon />
                </PageIcon>
              </div>
              <TileTitle>
                <Trans i18nKey="branding" defaults="Branding" />
              </TileTitle>
            </Tile>
            {/* INSTANCE SETTINGS */}
            <Tile render={<Link href="/control-panel/settings" />}>
              <div className="flex justify-between">
                <PageIcon>
                  <SettingsIcon />
                </PageIcon>
              </div>
              <TileTitle>
                <Trans i18nKey="settings" defaults="Settings" />
              </TileTitle>
            </Tile>
            {/* VERSION */}
            <VersionTile />
          </TileGrid>
        </div>
      </SettingsPageContent>
    </SettingsPage>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Control Panel",
  };
}
