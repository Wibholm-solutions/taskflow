import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createDb } from './db/index';
import { TaskService } from './services/taskService';
import { createTaskRoutes } from './routes/tasks';
import { authMiddleware } from './middleware/auth';
import 'dotenv/config';

const basePath = process.env.BASE_PATH || '/todo';
const port = parseInt(process.env.PORT || '3000');
const dbPath = process.env.DATABASE_PATH || './data/taskflow.db';

const { db, sqlite } = createDb(dbPath);

// Run migrations (create table if not exists)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL,
    description TEXT,
    deadline TEXT,
    priority TEXT NOT NULL DEFAULT 'default',
    is_completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    not_before TEXT,
    recurrence_group_id TEXT,
    recurrence_rule TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
`);

const taskColumns = sqlite.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
if (!taskColumns.some((column) => column.name === 'sort_order')) {
  sqlite.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
}

const taskService = new TaskService(db);

const app = new Hono();

// Health check
app.get(`${basePath}/api/health`, (c) => c.json({ status: 'ok', version: new Date().toISOString().slice(0, 10) }));

// Auth middleware for API routes
app.use(`${basePath}/api/*`, authMiddleware);

// API routes
const apiApp = new Hono();
apiApp.route('/', createTaskRoutes(taskService));
app.route(`${basePath}/api`, apiApp);

// Keep the canonical app URL within the service worker scope.
app.get(basePath, (c) => c.redirect(`${basePath}/`, 308));

// Serve static files (production build) - strip basePath prefix
app.use(`${basePath}/*`, serveStatic({
  root: './dist/client',
  rewriteRequestPath: (path) => path.replace(basePath, ''),
}));

// SPA fallback - serve index.html for any unmatched route
app.get(`${basePath}/*`, (c) => {
  return serveStatic({
    root: './dist/client',
    path: 'index.html',
  })(c, async () => {});
});

console.log(`TaskFlow running on port ${port}`);
serve({ fetch: app.fetch, port });

export default app;
