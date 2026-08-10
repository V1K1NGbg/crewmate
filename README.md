# Crewmate

An AI-powered dashboard that integrates your Email, Calendar, Notes, and Tasks into a single interface, with an assistant that connects to any OpenAI-compatible API.

---

## Features

- **Mail** — Browse Inbox/Archived mail, translate foreign-language messages into a configured primary language, keep a sliding window of AI actions ready, and optionally review with configurable single-key shortcuts
- **Calendar** — View and create Calendar events with natural language
- **Notes** — Personal notes synced to a Google Doc with **inline Markdown preview** — click to edit, press `Esc` to return to preview
- **Tasks** — Create, organize, and track Google Tasks with collapsible subtasks, AI-powered task breakdown, due dates, and status toggling
- **AI Assistant** — Centered overlay popup (90% viewport) with blur backdrop and context awareness of emails, events, notes, and tasks
- **Settings** — Centered modal with sidebar navigation and per-section configuration (General, AI Assistant, Gmail, Calendar, Notes, Tasks)
- **Encrypted environment vault** — Edit sensitive key/value text in Settings; a generated local password plus PIN encrypts the Notes-backed ciphertext
- **Keyboard Shortcuts** — `1`–`9` to switch pages, `O` to toggle AI panel, `Esc` to close overlays
- **Mail review shortcuts** — Optional and configurable; defaults are `J`/`K` to choose, `E` to apply and archive, `X` to skip, and `A` to apply only
- **Auto-refresh** — Configurable periodic refresh for all pages to detect external changes
- **Cross-page actions** — Send notes to Calendar events, prefill tasks from other pages, AI summarization appended with structured Markdown

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4, Lucide React, react-markdown |
| Language | TypeScript 6 |
| Auth | NextAuth v5 (Google OAuth) |
| Google APIs | Gmail, Calendar, Docs, Drive, Tasks |
| AI | OpenAI-compatible API, including local `llama-server` |

---

## Prerequisites

1. **Node.js 22.18+** and **npm 10+**
2. A **Google Cloud project** with OAuth 2.0 credentials configured
3. The following OAuth scopes enabled on your client:
   - `gmail.modify`, `calendar`, `documents`, `drive.file`, `tasks`
4. Redirect URI set to `http://localhost:3000/api/auth/callback/google` (for local dev)

---

## Environment Variables

Copy `apps/web/.env.example` to `apps/web/.env.local` (the Next.js app root):

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_SECRET=a-random-secret-string
NEXTAUTH_URL=http://localhost:3000
```

---

## Getting Started

```bash
# 1. Install dependencies (installs and links all workspace packages)
npm install

# 2. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and you're ready.

### Other scripts

```bash
npm run lint       # Lint the web app and every workspace package
npm run typecheck  # Run strict TypeScript checking
npm test           # Run all colocated package tests
npm run check      # Run lint, typecheck, and tests
npm run check:all  # Run check plus a production build
npm run build      # Production build
npm start          # Start production server
```

See [`AGENTS.md`](AGENTS.md) for repository editing conventions and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for package boundaries and data
flows.

---

## Project Structure

This is an **npm workspaces monorepo**. There is a single Next.js app (`apps/web`) that composes four independent, locally-published "menu" packages — Mail, Calendar, Notes, and Tasks — plus shared `types`/`state`/`lib` packages. All four menus still share one global state, one auth session, and the same cross-feature "prefill" flows (e.g. turning an email into a calendar event or task) as before — only the file organization changed.

```
apps/
└── web/                        # The Next.js app — routing, API routes, auth, shell UI
    └── src/
        ├── auth.ts             # NextAuth config (Google OAuth, token refresh)
        ├── app/
        │   ├── page.tsx        # Sign-in page (redirects to /app if authenticated)
        │   ├── app/page.tsx    # Main dashboard entry point
        │   └── api/            # gmail/, calendar/, docs/, tasks/, auth/ route handlers
        └── components/
            ├── AppShell.tsx        # Main layout, keyboard shortcuts, composes all 4 menu packages
            ├── Navigation.tsx      # Sidebar with page icons
            ├── TopBar.tsx          # Header bar
            ├── AIAssistant.tsx     # AI chat overlay (centered popup)
            ├── SettingsPanel.tsx   # Settings modal (centered popup)

packages/
├── types/       (@crewmate/types)    # Shared TS types used by every package (Page, Note, Task,
│                                       CalendarEvent, GmailThread, PageSettings, ColorScheme, ...)
├── state/       (@crewmate/state)    # AppContext — the global reducer/dispatch all 4 menus share
├── lib/         (@crewmate/lib)      # AI API client, resizing, and settings helpers
│                                       google.ts, googleApiError.ts (server-only: "@crewmate/lib/server")
├── mail/        (@crewmate/mail)     # GmailPage.tsx + useGmail.ts
├── calendar/    (@crewmate/calendar) # CalendarPage.tsx + useCalendar.ts + calendar settings/date helpers
│                                       (pure helpers also exposed via "@crewmate/calendar/shared")
├── notes/       (@crewmate/notes)    # NotesPage.tsx + useNotes.ts
└── tasks/       (@crewmate/tasks)    # TasksPage.tsx + useTasks.ts + taskEmailContext.ts
```

---

## API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/gmail/threads` | List inbox threads (supports `q` query param) |
| `GET` | `/api/gmail/thread/[id]` | Get full thread with all messages |
| `PATCH` | `/api/gmail/thread/[id]` | Archive thread |
| `PUT` | `/api/gmail/thread/[id]` | Toggle thread star |
| `DELETE` | `/api/gmail/thread/[id]` | Trash thread |
| `POST` | `/api/gmail/send` | Send/reply to an email |
| `GET` | `/api/calendar/events` | List calendar events |
| `POST` | `/api/calendar/events` | Create a new event |
| `PATCH` | `/api/calendar/events/[id]` | Update an event |
| `DELETE` | `/api/calendar/events/[id]` | Delete an event |
| `POST` | `/api/docs/init` | Find or create "Crewmate Notes" Google Doc |
| `GET` | `/api/docs/content` | Read Doc content |
| `PUT` | `/api/docs/content` | Replace Doc content |
| `POST` | `/api/tasks/init` | Find or create "Crewmate Tasks" list |
| `GET` | `/api/tasks/items` | List tasks in a list |
| `POST` | `/api/tasks/items` | Create a task |
| `PATCH` | `/api/tasks/items` | Update a task |
| `DELETE` | `/api/tasks/items` | Delete a task |

---

## AI Assistant

The AI Assistant connects directly to an OpenAI-compatible API. It defaults to
`http://127.0.0.1:8080/v1`, the default local `llama-server` address used by
Crewmate. Start a local server with a loaded model, then choose the model in
**Settings → AI Assistant**:

```bash
llama-server -m /path/to/model.gguf --alias local-model --port 8080
```

Crewmate discovers models with `GET /v1/models` and sends prompts with
`POST /v1/chat/completions`. Other compatible servers can be used by changing
the API base URL. API-key authentication is not implemented yet.

The assistant opens as a centered overlay popup (90% of the viewport) with a
blurred backdrop — click outside or press `Esc` to dismiss. It is loaded with
context from all active pages (recent emails, upcoming events, notes content,
task list) so it can answer questions and take actions on your behalf.
Conversation history is sent only from the active chat session, and replies
remain attached to the session that initiated them if the user switches chats.
Feature context can include email, Calendar, Notes, and Tasks data. Crewmate
warns before saving a remote AI endpoint; use only an endpoint you trust.
When Mail translation is enabled, opened message text is also sent to that AI
endpoint for language detection and translation. The original message remains
available alongside the translated text.

Browser preferences and assistant history are stored under an opaque,
account-specific key. They remain on the device after sign-out until cleared in
Settings. Google access tokens remain in HttpOnly authentication state and are
removed from the browser-visible session response.

---

## Notes

The Notes page connects to a Crewmate-owned Google Doc with a unified
editor/preview pane. It stores plain-text Markdown and does not preserve rich
Google Docs structures or formatting. Content is displayed as rendered Markdown
by default — click the preview or the Edit button to switch to the text editor.
Press `Esc` to return to the preview. Revision conflicts are shown without
overwriting either the newer Google Doc or the local draft.

Content appended via AI summarization or cross-page prefills uses structured Markdown (headings, blockquotes with timestamps, horizontal rules).
Content sent from Mail is grouped under a dedicated `Mail notes` section.
When Quick review is enabled, cross-page actions return to Mail and advance only
after the destination action succeeds.

---

## Tasks

Tasks are synced with Google Tasks. Each task supports:

- Status toggling (pending / completed)
- AI-powered breakdown into subtasks
- Collapsible subtask list (show/hide with the expand button)
- Due dates, notes, and calendar integration
