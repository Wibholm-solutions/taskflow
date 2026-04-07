# TaskFlow

A personal task management PWA with recurring tasks, subtasks, swipe gestures, and offline support. Built with a modern TypeScript stack and designed for self-hosting via Docker.

## Features

- **Recurring tasks** -- complete a task and the next occurrence is created automatically
- **Subtasks** -- break tasks into smaller steps with independent completion tracking
- **Swipe gestures** -- swipe to complete or delete tasks on mobile
- **Drag-to-reorder** -- manually sort your task list
- **Pull-to-refresh** -- native-feeling refresh on mobile
- **Undo completion** -- accidentally completed a task? Undo it from the snackbar
- **PWA / offline support** -- installable as a home-screen app with Workbox caching
- **Upcoming tasks** -- schedule tasks with a "not before" date so they stay hidden until relevant

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Hono + Drizzle ORM + SQLite         |
| Frontend  | React 18 + TailwindCSS 4            |
| Testing   | Vitest (unit) + Playwright (E2E)    |
| PWA       | Workbox via vite-plugin-pwa         |
| Build     | Vite (client) + esbuild (server)    |
| Runtime   | Node.js 20                          |

## Quick Start

```bash
git clone https://github.com/Wibholm-solutions/taskflow.git
cd taskflow
npm install
cp .env.example .env      # adjust if needed
npm run dev                # starts server (3000) + client (5173)
```

Open http://localhost:5173 in your browser.

## Docker Deployment

```bash
docker compose up -d
```

The container builds a production image, runs on port 3000 internally, and persists the SQLite database in `./data/`.

## Configuration

Environment variables (see `.env.example`):

| Variable              | Default                | Description                                      |
|-----------------------|------------------------|--------------------------------------------------|
| `PORT`                | `3000`                 | Server listen port (inside container)            |
| `DATABASE_PATH`       | `./data/taskflow.db`   | Path to the SQLite database file                 |
| `BASE_PATH`           | `/`                    | URL prefix for reverse-proxy setups              |
| `NODE_ENV`            | `development`          | Set to `production` in Docker                    |
| `HOST_PORT`           | `3000`                 | Host port mapped in docker-compose               |
| `VITE_FEEDBACK_REPO`  | --                     | Optional: GitHub repo for feedback button        |
| `VITE_FEEDBACK_API_URL`| --                    | Optional: Feedback API endpoint                  |

## Project Structure

```
server/src/
  index.ts              Hono app entry point (API + static serving)
  routes/tasks.ts       Task CRUD and completion endpoints
  services/             Task service, recurrence engine
  db/                   Drizzle schema and connection

client/src/
  App.tsx               Root React component
  components/           UI components (TaskList, TaskModal, etc.)
  hooks/                Custom hooks (useTasks, useSwipe, usePullToRefresh)
  services/             API client

e2e/
  tests/                Playwright E2E test specs
  fixtures.ts           Custom test fixture with DB cleanup
  playwright.config.ts  Playwright configuration
```

## Testing

```bash
npm test               # run unit tests
npm run test:server    # server tests only
npm run test:client    # client tests only
npm run test:coverage  # unit tests with coverage report
npm run test:e2e       # end-to-end tests (builds + starts server)
npm run test:e2e:ui    # Playwright UI mode
```

## License

[MIT](LICENSE)
