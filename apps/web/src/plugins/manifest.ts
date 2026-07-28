import type { FeaturePackageId } from "@crewmate/types";

/**
 * Pure data manifest of the feature packages this app ships with — no React,
 * so it's safe to import from server-only code (see `features.server.ts`)
 * without pulling any package's UI bundle along with it. This file and
 * `./registry.tsx` are the *only* two places in the app that name a specific
 * `@crewmate/*` package; everything else (composition, settings, nav,
 * theming, the AI assistant) works purely off the generic `FeaturePlugin`
 * contract from `@crewmate/types`.
 */
export const FEATURE_MANIFEST: { id: FeaturePackageId; packageName: string }[] =
  [
    { id: "mail", packageName: "@crewmate/mail" },
    { id: "calendar", packageName: "@crewmate/calendar" },
    { id: "notes", packageName: "@crewmate/notes" },
    { id: "tasks", packageName: "@crewmate/tasks" },
  ];
