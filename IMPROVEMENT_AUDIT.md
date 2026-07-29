# Crewmate Improvement Audit
 
**Scope:** Repository state after integrating remote `master` commit `5321aa3` and porting the still-relevant local changes  
**Audit mode:** Source inspection, integration validation, and dependency review

## Executive summary

Crewmate has a sound technical baseline:

- The project passes ESLint.
- TypeScript strict-mode checking passes.
- The optimized Next.js production build succeeds.
- The production dependency tree has no known vulnerabilities reported by `npm audit`.
- Every Google-facing API route checks for an authenticated session before making a Google API request.
- Gmail HTML is rendered in an iframe that does not permit script execution.

The main risks are not compilation problems. They are runtime correctness, synchronization, privacy, and maintainability issues that static checks do not detect. The most urgent defects are:

1. The AI assistant cannot send a message on a fresh installation because no default session is active.
2. Calendar events loaded from secondary calendars still cannot be deleted reliably.
3. Notes saves can overwrite concurrent Google Docs changes or newer local edits.
4. Calendar timezone settings do not correctly control datetime interpretation or rendering.
5. Older asynchronous responses can overwrite newer Gmail and Calendar views.

Several settings are also exposed in the interface but have no effect, and the current local persistence model can expose one account's assistant history and preferences after switching accounts in the same browser.

## Validation performed

| Check | Result | Notes |
|---|---|---|
| `npm run lint` | Passed | No ESLint errors |
| `npx tsc -p apps/web/tsconfig.json --noEmit --pretty false` | Passed | No TypeScript errors |
| `npm run build` | Passed | All application and API routes compiled |
| `npm audit --omit=dev` | Passed | Zero known production vulnerabilities |
| `npm audit` | Findings | One high-severity development-only finding in `brace-expansion`, through ESLint's `minimatch` dependency chain |
| Automated tests | Not available | No unit, integration, or browser test suite is present |

The first build attempt failed only because the restricted audit sandbox prevented an internal Turbopack process from binding a port. The same build succeeded outside that restriction. This was an environment limitation, not an application build failure.

## Priority model

- **P0 — Critical:** Can block a core feature, lose data, expose sensitive data, or mutate the wrong external resource.
- **P1 — High:** Produces incorrect behavior in realistic use or significantly weakens reliability/security.
- **P2 — Medium:** Misleading behavior, incomplete features, maintainability problems, or significant usability issues.
- **P3 — Low:** Documentation, polish, and repository hygiene.

## Prioritized overview

| Priority | Finding | Primary risk |
|---|---|---|
| P0 | AI assistant has no active first-run session | Core feature silently does nothing |
| P0 | Secondary-calendar deletion targets `primary` | Failed external mutation |
| P0 | Notes replacement save has no concurrency control | User data loss |
| P1 | Calendar timezone handling is semantically incorrect | Events created/displayed at wrong times |
| P1 | Gmail and Calendar requests have stale-response races | Wrong content shown or acted upon |
| P1 | Google access token is exposed to client JavaScript | Unnecessary credential exposure |
| P1 | Local persistence is not scoped by Google account | Cross-account privacy leak |
| P1 | API request validation and error handling are incomplete | Invalid mutations and information leakage |
| P1 | Arbitrary custom URLs are embedded unsandboxed | Unsafe iframe capabilities |
| P1 | Authentication failures are classified inconsistently | Broken recovery and misleading reauthentication |
| P2 | Multiple settings have no runtime effect | Misleading product behavior |
| P2 | Duplicate built-in pages mount duplicate live data clients | Duplicate polling and ambiguous prefills |
| P2 | Gmail remote content loads automatically | Tracking/privacy exposure |
| P2 | Pagination and configured limits are incomplete | Missing data and quota pressure |
| P2 | Large components concentrate too much behavior | High regression risk |
| P2 | No automated test suite exists | Defects remain undetected |
| P2 | Accessibility and responsive behavior are incomplete | Keyboard, assistive-tech, and mobile usability |
| P3 | README, environment documentation, and generated files drift | Developer confusion and noisy changes |

---

## Detailed findings

### 1. AI assistant has no active session on first use

**Priority:** P0  
**Category:** Correctness / first-run experience

#### Evidence

`createInitialState()` creates a default assistant session when no valid persisted sessions exist:

- [`packages/state/src/index.tsx`](packages/state/src/index.tsx)

However, `activeSessionId` is initialized separately:

```ts
activeSessionId: (saved.activeSessionId as string) ?? null
```

On a fresh installation there is no saved ID, so the active ID is `null` even though a session exists.

`sendMessage()` immediately returns when there is no active session:

- [`apps/web/src/components/AIAssistant.tsx`](apps/web/src/components/AIAssistant.tsx)

```ts
if (!text || loading || !state.activeSessionId) return;
```

The user receives no error or explanation. The input simply appears not to work.

There is a related deletion issue in the reducer. When deleting the active session, the replacement ID is selected from `state.assistantSessions[0]` before the deleted session has been excluded. If the deleted session is the first item, `activeSessionId` can continue pointing to the deleted session.

#### Impact

- The main AI feature is nonfunctional for a new user until they manually create another chat.
- A deleted conversation can leave the assistant in another nonfunctional state.
- The failure is silent, so users are likely to assume the AI integration or server is broken.

#### Recommended change

Construct the initial sessions and active ID together:

1. Validate persisted sessions.
2. If valid sessions exist, verify that the persisted active ID refers to one of them.
3. If it does not, select the first valid session.
4. If no sessions exist, create one and use its ID immediately.

For deletion:

1. Produce the filtered session list first.
2. If the active session was deleted, select the first remaining session.
3. If no session remains, immediately create a replacement session or explicitly support a no-session state with a visible “New chat” action.

Also remove the invalid nested-button structure in the session list. A session row is a `<button>` containing another delete `<button>`, which is invalid interactive HTML and can behave inconsistently with keyboards and assistive technology.

#### Acceptance criteria

- On a clean browser profile, the first message can be sent immediately.
- Deleting the active session always selects a valid remaining session.
- Deleting the last session leaves a usable new session.
- The session delete control is not nested inside another button.
- Reducer tests cover fresh initialization, stale persisted IDs, active deletion, and last-session deletion.

---

### 2. Secondary-calendar deletion still targets `primary`

**Priority:** P0  
**Category:** External mutation correctness

#### Evidence

Calendar listing adds the source calendar ID to each event:

- [`apps/web/src/app/api/calendar/events/route.ts`](apps/web/src/app/api/calendar/events/route.ts)

The page also uses `event.calendarId` for coloring and displays the calendar name. Creation can target a selected calendar.

The new master commit improved update behavior: `useCalendar.updateEvent()` now accepts the source calendar ID, includes it in the PATCH body, and the API route uses it. Deletion does not preserve that behavior and still hard-codes:

```ts
calendarId: "primary"
```

See:

- [`apps/web/src/app/api/calendar/events/[id]/route.ts`](apps/web/src/app/api/calendar/events/[id]/route.ts)

The delete hook accepts only the event ID:

- [`packages/calendar/src/useCalendar.ts`](packages/calendar/src/useCalendar.ts)

The page likewise calls:

```ts
cal.deleteEvent(id)
```

without the source calendar ID. Update calls now pass `editingEvent.calendarId` and are no longer part of this defect.

#### Impact

- Deleting a secondary-calendar event fails for the same reason.
- Error messages do not explain that the wrong calendar was targeted.
- Multi-calendar display and update support appear complete while deletion remains incomplete.

#### Recommended change

Pass `calendarId` through the delete mutation layers:

```text
CalendarPage
  -> useCalendar
    -> API route
      -> Google Calendar API
```

Use a query parameter such as `DELETE /api/calendar/events/:id?calendarId=...`, or another explicit request shape supported consistently by the client and route.

Validate that `calendarId` is a non-empty string. Preserve it on the response because Google event data does not automatically include the source calendar ID.

The calendar list should also expose `accessRole`. Read-only calendars should remain viewable but should disable edit/delete actions and should not be selectable as a default creation target.

#### Acceptance criteria

- Events can be created, edited, and deleted on the primary calendar.
- Events can be deleted on every writable secondary calendar.
- Events on read-only calendars do not show enabled mutation controls.
- Route tests verify that the supplied calendar ID is passed to the Google client.

---

### 3. Notes saving can overwrite newer changes

**Priority:** P0  
**Category:** Data integrity / synchronization

#### Evidence

The Notes page sends the entire current document as one string:

- [`packages/notes/src/useNotes.ts`](packages/notes/src/useNotes.ts)

The server:

1. Reads the Google Doc to find its current end index.
2. Deletes all existing content.
3. Inserts the submitted text.

See:

- [`apps/web/src/app/api/docs/content/route.ts`](apps/web/src/app/api/docs/content/route.ts)

There is no revision identifier, `requiredRevisionId`, ETag, comparison token, or merge strategy. A Google Docs edit made after the client last loaded the document can therefore be overwritten by the next Crewmate save.

There is also a local race:

1. Save A begins with content version A.
2. The user types version B while A is in flight.
3. Save A succeeds.
4. `setDirty(false)` runs even though B has not necessarily been saved.

Multiple saves are not serialized, so an older request can also complete after a newer request.

Finally, the GET implementation extracts only paragraph text. Content in tables or other structural elements may not be represented. The subsequent replacement save can destroy unsupported structure and formatting.

#### Impact

- External Google Docs changes can be permanently overwritten.
- Newer local typing can be incorrectly marked saved.
- Out-of-order saves can restore older document content.
- Rich Google Docs structure can be flattened or discarded.
- Auto-refresh may load remote content after an incorrect clean-state transition.

#### Recommended change

At minimum:

1. Track a monotonically increasing local draft version.
2. Capture the version and content at the start of every save.
3. Serialize saves so only one is active at a time.
4. After a response, clear `dirty` only when the current draft version equals the saved version.
5. If another version exists, immediately queue the newest content.

For remote concurrency:

1. Return the Google document `revisionId` with GET.
2. Send the revision ID back with PUT.
3. Use Google Docs write controls such as `requiredRevisionId`.
4. Return HTTP 409 on revision conflict.
5. Offer the user a conflict UI: reload remote, keep local as a copy, or merge.

Longer term, consider using a dedicated app-owned document format or append/patch operations instead of replacing an entire Google Doc. If Crewmate intentionally supports only plain-text Markdown stored in a Google Doc, clearly communicate that editing rich structure externally is unsupported.

#### Acceptance criteria

- Typing while a save is in flight never clears the unsaved indicator for the newer draft.
- Saves are applied in current-version order.
- A remote document revision change results in a visible conflict, not silent replacement.
- Closing or navigating away while dirty triggers a final save attempt or a warning.
- Tests simulate out-of-order network responses and external revision conflicts.

---

### 4. Calendar timezone behavior is incorrect

**Priority:** P1  
**Category:** Date/time correctness

#### Evidence

The user enters a `datetime-local` value such as:

```text
2026-07-29T09:00
```

Creation converts it with:

```ts
new Date(formStart).toISOString()
```

See:

- [`packages/calendar/src/CalendarPage.tsx`](packages/calendar/src/CalendarPage.tsx)

A datetime string without an offset is interpreted in the browser's local timezone. The code then attaches the separately configured calendar timezone to a UTC timestamp. The selected timezone therefore does not determine the conversion.

Event rendering and edit-form population use `parseISO()` and `format()` in the browser timezone:

- [`packages/calendar/src/CalendarPage.tsx`](packages/calendar/src/CalendarPage.tsx)

This means the timezone setting is mostly metadata sent to Google, not the timezone used by Crewmate's UI.

#### Impact

- A user in Amsterdam selecting an America/New_York calendar timezone can create an event several hours away from the intended time.
- Existing events can display in the browser timezone instead of the configured timezone.
- Editing an event can shift it after round-trip conversion.
- Day boundaries and multi-day classification can be wrong around midnight and daylight-saving transitions.

#### Recommended change

Define a single timezone policy:

- **Option A:** Always use the browser timezone and remove the configurable timezone.
- **Option B:** Treat the configured timezone as authoritative for entry, rendering, layout, and Google API operations.

If retaining the setting, use a timezone-aware library such as `date-fns-tz`, Luxon, or Temporal-compatible utilities. Convert:

```text
wall-clock datetime + IANA timezone
```

into an instant explicitly. Format every timed event in the configured timezone. Keep all-day dates as date-only values and avoid converting them through UTC instants.

Validate IANA timezone names before saving the setting.

#### Acceptance criteria

- Creating 09:00 in a selected timezone results in 09:00 in that timezone in Google Calendar.
- Viewing and editing the event does not shift its time.
- Tests cover two different browser/configured timezones.
- Tests cover daylight-saving start and end dates.
- All-day events remain on the selected dates across positive and negative UTC offsets.

---

### 5. Stale asynchronous responses can overwrite current UI state

**Priority:** P1  
**Category:** Concurrency / UI correctness

#### Evidence

When a Gmail thread is opened, the selected ID is changed and then its messages are fetched:

- [`packages/mail/src/GmailPage.tsx`](packages/mail/src/GmailPage.tsx)

If the user opens thread A and quickly opens thread B, A may resolve after B and call `setMessages(msgs)`. AI analysis has the same problem because all thread results write to a shared `aiActions` state without checking which thread is active.

The thread-list hook uses one abort controller, but an aborted request's `finally` block can set `loading` to false after a newer request has already started:

- [`packages/mail/src/useGmail.ts`](packages/mail/src/useGmail.ts)

Calendar fetching has no cancellation or request identity:

- [`packages/calendar/src/useCalendar.ts`](packages/calendar/src/useCalendar.ts)

Fast cursor changes or refreshes can allow an older event range to replace the latest range.

#### Impact

- The selected Gmail subject can be paired with another thread's messages.
- AI actions can refer to the wrong email.
- A destructive AI-suggested action could be interpreted in the wrong context.
- Calendar can display an older month after the user has navigated elsewhere.
- Loading indicators can disappear while work remains active.

#### Recommended change

For every keyed fetch:

1. Create an abort controller or request sequence number.
2. Abort the preceding request when the resource key changes.
3. Capture the resource key with the request.
4. Before committing state, verify that the request is still current.
5. Only the current request may clear the current loading flag.

For Gmail AI analysis, store actions by thread ID and derive the visible actions from `activeThreadId` rather than maintaining one unkeyed action array.

A query library such as TanStack Query or SWR could centralize request keys, cancellation, cache freshness, retries, and deduplication, but a small request-ID mechanism is sufficient if another dependency is not desired.

#### Acceptance criteria

- Rapidly selecting multiple Gmail threads always ends on the last selected thread's messages and AI actions.
- Rapid calendar navigation always ends on the last requested range.
- Aborted requests do not show error notifications.
- Older requests cannot clear a newer request's loading state.
- Automated tests resolve mocked requests out of order.

---

### 6. Several settings have no effect

**Priority:** P2  
**Category:** Product correctness

#### Evidence

The interface exposes settings for:

- Gmail maximum threads
- Calendar weekend visibility
- Calendar declined-event visibility
- Calendar visible start and end hour
- Task default filter
- Task sort order

The state model also contains Gmail `defaultQuery`.

Definitions are in:

- [`packages/state/src/index.tsx`](packages/state/src/index.tsx)
- [`apps/web/src/components/SettingsPanel.tsx`](apps/web/src/components/SettingsPanel.tsx)

These values are not consumed by the relevant Gmail, Calendar, or Tasks pages. Gmail's API route hard-codes 25 results. Calendar renders all seven days and 24 hours. Tasks initializes its own filter to `"all"` and does not apply the configured sort.

Task setting values also use domain names such as `"pending"` and `"done"`, while Google Tasks uses `"needsAction"` and `"completed"`.

#### Impact

- Users change settings and see no change.
- Persisted configuration implies functionality that does not exist.
- Future debugging becomes difficult because state appears configured correctly.
- Inconsistent task status vocabularies invite conversion bugs.

#### Recommended change

For each setting, either implement it fully or remove it from the UI until supported.

Suggested wiring:

- Pass `maxThreads` to the Gmail API as a validated server-side limit.
- Initialize Gmail query from `defaultQuery`.
- Filter Saturday/Sunday columns and labels when weekends are disabled.
- Filter declined events based on attendee response status.
- Generate Calendar hours from `startHour` to `endHour`.
- Initialize Tasks filter from the configured value after mapping to Google statuses.
- Apply a stable sort for due date, created/updated date, or another supported property.

#### Acceptance criteria

- Every visible setting has a test demonstrating a visible or network-level effect.
- Settings use one consistent status vocabulary.
- Invalid persisted settings fall back to defaults.
- Unsupported settings are not displayed.

---

### 7. Google access tokens are exposed to browser JavaScript

**Priority:** P1  
**Category:** Authentication / credential minimization

#### Evidence

The Auth.js session callback copies the Google access token into the browser-visible session:

- [`apps/web/src/auth.ts`](apps/web/src/auth.ts)

The TypeScript session augmentation also declares it as required:

- [`apps/web/src/types/next-auth.d.ts`](apps/web/src/types/next-auth.d.ts)

Client components use the token only as a truthy authentication signal. Actual Google requests are made by server API routes, which can obtain the token from the server-side session.

#### Impact

- Any successful client-side script injection can extract a Google token with Gmail, Calendar, Docs, Drive, and Tasks scopes.
- The exposure is unnecessary for current functionality.
- The broad OAuth scope increases the consequence of token theft.

#### Recommended change

Keep `accessToken` and `refreshToken` in the server-side JWT only. Expose:

- Normal Auth.js session/user data
- An optional boolean or status indicating that Google authorization is healthy
- A safe error code such as `RefreshAccessTokenError`

Client components should use `useSession().status` or the safe authorization status rather than checking the raw token.

Also review whether every requested OAuth scope is necessary. If features can be independently enabled, consider incremental authorization rather than requesting all scopes at sign-in.

#### Acceptance criteria

- `getSession()` in the browser does not contain Google access or refresh tokens.
- All Google API routes continue to work.
- Expired authorization produces a safe client-visible status.
- Tests verify that session serialization omits credentials.

---

### 8. Local persistence is shared across signed-in accounts

**Priority:** P1  
**Category:** Privacy / persistence

#### Evidence

All persisted state uses one browser key:

```ts
const STORAGE_KEY = "crewmate-state";
```

See:

- [`packages/state/src/index.tsx`](packages/state/src/index.tsx)

Persisted data includes:

- Custom page labels and URLs
- Current page and UI settings
- Opencode URL and model
- Assistant conversations and messages
- Active conversation
- Panel dimensions

There is no account identifier in the key, and signing out does not clear or re-scope the data.

Assistant conversations may repeat or summarize email, note, task, and calendar content. A second account using the same browser can therefore see the first account's history.

`localStorage.setItem()` is also unguarded. An unlimited number of conversations can exceed the browser quota and throw from the persistence effect.

#### Impact

- Cross-account information disclosure on shared browsers or after account switching.
- Sensitive assistant history remains after sign-out.
- Persistence may fail once browser storage is full.
- A malformed or outdated payload can produce inconsistent state because validation is absent.

#### Recommended change

Namespace persisted state by a stable, non-secret user identifier, for example:

```text
crewmate-state:<hashed-user-id>
```

Do not use an access token or email address directly in the key.

Add:

- A schema version
- Runtime validation/migration
- Limits on number of sessions and messages
- `try/catch` around reads and writes
- A visible “Clear local data” control
- A deliberate sign-out policy: clear automatically, or clearly state that data remains on the device

Consider storing sensitive conversation history in IndexedDB with explicit retention controls, or not persisting it by default.

#### Acceptance criteria

- Switching accounts never displays another account's persisted state.
- Quota failures do not crash an effect or repeatedly throw.
- Old schema versions migrate or reset safely.
- Users can delete all locally stored Crewmate data.

---

### 9. API input validation and error normalization are incomplete

**Priority:** P1  
**Category:** API robustness / security

#### Evidence

Most routes parse arbitrary JSON and rely on TypeScript assertions, which provide no runtime validation:

- [`apps/web/src/app/api/gmail/send/route.ts`](apps/web/src/app/api/gmail/send/route.ts)
- [`apps/web/src/app/api/calendar/events/route.ts`](apps/web/src/app/api/calendar/events/route.ts)
- [`apps/web/src/app/api/calendar/events/[id]/route.ts`](apps/web/src/app/api/calendar/events/[id]/route.ts)
- [`apps/web/src/app/api/docs/content/route.ts`](apps/web/src/app/api/docs/content/route.ts)
- [`apps/web/src/app/api/tasks/items/route.ts`](apps/web/src/app/api/tasks/items/route.ts)

Examples:

- Calendar POST forwards all remaining body properties directly to Google.
- Task status accepts any string.
- Invalid date strings reach `new Date(...).toISOString()`, which can throw.
- Notes content has no type or size check.
- Gmail `To`, `Subject`, and reply headers are interpolated directly into raw MIME headers without CR/LF rejection.
- Many routes return `err.message` or `String(err)` directly to the client.
- Malformed JSON often becomes an unhandled exception rather than a controlled 400 response.

#### Impact

- Invalid client input can produce 500 responses.
- Header injection is possible in raw MIME construction.
- Accidental or future client bugs can forward unsupported Calendar fields.
- Google SDK details and internal error messages can leak to the client.
- Unbounded input can create memory, latency, and quota problems.

#### Recommended change

Introduce a shared validation layer using Zod, Valibot, or explicit validators.

Each route should:

1. Parse JSON safely.
2. Return 400 for malformed JSON.
3. Validate types, lengths, enums, dates, and identifiers.
4. Construct an allowlisted Google request object.
5. Log detailed errors server-side with a request/correlation ID.
6. Return a stable public error code and safe message.

For Gmail:

- Reject CR and LF in every header field.
- Parse and validate recipient addresses.
- Encode non-ASCII subjects correctly.
- Escape or intentionally handle message bodies based on whether composition is plain text or HTML.
- Use the RFC `Message-ID` header for `In-Reply-To`, not Gmail's internal message ID. The thread endpoint currently does not expose `Message-ID`, so it should be added.

#### Acceptance criteria

- Malformed JSON returns 400.
- Invalid task statuses and dates return actionable 400 errors.
- MIME header injection attempts are rejected.
- Calendar mutations forward only documented fields.
- Client responses do not expose raw Google SDK errors.
- Route tests cover invalid, oversized, and malicious inputs.

---

### 10. Custom pages embed arbitrary URLs without a sandbox

**Priority:** P1  
**Category:** Browser security / custom content

#### Evidence

The custom page renderer directly uses:

```tsx
<iframe src={url} ... />
```

See:

- [`apps/web/src/components/pages/CustomPage.tsx`](apps/web/src/components/pages/CustomPage.tsx), line 11

Navigation accepts arbitrary input and does not validate the scheme:

- [`apps/web/src/components/Navigation.tsx`](apps/web/src/components/Navigation.tsx)

The iframe has no:

- `sandbox`
- `allow` permissions policy
- `referrerPolicy`
- `title`
- URL-scheme restriction

#### Impact

- Non-HTTP schemes may be accepted depending on browser behavior.
- Embedded pages receive more iframe capabilities than necessary.
- Same-origin custom content could access parent-origin data.
- External pages receive the default referrer behavior.
- Many sites refuse framing through `X-Frame-Options` or CSP, resulting in an unexplained blank page.

#### Recommended change

Validate URLs with `new URL()` and allow only `https:` and, for local development if required, `http:`.

Use a restrictive sandbox based on intended functionality, for example starting with:

```html
sandbox="allow-forms allow-scripts"
```

Add capabilities only when justified. Avoid `allow-same-origin` combined with `allow-scripts` for untrusted same-origin content.

Add:

- A descriptive `title`
- A restrictive `allow` policy
- `referrerPolicy="no-referrer"` or a documented alternative
- A visible fallback with “Open in new tab”
- Validation feedback before the page is added

#### Acceptance criteria

- Invalid and unsafe URL schemes cannot be saved.
- Custom iframes have an explicit sandbox and permissions policy.
- Frame-blocked pages show an understandable fallback.
- The iframe is accessible by name/title.

---

### 11. Gmail remote content can track email opens

**Priority:** P2  
**Category:** Privacy

#### Evidence

HTML email bodies are placed into `srcDoc` and rendered immediately:

- [`packages/mail/src/GmailPage.tsx`](packages/mail/src/GmailPage.tsx)

The sandbox blocks scripts because `allow-scripts` is absent, which is good. It does not block:

- `<img src="https://...">`
- CSS background URLs
- Other passive remote resources

Fetching those resources can disclose IP address, browser characteristics, and the fact that a specific email was opened.

#### Impact

- Marketing and malicious senders can receive open notifications.
- Privacy differs from the expectations users may have from Gmail's proxying behavior.
- CSS-based resources may be less obvious than visible images.

#### Recommended change

Sanitize email HTML before rendering and block remote URLs by default. Offer:

- “Load remote images”
- Optional “Always load images from this sender”

A content-security-policy meta tag in `srcDoc`, or HTML rewriting to replace remote resource URLs, can enforce the default. Preserve inline/cid images only if they are fetched safely through a controlled server path.

Continue blocking scripts and forms. Review whether `allow-same-origin` is needed; it is currently used so the parent can measure iframe content, but alternative resize strategies may permit a stricter sandbox.

#### Acceptance criteria

- Opening an email does not issue third-party image or CSS requests by default.
- Users can explicitly load remote content.
- Scripts and form submission remain blocked.
- HTML sanitizer tests cover scripts, event attributes, image URLs, CSS URLs, and malformed markup.

---

### 12. Authentication error handling is inconsistent

**Priority:** P1  
**Category:** Reliability / session recovery

#### Evidence

`isAuthError()` treats all HTTP 403 responses as authentication failures:

- [`packages/lib/src/googleApiError.ts`](packages/lib/src/googleApiError.ts)

Google uses 403 for multiple conditions, including insufficient access, read-only resources, disabled APIs, and quotas. Reauthentication cannot fix all of them.

The Gmail page attempts:

```ts
gmail.fetchThreads(q).catch(() => setAuthError(true))
```

but `fetchThreads()` catches its own errors and does not rethrow:

- [`packages/mail/src/useGmail.ts`](packages/mail/src/useGmail.ts)

Therefore the outer catch never runs.

Auth.js places `RefreshAccessTokenError` on the session, but pages generally check only for the presence of `accessToken`, which may still contain an expired token.

The Gmail send route also omits the shared `isAuthError()` handling entirely.

#### Impact

- Quota or permission problems can trigger misleading “session expired” behavior.
- A genuinely expired session may only show generic load failures.
- Different pages recover differently from the same authorization state.
- Users can become stuck repeatedly signing in without resolving the real problem.

#### Recommended change

Create a central client fetch wrapper and a central server Google-error mapper.

Distinguish:

- 401: expired or invalid credentials
- 403 permission: insufficient scope or read-only resource
- 403 quota/rate limit: retryable or quota-specific
- 404: resource missing
- 409: conflict
- 429: retry after backoff
- 5xx: transient provider failure

Expose safe error codes such as:

```text
AUTH_EXPIRED
INSUFFICIENT_SCOPE
READ_ONLY_RESOURCE
RATE_LIMITED
RESOURCE_NOT_FOUND
```

Client components should handle `AUTH_EXPIRED` consistently and prompt for reauthentication. Other errors should retain the user's current state and show relevant guidance.

#### Acceptance criteria

- Expired credentials reliably trigger one reauthentication path.
- Quota and permission errors do not masquerade as expired sessions.
- Gmail send, list, read, archive, star, and trash use consistent mapping.
- Client fetch helpers preserve useful safe error codes.

---

### 13. Duplicate built-in pages create duplicate live data clients

**Priority:** P2  
**Category:** Architecture / resource usage

#### Evidence

The Add Page modal permits adding additional Notes and Tasks pages:

- [`apps/web/src/components/Navigation.tsx`](apps/web/src/components/Navigation.tsx)

`AppShell` maps over every configured page and mounts a full component for each one, hiding inactive pages with `display: none`:

- [`apps/web/src/components/AppShell.tsx`](apps/web/src/components/AppShell.tsx)

A hidden Notes or Tasks page remains active. It can:

- Initialize the same Google Doc or task list
- Start auto-refresh timers
- Observe the same global prefill
- Issue saves or mutations
- Maintain a second conflicting local state

Global prefills have no target page ID, so multiple mounted instances race to consume them.

#### Impact

- Duplicate Google API calls and quota consumption.
- Unclear semantics: multiple Notes pages still point to the same “Crewmate Notes” document.
- Prefill content may be consumed by an arbitrary hidden instance.
- Multiple local copies of remote state can diverge.

#### Recommended change

Choose one explicit product model:

1. **Singleton built-ins:** Mail, Calendar, Notes, and Tasks may each exist only once. Only custom pages can be added repeatedly.
2. **True multi-instance pages:** Each Notes/Tasks page stores a resource identifier, and prefills include a target page ID.

For the current architecture, singleton built-ins are considerably simpler and align with the single Google Doc/task-list initialization routes.

Also decide whether hidden pages need to stay mounted. If state preservation is important, lift page state into a keyed store. Otherwise mount only the active page to eliminate background effects.

#### Acceptance criteria

- The UI cannot create semantically ambiguous duplicate built-in pages, or each duplicate has its own resource.
- A prefill is consumed exactly once by its intended target.
- Hidden pages do not issue unnecessary polling calls.

---

### 14. Pagination and configured limits are incomplete

**Priority:** P2  
**Category:** Data completeness / performance

#### Evidence

Calendar requests specify:

```ts
maxResults: 250
```

but never follow `nextPageToken`:

- [`apps/web/src/app/api/calendar/events/route.ts`](apps/web/src/app/api/calendar/events/route.ts)

Busy calendars can therefore silently omit events.

Gmail thread listing hard-codes:

```ts
maxResults: 25
```

- [`apps/web/src/app/api/gmail/threads/route.ts`](apps/web/src/app/api/gmail/threads/route.ts)

The UI's `maxThreads` setting offers 10, 20, and 50 but is not used. Gmail also performs up to 25 individual thread metadata requests concurrently with `Promise.all`, which can cause latency bursts and quota pressure.

#### Impact

- Calendar data can be incomplete without warning.
- Gmail settings do not correspond to network behavior.
- Large bursts of provider requests increase rate-limit risk.
- A single Gmail thread metadata failure rejects the entire page response.

#### Recommended change

Calendar:

- Iterate through `nextPageToken` up to a deliberate cap.
- If a cap is reached, return a truncation indicator.
- Consider caching calendar ranges briefly.

Gmail:

- Accept and validate a `limit` parameter.
- Cap it server-side.
- Use controlled concurrency rather than unbounded `Promise.all`.
- Consider tolerating individual metadata failures and returning partial results with diagnostics.

#### Acceptance criteria

- Calendar results follow pagination or explicitly report truncation.
- Gmail's maximum-thread setting changes the number requested/displayed.
- Provider concurrency has a documented maximum.
- Partial Gmail metadata failures do not necessarily erase the whole list.

---

### 15. Large components concentrate too much behavior

**Priority:** P2  
**Category:** Maintainability

#### Evidence

Approximate source sizes at audit time:

| File | Lines |
|---|---:|
| `packages/calendar/src/CalendarPage.tsx` | 2,063 |
| `packages/mail/src/GmailPage.tsx` | 1,322 |
| `packages/tasks/src/TasksPage.tsx` | 847 |
| `apps/web/src/components/SettingsPanel.tsx` | 519 |
| `apps/web/src/components/AIAssistant.tsx` | 496 |
| `packages/state/src/index.tsx` | 409 |

The new master commit made a valuable architectural improvement by introducing npm workspaces and feature packages. It also extracted `useNotes`, `useTasks`, plugin metadata, and settings sections. Those changes reduce cross-feature coupling, but the largest page components still concentrate substantial UI and domain behavior.

These components combine:

- Remote fetching
- Mutation logic
- Derived domain calculations
- AI prompting and parsing
- Modal/form state
- Rendering
- Notifications
- Cross-page navigation
- Persistence

#### Impact

- Small changes can affect unrelated behavior.
- Functions are difficult to unit test without rendering an entire page.
- State dependencies and request races are harder to see.
- Repeated fetch and error patterns diverge between pages.
- New contributors need a large mental model before making safe changes.

#### Recommended change

Extract along domain boundaries, not merely by visual size.

Example Calendar structure:

```text
calendar/
  api.ts
  types.ts
  timezone.ts
  layout.ts
  useCalendarEvents.ts
  CalendarToolbar.tsx
  MonthView.tsx
  WeekView.tsx
  EventForm.tsx
  EventDetails.tsx
```

Example Gmail structure:

```text
gmail/
  api.ts
  mime.ts
  sanitizeEmail.ts
  useThreads.ts
  useThread.ts
  useEmailActions.ts
  ThreadList.tsx
  ThreadView.tsx
  ComposeDialog.tsx
```

Keep pure functions—calendar layout, date conversions, MIME formatting, action parsing—independent of React so they can be tested directly.

#### Acceptance criteria

- Remote data logic is separated from presentation.
- Pure domain functions have focused unit tests.
- No page component is responsible for unrelated provider, AI, persistence, and modal concerns simultaneously.
- Shared error and request handling is reused rather than copied.

---

### 16. No automated test suite exists

**Priority:** P2  
**Category:** Quality assurance

#### Evidence

The repository has no:

- Unit test runner configuration
- Test files
- Integration test harness
- Playwright or Cypress configuration
- `test` script in `package.json`

Static validation passes, but it cannot detect the runtime defects described in this report.

#### Impact

- First-run state, request races, timezones, and multi-calendar behavior can regress unnoticed.
- Refactoring large components is risky.
- Provider request shapes are not verified.
- Manual validation becomes the release bottleneck.

#### Recommended change

Adopt a layered test strategy.

#### Unit tests

- App reducer and initial-state migration
- AI action parsing and validation
- Gmail MIME construction and header sanitization
- Gmail payload decoding
- Calendar timezone conversion
- All-day and overlapping-event layout
- Task status mapping and sorting

#### Route tests

- Missing authentication
- Malformed JSON
- Invalid fields and dates
- Correct secondary `calendarId`
- Google error mapping
- Notes revision conflicts
- Pagination

#### Component tests

- First AI message
- Session deletion
- Notes dirty/save state
- Inactive settings becoming active
- Read-only calendar controls

#### Browser tests

- Sign-in redirect behavior with mocked authentication
- Calendar create/edit/delete across two calendars
- Rapid Gmail thread selection with out-of-order responses
- Notes conflict recovery
- Custom-page URL validation
- Keyboard navigation and modal focus

#### Acceptance criteria

- `npm test` runs unit and route tests.
- CI runs lint, type checking, tests, and production build.
- Critical defects in findings 1–5 have regression tests.

---

### 17. Accessibility and responsive behavior are incomplete

**Priority:** P2  
**Category:** UX / accessibility

#### Evidence

Examples include:

- Nested interactive buttons in the assistant session list.
- Many icon-only buttons relying on `title` instead of an explicit accessible name.
- Clickable `<div>` elements used as checkboxes or selection controls.
- Custom iframe missing a title.
- Modals without dialog semantics, focus trapping, or focus restoration.
- Context-menu removal available only through right-click.
- Desktop-sized fixed panels such as a 520px compose window.
- Root layout based on `h-screen` rather than dynamic viewport units.
- Almost no responsive layout behavior.

#### Impact

- Keyboard-only users cannot reliably discover or activate every control.
- Screen readers receive incomplete semantics.
- Modal focus can move behind overlays.
- Touch users cannot access right-click-only operations.
- The interface can overflow or become unusable on small screens and mobile browser viewport changes.

#### Recommended change

Perform an accessibility pass using semantic HTML first:

- Use actual checkbox inputs or buttons with `role`, `aria-checked`, and keyboard support.
- Give icon-only buttons `aria-label`.
- Mark modals with `role="dialog"` and `aria-modal="true"`.
- Trap focus within modals and restore focus on close.
- Provide visible remove actions for custom pages.
- Ensure every action is usable with Enter and Space.
- Respect `prefers-reduced-motion`.

For responsiveness:

- Use `min-height: 100dvh`.
- Collapse or drawer-enable navigation on narrow screens.
- Stack panels rather than preserving multiple fixed-width sidebars.
- Make compose and event forms fit within viewport padding.
- Define supported minimum viewport dimensions if mobile is intentionally out of scope.

#### Acceptance criteria

- No nested interactive elements.
- Keyboard users can reach and activate every action.
- Modal focus cannot escape behind the overlay.
- Automated accessibility checks report no serious violations.
- Core workflows work at a documented small-screen width.

---

### 18. Documentation and repository hygiene have drifted

**Priority:** P3  
**Category:** Developer experience

#### Evidence

The README says the project uses TypeScript 5, while `package.json` uses TypeScript 6.

The README documents:

```env
NEXT_PUBLIC_OPENCODE_URL=http://localhost:4096
```

but:

- The code never reads `NEXT_PUBLIC_OPENCODE_URL`.
- The current `.env.example` does not contain it.
- Initial state hard-codes `http://localhost:4096`.

The API documentation also does not fully describe every implemented method, such as Gmail star toggling and task deletion.

The incoming master commit removed the previously tracked root `tsconfig.tsbuildinfo`. The integration additionally ignores `*.tsbuildinfo`, so generated incremental compiler state is no longer an outstanding issue.

#### Impact

- New developers follow configuration that has no effect.
- API consumers receive incomplete documentation.
- Version claims become unreliable.

#### Recommended change

- Update the technology table to the installed TypeScript version.
- Either implement the Opencode environment variable or remove it from the README.
- Keep `.env.example` and README synchronized.
- Generate or maintain a complete API route table.
- Document required Node.js and npm versions.
- Add test and CI instructions once introduced.

#### Acceptance criteria

- Every documented environment variable is read by the application.
- `.env.example` contains every required variable and no unused variable.
- README scripts and API methods match the repository.

---

## Additional implementation recommendations

These are not separate defects, but they support several remediations above.

### Validate persisted state deeply

Current `pageSettings` restoration is a shallow top-level merge:

```ts
pageSettings: {
  ...DEFAULT_PAGE_SETTINGS,
  ...(saved.pageSettings ?? {}),
}
```

If an older persisted `calendar` object lacks newly added fields, that entire nested default object is replaced. Perform a nested merge for each settings section after runtime validation.

Loading localStorage during the reducer initializer can also produce client state that differs from server-rendered markup. Consider rendering stable defaults through hydration and loading persisted state in a controlled post-mount step, with an intentional loading boundary or external-store snapshot.

### Avoid treating all provider operations as equally retryable

Reads may be retried safely with backoff. Creates, sends, and other mutations need idempotency or explicit user confirmation before retrying, or they can create duplicate emails, events, or tasks.

### Add confirmation or undo for destructive actions

Calendar deletion, bulk email trash, conversation clearing, and custom-page removal should have confirmation or a short undo window. Gmail trash is recoverable in Google, but the Crewmate UI does not expose restoration. Calendar deletion may be harder for the user to reverse from within the app.

### Limit and validate AI output

AI actions currently require a user click, which is an important safety boundary. Preserve it.

Add runtime validation for action arrays:

- Supported action type
- String length limits
- Valid page IDs
- Valid dates
- Safe labels and payloads
- Maximum number of actions

Treat email, note, and task text as untrusted prompt content. Delimit it clearly and instruct the model that content inside the context is data, not instructions. This reduces prompt-injection risk but does not replace output validation.

### Make AI data sharing explicit

Crewmate sends email metadata, notes, tasks, and calendar context to the configured Opencode server. Because the server URL is user-configurable, the settings UI should explain exactly what data can be sent and warn before accepting a non-local or non-HTTPS endpoint.

### Avoid blindly applying the npm audit suggestion

The production tree reported zero known vulnerabilities. The full audit reported one high-severity development-only finding in `brace-expansion`, pulled in through ESLint's `minimatch` dependency chain. Apply a compatible upstream or transitive patch when available, then re-run lint, type-check, build, and audit. Do not run `npm audit fix --force` without reviewing compatibility.

Instead:

1. Check for compatible patched releases of ESLint and `eslint-config-next`.
2. Update them together.
3. Re-run lint and production build.
4. If no compatible release exists, document the development-only exposure and monitor the upstream dependency.

## Recommended delivery roadmap

### Phase 1 — Stop incorrect behavior and data loss

1. Fix default/active AI session initialization and session deletion.
2. Pass and validate `calendarId` through Calendar deletion.
3. Serialize Notes saves and add local version tracking.
4. Introduce remote revision conflict detection for Notes.
5. Add stale-request protection to Gmail and Calendar.

### Phase 2 — Harden privacy and API boundaries

1. Remove Google tokens from the client-visible session.
2. Namespace and validate persisted state by user.
3. Add route schemas, safe error codes, and request size limits.
4. Sanitize MIME headers and correctly support RFC reply headers.
5. Validate and sandbox custom-page URLs.
6. Block Gmail remote resources by default.

### Phase 3 — Restore product consistency

1. Correct timezone-aware entry and rendering.
2. Implement or remove inactive settings.
3. Resolve duplicate built-in page semantics.
4. Add Calendar and Gmail pagination.
5. Add confirmation/undo behavior for destructive actions.

### Phase 4 — Make future changes safer

1. Extract pure domain and API modules from large components.
2. Add unit and route tests for critical behavior.
3. Add Playwright regression flows.
4. Add CI for lint, type checking, tests, build, and audit reporting.
5. Complete accessibility and responsive-design work.
6. Synchronize README, environment examples, scripts, and repository ignores.

## Suggested first pull requests

Keeping early changes small will reduce risk.

### PR 1: AI session lifecycle

- Correct initial active ID.
- Correct deletion fallback.
- Remove nested buttons.
- Add reducer and component tests.

### PR 2: Calendar mutation identity

- Carry `calendarId` through deletion.
- Preserve it in local responses.
- Add read-only calendar role handling.
- Add route tests.

### PR 3: Notes save coordinator

- Add draft sequence numbers.
- Serialize saves.
- Prevent stale responses from clearing dirty state.
- Add out-of-order response tests.

### PR 4: Request race protection

- Add keyed cancellation/current-request checks to Gmail and Calendar.
- Key Gmail AI actions by thread ID.
- Add race-condition tests.

### PR 5: API validation foundation

- Add a validation library or shared validators.
- Add safe JSON parsing and normalized errors.
- Apply it first to Gmail send, Calendar create/update, and Tasks mutations.

## Definition of “healthy” for the next milestone

The application would be in a substantially safer state when:

- All first-run features work without hidden setup steps.
- Every external mutation targets the resource the user selected.
- Notes never silently overwrite a concurrent revision.
- Time entry and display have a single tested timezone policy.
- Older requests cannot overwrite newer navigation.
- Browser sessions do not expose Google credentials.
- Local state is isolated between accounts.
- Every visible setting has an observable effect.
- Critical flows have automated regression coverage.
- Documentation accurately describes the code users run.
