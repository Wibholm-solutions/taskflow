import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/db/schema';
import { TaskService } from '../src/services/taskService';

function setupTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
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
    )
  `);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

describe('TaskService', () => {
  let sqlite: Database.Database;
  let service: TaskService;

  beforeEach(() => {
    const setup = setupTestDb();
    sqlite = setup.sqlite;
    service = new TaskService(setup.db);
  });

  afterEach(() => sqlite.close());

  describe('listTasks', () => {
    it('should separate active and upcoming tasks', async () => {
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      await service.create({ title: 'Due today', deadline: today });
      await service.create({ title: 'No deadline' });
      await service.create({ title: 'Future task', notBefore: nextWeek });

      const result = await service.listTasks();
      expect(result.active).toHaveLength(2);
      expect(result.upcoming).toHaveLength(1);
      expect(result.upcoming[0].title).toBe('Future task');
    });

    it('should sort by deadline ASC, nulls last, then priority', async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      await service.create({ title: 'No deadline high', priority: 'high' });
      await service.create({ title: 'Today default', deadline: today });
      await service.create({ title: 'Yesterday low', deadline: yesterday, priority: 'low' });
      await service.create({ title: 'No deadline default' });

      const result = await service.listTasks();
      const titles = result.active.map((t) => t.title);
      expect(titles).toEqual([
        'Yesterday low',
        'Today default',
        'No deadline high',
        'No deadline default',
      ]);
    });

    it('should exclude completed tasks', async () => {
      await service.create({ title: 'Active' });
      const task = await service.create({ title: 'Will complete' });
      await service.complete(task.id);

      const result = await service.listTasks();
      expect(result.active).toHaveLength(1);
      expect(result.active[0].title).toBe('Active');
    });
  });

  describe('create', () => {
    it('should create a task with defaults', async () => {
      const task = await service.create({ title: 'Test' });
      expect(task.title).toBe('Test');
      expect(task.priority).toBe('default');
      expect(task.isCompleted).toBe(false);
    });

    it('should create a recurring task with group id', async () => {
      const task = await service.create({
        title: 'Weekly',
        recurrenceRule: { type: 'days_after', interval: 7 },
      });
      expect(task.recurrenceGroupId).toBeTruthy();
      expect(task.recurrenceRule).toEqual({ type: 'days_after', interval: 7 });
    });
  });

  describe('complete', () => {
    it('should mark task as completed', async () => {
      const task = await service.create({ title: 'To complete' });
      const result = await service.complete(task.id);
      expect(result.completed.isCompleted).toBe(true);
      expect(result.completed.completedAt).toBeTruthy();
    });

    it('should generate next instance for recurring task', async () => {
      const task = await service.create({
        title: 'Every 7 days',
        description: 'Recurring desc',
        priority: 'high',
        deadline: '2026-02-16',
        recurrenceRule: { type: 'days_after', interval: 7 },
      });

      const result = await service.complete(task.id);
      expect(result.nextInstance).toBeTruthy();
      expect(result.nextInstance!.title).toBe('Every 7 days');
      expect(result.nextInstance!.description).toBe('Recurring desc');
      expect(result.nextInstance!.priority).toBe('high');
      expect(result.nextInstance!.deadline).toBe('2026-02-23');
      expect(result.nextInstance!.notBefore).toBe('2026-02-23');
      expect(result.nextInstance!.isCompleted).toBe(false);
      expect(result.nextInstance!.recurrenceGroupId).toBe(task.recurrenceGroupId);
    });

    it('should not duplicate recurring instances', async () => {
      const task = await service.create({
        title: 'Weekly',
        recurrenceRule: { type: 'days_after', interval: 7 },
      });

      const first = await service.complete(task.id);
      const nextId = first.nextInstance!.id;

      const second = await service.complete(nextId);
      expect(second.nextInstance).toBeTruthy();

      const allTasks = await service.listTasks();
      const uncompleted = [...allTasks.active, ...allTasks.upcoming];
      const groupTasks = uncompleted.filter(
        (t) => t.recurrenceGroupId === task.recurrenceGroupId
      );
      expect(groupTasks).toHaveLength(1);
    });

    it('should not generate next instance for non-recurring task', async () => {
      const task = await service.create({ title: 'One-time' });
      const result = await service.complete(task.id);
      expect(result.nextInstance).toBeNull();
    });

    it('should set notBefore but no deadline for recurring task without deadline', async () => {
      const task = await service.create({
        title: 'No deadline recurring',
        recurrenceRule: { type: 'days_after', interval: 3 },
      });

      const result = await service.complete(task.id);
      expect(result.nextInstance!.deadline).toBeNull();
      expect(result.nextInstance!.notBefore).toBeTruthy();
    });
  });

  describe('update', () => {
    it('should update task fields', async () => {
      const task = await service.create({ title: 'Original' });
      const updated = await service.update(task.id, {
        title: 'Updated',
        priority: 'high',
        deadline: '2026-03-01',
      });
      expect(updated.title).toBe('Updated');
      expect(updated.priority).toBe('high');
      expect(updated.deadline).toBe('2026-03-01');
    });

    it('should clear nullable fields with null', async () => {
      const task = await service.create({ title: 'With deadline', deadline: '2026-03-01' });
      const updated = await service.update(task.id, { deadline: null });
      expect(updated.deadline).toBeNull();
    });
  });

  describe('delete', () => {
    it('should remove a task', async () => {
      const task = await service.create({ title: 'To delete' });
      await service.delete(task.id);
      const result = await service.listTasks();
      expect(result.active).toHaveLength(0);
    });
  });
});
