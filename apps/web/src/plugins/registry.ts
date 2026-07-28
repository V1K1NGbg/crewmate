import { mailPlugin } from "@crewmate/mail";
import { calendarPlugin } from "@crewmate/calendar";
import { notesPlugin } from "@crewmate/notes";
import { tasksPlugin } from "@crewmate/tasks";
import type { FeaturePlugin } from "@crewmate/types";

/**
 * The live registry of feature plugins this build was compiled with. Every
 * plugin's `Page`/`SettingsSection` are lazy-loaded internally (see each
 * package's `plugin.tsx`), so importing this list is cheap even though it
 * statically references every package — no feature's code is actually
 * downloaded until its page/settings tab is opened.
 *
 * This is the single composition point of the app: everything else (nav,
 * page routing, settings tabs, theming, the AI assistant) is generic and
 * only talks to the `FeaturePlugin` shape from `@crewmate/types`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLUGINS: FeaturePlugin<any>[] = [
  mailPlugin,
  calendarPlugin,
  notesPlugin,
  tasksPlugin,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPlugin(id: string): FeaturePlugin<any> | undefined {
  return PLUGINS.find((p) => p.id === id);
}
