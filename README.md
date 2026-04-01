# Crewmate

An AI-powered dashboard that integrates your Email, Calendar, Notes, and Tasks into a single interface — with integrated AI assistant overlay powered by [Opencode](https://opencode.ai).

---

## Features

- **Mail** — Browse Email threads, read messages, reply, archive, and trash emails
- **Calendar** — View and create Calendar events with natural language
- **Notes** — Personal notes synced to a Google Doc with **inline Markdown preview** — click to edit, press `Esc` to return to preview
- **Tasks** — Create, organize, and track Google Tasks with collapsible subtasks, AI-powered task breakdown, due dates, and status toggling
- **AI Assistant** — Centered overlay popup (90% viewport) with blur backdrop, full context awareness of emails, events, notes, and tasks; powered by Opencode
- **Settings** — Centered modal with sidebar navigation and per-section configuration (General, AI Assistant, Gmail, Calendar, Notes, Tasks)
- **Custom Pages** — Add any URL as a tab in the sidebar, embedded as an iframe
- **Keyboard Shortcuts** — `1`–`9` to switch pages, `O` to toggle AI panel, `Esc` to close overlays
- **Auto-refresh** — Configurable periodic refresh for all pages to detect external changes
- **Cross-page actions** — Send notes to Calendar events, prefill tasks from other pages, AI summarization appended with structured Markdown

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4, Lucide React, react-markdown |
| Language | TypeScript 5 |
| Auth | NextAuth v5 (Google OAuth) |
| Google APIs | Gmail, Calendar, Docs, Drive, Tasks |
| AI | Opencode server (optional) |

---

## Prerequisites

1. A **Google Cloud project** with OAuth 2.0 credentials configured
2. The following OAuth scopes enabled on your client:
   - `gmail.modify`, `calendar`, `documents`, `drive.file`, `tasks`
3. Redirect URI set to `http://localhost:3000/api/auth/callback/google` (for local dev)

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_SECRET=a-random-secret-string

# Optional: Opencode AI server URL (auto-detects localhost:4096–4098 if not set)
NEXT_PUBLIC_OPENCODE_URL=http://localhost:4096
```

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and you're ready.

### Other scripts

```bash
npm run build   # Production build
npm start       # Start production server
npm run lint    # Run ESLint
```

---

## Project Structure

```
src/
├── auth.ts                  # NextAuth config (Google OAuth, token refresh)
├── app/
│   ├── page.tsx             # Sign-in page (redirects to /app if authenticated)
│   ├── app/page.tsx         # Main dashboard entry point
│   └── api/
│       ├── auth/            # NextAuth route handlers
│       ├── gmail/           # Threads, messages, send
│       ├── calendar/        # Events CRUD
│       ├── docs/            # Google Docs init + content read/write
│       └── tasks/           # Google Tasks init + items CRUD
├── components/
│   ├── AppShell.tsx         # Main layout, keyboard shortcuts
│   ├── Navigation.tsx       # Sidebar with page icons
│   ├── TopBar.tsx           # Header bar
│   ├── AIAssistant.tsx      # AI chat overlay (centered popup)
│   ├── SettingsPanel.tsx    # Settings modal (centered popup)
│   └── pages/               # GmailPage, CalendarPage, NotesPage, TasksPage, CustomPage
├── context/
│   └── AppContext.tsx       # Global state (pages, data, settings, notifications)
├── hooks/
│   ├── useGmail.ts          # Gmail data fetching and mutations
│   └── useCalendar.ts       # Calendar data fetching and mutations
└── lib/
    ├── google.ts            # Authenticated Google API client factory
    ├── opencode.ts          # Opencode AI server client
    └── useResizable.ts      # Panel resize hook
```

---

## API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/gmail/threads` | List inbox threads (supports `q` query param) |
| `GET` | `/api/gmail/thread/[id]` | Get full thread with all messages |
| `PATCH` | `/api/gmail/thread/[id]` | Archive thread |
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

---

## AI Assistant

The AI Assistant uses an [Opencode](https://opencode.ai) server for natural language interactions. It opens as a centered overlay popup (90% of the viewport) with a blurred backdrop — click outside or press `Esc` to dismiss. It is loaded with context from all active pages (recent emails, upcoming events, notes content, task list) so it can answer questions and take actions on your behalf.

---

## Notes

The Notes page connects to a Google Doc with a unified editor/preview pane. Content is displayed as rendered Markdown by default — click the preview or the Edit button to switch to the text editor. Press `Esc` to return to the preview.

Content appended via AI summarization or cross-page prefills uses structured Markdown (headings, blockquotes with timestamps, horizontal rules).

---

## Tasks

Tasks are synced with Google Tasks. Each task supports:

- Status toggling (pending / completed)
- AI-powered breakdown into subtasks (via Opencode)
- Collapsible subtask list (show/hide with the expand button)
- Due dates, notes, and calendar integration