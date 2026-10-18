# Architecture

Crewmate is an npm-workspaces monorepo containing one Next.js host and productivity/home-server
feature packages. The host owns composition, authentication, routes, and shared
shell UI. Each feature owns its page, data hook, settings, and plugin metadata.

## Package graph

```text
@crewmate/types
    ^
    +-- @crewmate/state
    +-- @crewmate/lib
            ^
            +-- @crewmate/mail
            +-- @crewmate/calendar
            +-- @crewmate/notes
             +-- @crewmate/tasks
             +-- @crewmate/home-server
                        ^
                        +-- @crewmate/web
```

This diagram is a direction rule rather than an exhaustive dependency list.
Feature packages can use both `state` and `types`, but must not depend directly
on one another. The web app is the composition root.

## Runtime composition

`apps/web/src/plugins/manifest.ts` is server-safe package metadata.
`apps/web/src/plugins/registry.ts` imports the live plugin objects used by the
client shell. A `FeaturePlugin` supplies:

- identity and default settings;
- a lazy page component and optional lazy settings component;
- optional assistant context generated from that feature's cached data;
- optional assistant actions that create a prefill or navigate to a feature.

On a fresh install, `apps/web/src/app/app/page.tsx` derives initial pages and
settings from this registry and passes them to `AppProvider`. `AppShell` renders
enabled pages and keeps editor pages mounted while switching visibility.
Management plugins opt out through `keepMounted: false`, so switching pages
discards transient peer credentials and closes embedded service views.

## Shared state and cross-feature flows

`packages/state/src/index.tsx` owns the reducer and app context. Its state falls
into three groups:

- persisted preferences: enabled pages, active page, settings, panel widths,
  assistant sessions, and the encrypted environment vault envelope;
- transient UI state: overlays, notifications, and AI server availability;
- integration state: `featureData` caches and `pagePrefills` handoffs.

Feature hooks publish fetched models to `featureData[pluginId]`. The assistant
asks each plugin to turn that data into context, so the state package never needs
feature-specific types. To initiate work in another feature, a source dispatches
`SET_PAGE_PREFILL`, navigates, and the destination reads and clears the prefill.
Every enabled feature contributes assistant actions through the same plugin
contract. Chat prompts include bounded history from only the originating
session, and response messages carry that session ID through async completion.
Mail maintains a bounded, two-worker suggestion queue over a sliding window
starting at the active thread. Quick-review cross-page actions carry a
`reviewOrigin` in the one-shot prefill; successful destinations return a
completion prefill to Mail, which archives and advances the source thread.
Mail first uses browser-native, on-device language detection and translation to
determine whether an opened message differs from the user's primary language.
With an explicit, disabled-by-default setting, it can fall back to the configured
AI endpoint when those browser APIs are unavailable. It caches the plain-text
translation by message ID and target language. The UI swaps the displayed body
while retaining the original provider content for its Show original toggle.

A package-backed Web Worker design is scaffolded in Mail but deliberately not
connected to the live flow. Its runtime packages are not installed because the
evaluated dependency tree introduced unresolved high-severity audit findings.
See `AGENTS.md` before enabling or changing that scaffold.

## External data flow

```text
feature component -> feature hook -> /api route -> Google client -> Google API
                                      |
                                      +-> auth/session validation
```

Browser code never imports Google clients. Route handlers obtain the access token
from NextAuth and construct server-only clients through `@crewmate/lib/server`.
Identifiers needed by Google must survive the full round trip; a Calendar event,
for example, is identified by both `event.id` and its source `calendarId`.

In legacy productivity mode, browser code in `@crewmate/lib` talks directly to the
user-configured OpenAI-compatible endpoint. In home-server mode, the host supplies
a runtime-only `/api/ai` override and the authenticated backend forwards to the
fixed `CREWMATE_AI_URL`. Browser input cannot select backend hosts, arbitrary
paths, or credentials. Requests and responses support cancellation; the proxy
forwards streaming responses and limits active generation within the web process.
The llama-server deployment supplies the single runtime slot across consumers.
The browser-visible Auth.js session contains only an opaque account key and
Google authorization status; provider bearer credentials remain server-side.
Persisted browser state is namespaced with that account key.
The persisted provider mounts after hydration, so saved pages and preferences do
not conflict with server-rendered defaults or get overwritten during startup.

## Private home-server boundary

`CREWMATE_AUTH_MODE=local` switches Auth.js to local OIDC and exact owner-subject
matching. Local sessions do not contain Google authorization or retained OIDC
bearer tokens. Google-mode account keys remain compatible; local keys include
the issuer and subject. Preferences are not migrated into another identity.
The fixed AI endpoint overrides reads without overwriting stored endpoint
preferences. No new browser storage holds management credentials or peer keys.

`@crewmate/home-server` contributes six plugins through the normal manifest and
registry. Productivity plugins declare `requiresGoogle`; the local shell shows a
deferred-connection message instead of mounting their data hooks. Local controls
are never assistant actions. Application URLs are operator-configured HTTPS
origins from `/api/home/services`, not editable iframe URLs.

```text
home-server page -> /api/home/* -> owner + origin validation
                                   -> permission-protected Unix socket
                                   -> services/host-manager -> fixed host tools
assistant       -> /api/ai/*   -> owner + origin validation -> llama-server
browser         -> private reverse proxy + identity gateway -> Immich/Portainer
```

Crewmate has no Docker socket. The host manager runs separately from the dashboard
and exposes only metrics, existing VM actions, and peer operations. Mutations use
operation IDs; a lost connection returns an uncertain outcome that must be checked
before another action. Peer configuration is returned only during provisioning,
not from operation history. Independent Compose lifecycles mean dashboard failure
does not stop connectivity, synchronization, or inference.

Gateway policy protects application sessions independently of Auth.js. Crewmate
logout clears its cookie and navigates to the identity logout flow. Existing
downstream cookies are insufficient without gateway authorization; long-lived
connections and browser logout behavior still require live acceptance testing.
Private addressing/HTTPS and official pCloud headless sync remain explicit setup
gates. See `deploy/README.md` for storage ownership, firewall, update/restore, and
live validation. Native synchronized originals are mutable, not an archive;
Immich's read-only mount does not prevent pCloud or host-admin writes.

The Notes Google Doc ends with a versioned, managed configuration footer below
the note body. It backs up enabled pages, the active page, general
and feature settings (including the color scheme), panel widths, and AI endpoint
preferences. Notes strips this footer from its editor, preview, and shared
feature data. On load, the state reducer merges backed-up values over current
configuration so settings introduced after an older backup retain their current
values.
Notes writes are serialized and guarded by Google Docs revision IDs. A remote
revision change becomes an explicit conflict instead of a replacement write.

The same managed footer may contain an encrypted environment-file envelope.
Encryption and decryption happen in the browser with AES-GCM and a PBKDF2 key
derived from a generated password plus a four-digit PIN. The password persists
only in local browser state and is shown in Settings; it is deliberately omitted
from the Notes backup. The PIN and plaintext are never persisted.

## Source-of-truth map

| Concern | Source of truth |
|---|---|
| Shared domain/plugin types | `packages/types/src/index.ts` |
| Global state and persistence | `packages/state/src/index.tsx` |
| Feature contract implementation | `packages/<feature>/src/plugin.tsx` |
| Installed feature metadata | `apps/web/src/plugins/manifest.ts` |
| Runtime feature composition | `apps/web/src/plugins/registry.ts` |
| Google client creation | `packages/lib/src/google.ts` |
| Auth/token refresh | `apps/web/src/auth.ts` |
| Theme tokens | `apps/web/src/app/globals.css` |
| Authenticated-app spacing density | `.crewmate-app` rules in `apps/web/src/app/globals.css` |
| Verification commands | root `package.json` |

## Known structural pressure points

The Calendar, Mail, and Tasks page components are large and combine rendering,
dialog state, and orchestration. When changing them, extract cohesive pure logic
or leaf UI instead of growing the page further. Preserve behavior with focused
tests before moving logic.

Remote hooks manage mutable external data and are sensitive to overlapping
requests. New fetch behavior should define what happens when requests finish out
of order, when a component unmounts, and when a local draft exists.
