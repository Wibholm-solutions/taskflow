# TaskFlow

A personal task management PWA built with a modern Node.js + React stack. Single-user by default, architected to support multi-user in the future.

## Features

- Create, edit, and complete tasks with priorities and deadlines
- Recurring tasks (daily, weekly, monthly, custom rules)
- Subtask support with completion tracking
- "Upcoming" tasks hidden until their `not_before` date
- Drag-and-drop reordering on both desktop and mobile
- Pull-to-refresh on mobile
- Offline support via PWA/Workbox
- Dark mode UI

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | [Hono](https://hono.dev/) (Node.js) + [Drizzle ORM](https://orm.drizzle.team/) + SQLite |
| Frontend | React 18 + [TailwindCSS 4](https://tailwindcss.com/) |
| Testing | [Vitest](https://vitest.dev/) (unit) + [Playwright](https://playwright.dev/) (E2E) |
| PWA | [Workbox](https://developer.chrome.com/docs/workbox/) via vite-plugin-pwa |
| Build | Vite (client) + esbuild (server) |
| Container | Docker (single container) |

## Quick Start

```bash
npm install
npm run dev          # Start dev server (API on :3000, client on :5173)
npm test             # Run unit tests
npm run test:e2e     # Run E2E tests (builds first, then starts server)
npm run build        # Production build
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATABASE_PATH` | `./data/taskflow.db` | SQLite database file path |
| `BASE_PATH` | `/todo` | URL base path (e.g. when behind a reverse proxy) |
| `NODE_ENV` | `development` | Node environment |
| `VITE_FEEDBACK_REPO` | _(empty)_ | GitHub repo for in-app feedback button (e.g. `myuser/taskflow`). Leave blank to disable. |
| `VITE_FEEDBACK_URL` | _(empty)_ | API endpoint for the feedback button. |

## Docker Deployment

```bash
# Build
docker build -t taskflow .

# Run
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e BASE_PATH=/todo \
  taskflow
```

The app expects a reverse proxy (e.g. Caddy, nginx) in front for TLS termination and base-path routing.

## Architecture

```
client/src/
├── App.tsx               # Root component
├── components/           # UI components
├── hooks/                # Custom hooks (useSwipe, useTasks, usePullToRefresh)
└── services/             # API client

server/src/
├── index.ts              # Hono entry point — serves API + static files
├── routes/tasks.ts       # Task CRUD + completion endpoints
├── middleware/auth.ts    # Auth placeholder (single-user default user)
├── db/schema.ts          # Drizzle schema
└── services/
    ├── taskService.ts        # Task CRUD + sorting
    └── recurrenceService.ts  # Recurring task generation

e2e/
├── playwright.config.ts  # Playwright config
├── fixtures.ts           # Test fixture with DB cleanup
└── tests/                # E2E test specs
```

## Key Design Decisions

- `not_before` field gates "upcoming" vs "active" task visibility
- Recurrence is triggered on task completion only — no background cron
- Optimistic UI updates with automatic rollback on failure
- TDD: unit tests written before implementation

## Authentication

The current version uses a single hardcoded default user (`auth.ts`). It is intentionally minimal — a placeholder for future JWT/OAuth integration. If you expose this to the internet, add proper authentication before doing so.

## License

[MIT](LICENSE)
