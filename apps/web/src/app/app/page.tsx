import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppProvider } from "@crewmate/state";
import type { Page } from "@crewmate/types";
import AppShell from "@/components/AppShell";
import SessionProvider from "@/components/SessionProvider";
import { ColorSchemeProvider } from "@/components/ColorSchemeProvider";
import { getInstalledFeatures } from "@/lib/features.server";
import { PLUGINS } from "@/plugins/registry";

export default async function AppPage() {
  const session = await auth();
  if (!session) redirect("/");
  const installedFeatures = getInstalledFeatures();
  const installedIds = new Set(
    installedFeatures.filter((f) => f.installed).map((f) => f.id),
  );

  const defaultPlugins = PLUGINS.filter(
    (p) => installedIds.has(p.id) && p.enabledByDefault,
  );
  const initialPages: Page[] = defaultPlugins.map((p, i) => ({
    id: p.id,
    type: p.id,
    label: p.label,
    keybinding: p.keybinding ?? String(i + 1),
  }));
  const initialFeatureSettings: Record<string, unknown> = Object.fromEntries(
    PLUGINS.map((p) => [p.id, p.defaultSettings]),
  );

  return (
    <SessionProvider>
      <AppProvider
        accountKey={session.accountKey}
        initialInstalledFeatures={installedFeatures}
        initialPages={initialPages}
        initialFeatureSettings={initialFeatureSettings}
      >
        <ColorSchemeProvider>
          <AppShell />
        </ColorSchemeProvider>
      </AppProvider>
    </SessionProvider>
  );
}
