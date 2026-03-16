import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
      sort_order INTEGER NOT NULL DEFAULT 0,
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

  afterEach(() => {
    vi.useRealTimers();
    sqlite.close();
  });

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

    it('should not prioritize future deadlines in sorting', async () => {
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      await service.create({ title: 'Future deadline default', deadline: nextWeek });
      await service.create({ title: 'No deadline high', priority: 'high' });
      await service.create({ title: 'No deadline default' });

      const result = await service.listTasks();
      const titles = result.active.map((t) => t.title);
      expect(titles).toEqual([
        'No deadline high',
        'Future deadline default',
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

    it('sorts active tasks by urgency, priority, sortOrder, createdAt, then id', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));

      sqlite.prepare(
        `INSERT INTO tasks (
          id, title, deadline, priority, sort_order, created_at, updated_at
        ) VALUES
          (?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'urgent-rank-1',
        'Urgent rank 1',
        '2026-03-15',
        'high',
        0,
        '2026-03-16T08:00:00.000Z',
        '2026-03-16T08:00:00.000Z',
        'urgent-rank-2',
        'Urgent rank 2',
        '2026-03-15',
        'high',
        1,
        '2026-03-16T08:01:00.000Z',
        '2026-03-16T08:01:00.000Z',
        'urgent-fallback-older',
        'Urgent fallback older',
        '2026-03-15',
        'high',
        2,
        '2026-03-16T08:02:00.000Z',
        '2026-03-16T08:02:00.000Z',
        'urgent-fallback-newer',
        'Urgent fallback newer',
        '2026-03-15',
        'high',
        2,
        '2026-03-16T08:03:00.000Z',
        '2026-03-16T08:03:00.000Z',
        'default-bucket-first',
        'Default bucket first',
        null,
        'default',
        0,
        '2026-03-16T08:04:00.000Z',
        '2026-03-16T08:04:00.000Z'
      );

      const result = await service.listTasks();
      expect(result.active.map((task) => task.title)).toEqual([
        'Urgent rank 1',
        'Urgent rank 2',
        'Urgent fallback older',
        'Urgent fallback newer',
        'Default bucket first',
      ]);
    });

    it('keeps upcoming sorting independent from sortOrder', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));

      sqlite.prepare(
        `INSERT INTO tasks (
          id, title, not_before, sort_order, created_at, updated_at
        ) VALUES
          (?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?)`
      ).run(
        'later-upcoming',
        'Later upcoming',
        '2026-03-18',
        0,
        '2026-03-16T08:00:00.000Z',
        '2026-03-16T08:00:00.000Z',
        'sooner-upcoming',
        'Sooner upcoming',
        '2026-03-17',
        99,
        '2026-03-16T08:01:00.000Z',
        '2026-03-16T08:01:00.000Z'
      );

      const result = await service.listTasks();
      expect(result.upcoming.map((task) => task.title)).toEqual([
        'Sooner upcoming',
        'Later upcoming',
      ]);
    });

    it('normalizes deadline and notBefore values before deriving buckets', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));

      await service.create({
        title: 'Normalized active',
        deadline: '2026-03-16T18:45:00.000Z',
      });
      await service.create({
        title: 'Normalized upcoming',
        notBefore: '2026-03-17T05:30:00.000Z',
      });

      const result = await service.listTasks();
      expect(result.active[0].deadline).toBe('2026-03-16');
      expect(result.upcoming[0].notBefore).toBe('2026-03-17');
    });
  });

  describe('create', () => {
    it('should create a task with defaults', async () => {
      const task = await service.create({ title: 'Test' });
      expect(task.title).toBe('Test');
      expect(task.priority).toBe('default');
      expect(task.isCompleted).toBe(false);
      expect(task.sortOrder).toBe(0);
      expect(task.subtasks).toEqual([]);
    });

    it('should create a recurring task with group id', async () => {
      const task = await service.create({
        title: 'Weekly',
        recurrenceRule: { type: 'days_after', interval: 7 },
      });
      expect(task.recurrenceGroupId).toBeTruthy();
      expect(task.recurrenceRule).toEqual({ type: 'days_after', interval: 7 });
    });

    it('should create a task with non-empty subtasks only', async () => {
      const task = await service.create({
        title: 'Parent',
        subtasks: [{ title: 'First subtask' }, { title: '   ' }, { title: 'Second subtask' }],
      });

      expect(task.subtasks.map((subtask) => subtask.title).sort()).toEqual([
        'First subtask',
        'Second subtask',
      ]);
      expect(task.subtasks.every((subtask) => subtask.isCompleted === false)).toBe(true);
    });

    it('assigns sortOrder at the end of the active bucket', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));

      const first = await service.create({
        title: 'First high',
        priority: 'high',
        deadline: '2026-03-15',
      });
      const second = await service.create({
        title: 'Second high',
        priority: 'high',
        deadline: '2026-03-15',
      });

      expect(first.sortOrder).toBe(0);
      expect(second.sortOrder).toBe(1);
    });
  });

  describe('getById', () => {
    it('should return a parent task with ordered subtasks', async () => {
      const task = await service.create({ title: 'Parent' });

      sqlite
        .prepare(
          `INSERT INTO subtasks (id, task_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`
        )
        .run(
          'sub-older',
          task.id,
          'Older subtask',
          '2026-03-01T00:00:00.000Z',
          '2026-03-01T00:00:00.000Z',
          'sub-newer',
          task.id,
          'Newer subtask',
          '2026-03-02T00:00:00.000Z',
          '2026-03-02T00:00:00.000Z'
        );

      const aggregate = await service.getById(task.id);

      expect(aggregate?.subtasks.map((subtask) => subtask.title)).toEqual([
        'Older subtask',
        'Newer subtask',
      ]);
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
      const today = new Date().toISOString().split('T')[0];
      const expectedNext = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      const task = await service.create({
        title: 'Every 7 days',
        description: 'Recurring desc',
        priority: 'high',
        deadline: today,
        recurrenceRule: { type: 'days_after', interval: 7 },
      });

      const result = await service.complete(task.id);
      expect(result.nextInstance).toBeTruthy();
      expect(result.nextInstance!.title).toBe('Every 7 days');
      expect(result.nextInstance!.description).toBe('Recurring desc');
      expect(result.nextInstance!.priority).toBe('high');
      expect(result.nextInstance!.deadline).toBe(expectedNext);
      expect(result.nextInstance!.notBefore).toBe(expectedNext);
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

    it('should preserve subtasks when generating a new recurring instance', async () => {
      const task = await service.create({
        title: 'Recurring parent',
        recurrenceRule: { type: 'days_after', interval: 7 },
        subtasks: [{ title: 'Pack bags' }, { title: 'Charge camera' }],
      });

      const result = await service.complete(task.id, { completeRemainingSubtasks: true });

      expect(result.nextInstance?.subtasks.map((subtask) => subtask.title)).toEqual([
        'Pack bags',
        'Charge camera',
      ]);
      expect(result.nextInstance?.subtasks.every((subtask) => subtask.isCompleted === false)).toBe(
        true
      );
    });

    it('should preserve subtasks when reusing an existing recurring instance', async () => {
      const task = await service.create({
        title: 'Recurring parent',
        recurrenceRule: { type: 'days_after', interval: 7 },
        subtasks: [{ title: 'Draft agenda' }, { title: 'Book room' }],
      });

      const first = await service.complete(task.id, { completeRemainingSubtasks: true });
      expect(first.nextInstance?.subtasks.map((subtask) => subtask.title)).toEqual([
        'Draft agenda',
        'Book room',
      ]);

      const updatedNext = await service.update(first.nextInstance!.id, {
        subtasks: {
          update: [{ id: first.nextInstance!.subtasks[0].id, isCompleted: true }],
        },
      });
      expect(updatedNext.subtasks[0].isCompleted).toBe(true);

      const second = await service.complete(first.nextInstance!.id, {
        completeRemainingSubtasks: true,
      });

      expect(second.nextInstance?.subtasks.map((subtask) => subtask.title)).toEqual([
        'Draft agenda',
        'Book room',
      ]);
      expect(second.nextInstance?.subtasks.every((subtask) => subtask.isCompleted === false)).toBe(
        true
      );
    });

    it('should require confirmation before completing a parent with open subtasks', async () => {
      const task = await service.create({
        title: 'Parent',
        subtasks: [{ title: 'Open subtask' }],
      });

      const result = await service.complete(task.id);

      expect(result.requiresConfirmation).toBe(true);
      expect(result.completed).toBeNull();
      expect(result.nextInstance).toBeNull();

      const unchanged = await service.getById(task.id);
      expect(unchanged?.isCompleted).toBe(false);
      expect(unchanged?.subtasks[0].isCompleted).toBe(false);
    });

    it('should complete remaining subtasks before the parent when confirmed', async () => {
      const task = await service.create({
        title: 'Parent',
        subtasks: [{ title: 'Open subtask' }, { title: 'Already done', isCompleted: true }],
      });

      const result = await service.complete(task.id, { completeRemainingSubtasks: true });

      expect(result.requiresConfirmation).toBe(false);
      expect(result.completed?.isCompleted).toBe(true);
      expect(result.completed?.subtasks.every((subtask) => subtask.isCompleted)).toBe(true);
      expect(result.completed?.subtasks.every((subtask) => subtask.completedAt)).toBe(true);
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

    it('should update parent fields and mixed subtask mutations in one request', async () => {
      const task = await service.create({
        title: 'Original',
        subtasks: [{ title: 'Keep me' }, { title: 'Remove me' }],
      });

      const [keepSubtask, removeSubtask] = task.subtasks;
      const updated = await service.update(task.id, {
        title: 'Updated',
        subtasks: {
          update: [{ id: keepSubtask.id, title: 'Updated subtask', isCompleted: true }],
          create: [{ title: 'New subtask' }, { title: '   ' }],
          delete: [removeSubtask.id],
        },
      });

      expect(updated.title).toBe('Updated');
      expect(updated.subtasks.map((subtask) => subtask.title)).toEqual([
        'Updated subtask',
        'New subtask',
      ]);
      expect(updated.subtasks[0].isCompleted).toBe(true);
      expect(updated.subtasks[0].completedAt).toBeTruthy();
    });

    it('should reject subtask updates that do not belong to the parent task', async () => {
      const firstTask = await service.create({
        title: 'First',
        subtasks: [{ title: 'First subtask' }],
      });
      const secondTask = await service.create({ title: 'Second' });

      await expect(
        service.update(secondTask.id, {
          subtasks: {
            update: [{ id: firstTask.subtasks[0].id, title: 'Hijacked' }],
          },
        })
      ).rejects.toThrow('subtask does not belong to task');
    });

    it('moves a task to the end of its new active bucket after priority changes', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));

      const highTask = await service.create({ title: 'High task', priority: 'high' });
      await service.create({ title: 'Default first', priority: 'default' });
      await service.create({ title: 'Default second', priority: 'default' });

      await service.update(highTask.id, { priority: 'default' });

      const result = await service.listTasks();
      expect(result.active.map((task) => task.title)).toEqual([
        'Default first',
        'Default second',
        'High task',
      ]);
    });
  });

  describe('reorder', () => {
    it('rewrites sortOrder sequentially for one active bucket', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));

      const first = await service.create({ title: 'First', priority: 'default' });
      const second = await service.create({ title: 'Second', priority: 'default' });
      const third = await service.create({ title: 'Third', priority: 'default' });

      await service.reorder([third.id, first.id, second.id]);

      const result = await service.listTasks();
      expect(result.active.map((task) => task.title)).toEqual(['Third', 'First', 'Second']);
      expect(result.active.map((task) => task.sortOrder)).toEqual([0, 1, 2]);
    });

    it('rejects invalid bucket payloads without changing persisted order', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00.000Z'));

      const first = await service.create({ title: 'First', priority: 'default' });
      await service.create({ title: 'Second', priority: 'default' });
      const upcoming = await service.create({ title: 'Upcoming', notBefore: '2026-03-17' });

      await expect(service.reorder([first.id, first.id])).rejects.toThrow('invalid reorder payload');
      await expect(service.reorder([first.id])).rejects.toThrow('invalid reorder payload');
      await expect(service.reorder([first.id, upcoming.id])).rejects.toThrow('invalid reorder payload');

      const result = await service.listTasks();
      expect(result.active.map((task) => task.title)).toEqual(['First', 'Second']);
      expect(result.active.map((task) => task.sortOrder)).toEqual([0, 1]);
    });
  });

  describe('delete', () => {
    it('should remove a task and its subtasks', async () => {
      const task = await service.create({
        title: 'To delete',
        subtasks: [{ title: 'Subtask' }],
      });
      await service.delete(task.id);
      const result = await service.listTasks();
      expect(result.active).toHaveLength(0);
      const remainingSubtasks = sqlite
        .prepare('SELECT COUNT(*) as count FROM subtasks WHERE task_id = ?')
        .get(task.id) as { count: number };
      expect(remainingSubtasks.count).toBe(0);
    });
  });

  describe('listTasks', () => {
    it('should keep list queries scoped to parent tasks only', async () => {
      await service.create({
        title: 'Parent with subtasks',
        subtasks: [{ title: 'Nested one' }, { title: 'Nested two' }],
      });

      const result = await service.listTasks();

      expect(result.active).toHaveLength(1);
      expect(result.active[0].title).toBe('Parent with subtasks');
      expect(result.active[0].subtasks).toHaveLength(2);
    });
  });
});
