# Crewmate editing guide

This file is the operational source of truth for agents editing this repository.
Read it before making changes. Use `README.md` for product/setup context and
`docs/ARCHITECTURE.md` for the dependency and data-flow map.

## Before editing

1. Run `git status --short`. Preserve pre-existing changes; never discard or
   reformat unrelated work.
2. Locate the smallest owning package. Keep feature behavior in its feature
   package and host composition in `apps/web`.
3. Search for the type, action, setting, or route across the repository before
   changing it. Several workflows cross UI, state, API, and Google client layers.
4. For a bug fix, prefer extracting a small pure helper and adding a colocated
   `*.test.ts` regression test.

## Commands

Run commands from the repository root.

```bash
npm install          # install/link all workspaces
npm run dev          # Next.js development server
npm test             # all packages/*/src/*.test.ts tests
npm run lint         # app and all package source
npm run typecheck    # strict TypeScript check
npm run check        # lint + typecheck + tests
npm run check:all    # check + production build
```

Use `npm run check` for normal source changes. Use `npm run check:all` when a
change affects routing, bundling, package exports, server/client boundaries, or
before a release. Report any check you could not run.

## Repository boundaries

- `apps/web/src/app`: Next.js routes, layouts, and API endpoints.
- `apps/web/src/components`: host shell UI shared by all features.
- `apps/web/src/plugins`: the build-time feature manifest and runtime registry.
- `packages/types`: shared contracts only. Do not import runtime state or feature
  packages here.
- `packages/state`: global client state, persistence, cross-feature data, and
  one-shot prefills. It may depend on `types`, but not on feature packages.
- `packages/lib`: reusable client-safe helpers. Browser-facing exports go through
  `@crewmate/lib`.
- `packages/lib/src/server.ts`: the only public entry point for server-only
  Google helpers. Route handlers import these through `@crewmate/lib/server`.
- `packages/{mail,calendar,notes,tasks}`: feature-owned UI, hooks, settings, and
  plugin descriptors. Do not import one feature package directly from another.

The intended dependency direction is:

```text
types <- state/lib <- feature packages <- apps/web
```

Cross-feature behavior goes through `featureData`, `pagePrefills`, or the
`FeaturePlugin` contract, not feature-to-feature imports.

## Implementation conventions

- Components and hooks that use browser APIs, React state/effects, or app context
  must remain below a `"use client"` boundary.
- Keep Google access tokens and Google SDK clients server-side. Client code calls
  `/api/*`; route handlers call `@crewmate/lib/server`.
- Every authenticated route must check `session?.accessToken` before creating a
  Google client. Validate required path/query/body data and return 400 for invalid
  requests, 401 for authentication failures, and a useful non-2xx response for
  other failures.
- Client fetches must check `response.ok` before consuming success data. Preserve
  resource identity through every mutation layer (for example both event ID and
  calendar ID).
- Treat remote reads and writes as concurrent. Abort or ignore stale reads and do
  not let an older save mark a newer draft as clean.
- Shared state updates are reducer actions. Add the action type and reducer case
  together; do not mutate state or nested arrays/objects in place.
- `featureData` is transient fetched data. `pagePrefills` is a one-shot handoff
  and must be cleared after the destination consumes it.
- Persisted state in `packages/state/src/index.tsx` is user data. When changing
  its shape, tolerate old/malformed values and add an explicit migration or
  normalization step.
- Feature settings live with their package in `settings.ts`; the host stores them
  generically under `pageSettings.features[plugin.id]`.
- Prefer `@crewmate/*` public exports across packages. Use relative imports only
  within the same package. Avoid reaching into another package's `src` directory.
- Preserve strict TypeScript. Narrow `unknown` at boundaries and avoid adding
  `any` or broad lint suppressions without a concrete reason.
- Reuse the CSS tokens in `apps/web/src/app/globals.css` (`bg-bg`, `text-text`,
  `border-border`, and related tokens) instead of hard-coded theme colors.

## Adding or removing a feature package

A feature is not registered in one place. Update all applicable integration
points and verify with a production build:

1. Create `packages/<id>` with its package metadata, `src/plugin.tsx`, and a
   public `src/index.ts` exporting the plugin.
2. Implement the `FeaturePlugin` contract from `@crewmate/types`; keep settings
   and assistant context/actions owned by the feature.
3. Add the workspace dependency to `apps/web/package.json`.
4. Add the package to `transpilePackages` in `apps/web/next.config.ts`.
5. Add its data entry to `apps/web/src/plugins/manifest.ts` and its live import to
   `apps/web/src/plugins/registry.ts`.
6. Add optional per-theme identity colors in `packages/types/src/index.ts`.
7. Add API routes under `apps/web/src/app/api` if the feature needs server access.

Package presence is inferred from `apps/web/package.json`; it is not dynamic at
runtime. The manifest must stay free of React/UI imports because server code uses
it for package discovery.

## Testing and review

- Tests use Node's built-in `node:test` and `node:assert/strict` and are colocated
  as `packages/<name>/src/*.test.ts`. The root test command discovers them.
- Test boundary behavior: malformed persisted/external data, non-OK responses,
  stale async completion, empty states, and resource identifiers.
- Do not rely only on lint. Typecheck and tests catch different failures.
- For UI work, also inspect loading, empty, error, keyboard, and narrow viewport
  states. Authentication-backed flows may require a manual signed-in check.
- `IMPROVEMENT_AUDIT.md` is a point-in-time audit, not current truth. Verify each
  claim against the source and current checks before acting on it.

## Keep the repository agent-friendly

When introducing a new convention, command, package boundary, or cross-feature
flow, update this file or `docs/ARCHITECTURE.md` in the same change. Prefer small,
named helpers and focused files over adding more responsibilities to the largest
page components.
