import { readFileSync } from "fs";
import path from "path";
import type { FeaturePackageId, FeaturePackageInfo } from "@crewmate/types";
import { FEATURE_MANIFEST } from "@/plugins/manifest";

function readDeclaredDependencyNames(): Set<string> {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

/**
 * Server-only: determines which feature packages are actually declared as
 * dependencies of this app (and therefore resolvable through the npm
 * workspace) — a real, live fact rather than a hardcoded flag. Remove a
 * package as a dependency (and reinstall) and it reports as not installed.
 */
export function getInstalledFeatures(): FeaturePackageInfo[] {
  const declared = readDeclaredDependencyNames();
  return FEATURE_MANIFEST.map(({ id, packageName }) => ({
    id: id as FeaturePackageId,
    packageName,
    installed: declared.has(packageName),
  }));
}
