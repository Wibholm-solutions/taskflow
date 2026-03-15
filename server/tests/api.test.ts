import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createTaskRoutes } from '../src/routes/tasks';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/db/schema';
import { TaskService } from '../src/services/taskService';

const CREATE_TABLE_SQL = `
  CREATE TABLE tasks (
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
`;

function setupApp() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_TABLE_SQL);
  const db = drizzle(sqlite, { schema });
  const service = new TaskService(db);
  const app = new Hono().basePath('/todo/api');
  app.route('/', createTaskRoutes(service));
  return { app, sqlite };
}

describe('Task API', () => {
  let app: Hono;
  let sqlite: Database.Database;

  beforeEach(() => {
    const setup = setupApp();
    app = setup.app;
    sqlite = setup.sqlite;
  });

  afterEach(() => sqlite.close());

  describe('POST /todo/api/tasks', () => {
    it('should create a task', async () => {
      const res = await app.request('/todo/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New task' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe('New task');
      expect(body.id).toBeTruthy();
    });

    it('should reject missing title', async () => {
      const res = await app.request('/todo/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject title over 200 chars', async () => {
      const res = await app.request('/todo/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x'.repeat(201) }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid priority', async () => {
      const res = await app.request('/todo/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', priority: 'urgent' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /todo/api/tasks', () => {
    it('should return active and upcoming arrays', async () => {
      const res = await app.request('/todo/api/tasks');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('active');
      expect(body).toHaveProperty('upcoming');
    });
  });

  describe('PUT /todo/api/tasks/:id', () => {
    it('should update a task', async () => {
      const createRes = await app.request('/todo/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Original' }),
      });
      const { id } = await createRes.json();

      const res = await app.request(`/todo/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Updated');
    });

    it('should 404 for non-existent task', async () => {
      const res = await app.request('/todo/api/tasks/nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Update' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /todo/api/tasks/:id/complete', () => {
    it('should complete task and return next instance for recurring', async () => {
      const createRes = await app.request('/todo/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Recurring',
          recurrenceRule: { type: 'days_after', interval: 7 },
        }),
      });
      const { id } = await createRes.json();

      const res = await app.request(`/todo/api/tasks/${id}/complete`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.completed.isCompleted).toBe(true);
      expect(body.nextInstance).toBeTruthy();
    });
  });

  describe('DELETE /todo/api/tasks/:id', () => {
    it('should delete a task', async () => {
      const createRes = await app.request('/todo/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'To delete' }),
      });
      const { id } = await createRes.json();

      const res = await app.request(`/todo/api/tasks/${id}`, { method: 'DELETE' });
      expect(res.status).toBe(204);
    });
  });
});
