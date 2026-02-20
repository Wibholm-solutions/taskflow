# TaskFlow

Personal task management PWA. Single-user, architected for future multi-user.

## Tech Stack
- **Backend:** Hono (Node.js) + Drizzle ORM + SQLite
- **Frontend:** React 18 + TailwindCSS 4
- **Testing:** Vitest (unit) + Playwright (E2E)
- **PWA:** Workbox via vite-plugin-pwa
- **Build:** Vite (client) + esbuild (server)

## Quick Start
```bash
npm install
npm run dev          # Starts both server (3000) and client (5173)
npm test             # Run unit tests
npm run test:e2e     # Run E2E tests (builds + starts server)
npm run test:e2e:ui  # Playwright UI mode
npm run build        # Build for production
```

## Architecture
- Single Docker container: Hono serves API + built React static files
- Base path: `/todo` (behind Caddy reverse proxy)
- Port: 3101 external, 3000 internal
- Database: SQLite at `./data/taskflow.db`

## Project Structure
```
e2e/
├── playwright.config.ts  # Playwright config (webServer, baseURL)
├── fixtures.ts           # Custom test fixture with DB cleanup
├── helpers/api.ts        # API helper for test data setup
└── tests/                # E2E test specs

server/src/
├── index.ts              # Hono app entry, serves API + static
├── routes/tasks.ts       # Task CRUD + complete endpoints
├── middleware/auth.ts     # Auth placeholder (hardcoded user_id)
├── db/schema.ts          # Drizzle schema
├── db/index.ts           # DB connection
└── services/
    ├── taskService.ts    # Task CRUD + sorting logic
    └── recurrenceService.ts  # Recurring task generation

client/src/
├── App.tsx               # Root component
├── components/           # UI components
├── hooks/                # Custom hooks (useSwipe, useTasks)
└── services/             # API client
```

## Key Design Decisions
- `not_before` field controls "upcoming" vs "active" task visibility
- Recurrence triggered on completion only (no cron)
- Optimistic UI updates with rollback on failure
- TDD: tests written before implementation

## Status
- [x] Project scaffolding
- [x] Database schema
- [x] Backend API
- [x] Recurrence engine
- [x] Frontend components
- [x] PWA/offline
- [x] Docker deployment
