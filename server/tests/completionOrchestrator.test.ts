import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { tasks, subtasks } from '../src/db/schema';
import {
  executeCompletion,
  SubtasksConfirmationRequiredError,
} from '../src/services/completionOrchestrator';
import type { TaskResponse } from '../src/types';

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

function insertTask(
  sqlite: Database.Database,
  overrides: Partial<{
    id: string;
    userId: string;
    title: string;
    isCompleted: number;
    recurrenceGroupId: string | null;
    recurrenceRule: string | null;
    deadline: string | null;
    notBefore: string | null;
    priority: string;
  }> = {}
) {
  const id = overrides.id ?? 'task-1';
  const stmt = sqlite.prepare(`
    INSERT INTO tasks (id, user_id, title, is_completed, recurrence_group_id, recurrence_rule, deadline, not_before, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    overrides.userId ?? 'default',
    overrides.title ?? 'Test task',
    overrides.isCompleted ?? 0,
    overrides.recurrenceGroupId ?? null,
    overrides.recurrenceRule ?? null,
    overrides.deadline ?? null,
    overrides.notBefore ?? null,
    overrides.priority ?? 'default'
  );
  return id;
}

function insertSubtask(
  sqlite: Database.Database,
  overrides: Partial<{
    id: string;
    taskId: string;
    title: string;
    isCompleted: number;
  }> = {}
) {
  const id = overrides.id ?? 'subtask-1';
  const stmt = sqlite.prepare(`
    INSERT INTO subtasks (id, task_id, title, is_completed)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, overrides.taskId ?? 'task-1', overrides.title ?? 'Subtask', overrides.isCompleted ?? 0);
  return id;
}

function makeTaskResponse(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: 'task-1',
    title: 'Test task',
    description: null,
    deadline: null,
    priority: 'default',
    isCompleted: false,
    completedAt: null,
    notBefore: null,
    recurrenceGroupId: null,
    recurrenceRule: null,
    sortOrder: 0,
    createdAt: '2026-03-20T10:00:00.000Z',
    updatedAt: '2026-03-20T10:00:00.000Z',
    subtasks: [],
    ...overrides,
  };
}

describe('executeCompletion', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  const userId = 'default';
  const now = '2026-03-20T12:00:00.000Z';

  beforeEach(() => {
    const setup = setupTestDb();
    sqlite = setup.sqlite;
    db = setup.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  it('throws SubtasksConfirmationRequiredError when open subtasks exist', () => {
    insertTask(sqlite);
    insertSubtask(sqlite, { id: 'sub-1', taskId: 'task-1', isCompleted: 0 });

    const task = makeTaskResponse({
      subtasks: [
        {
          id: 'sub-1',
          taskId: 'task-1',
          title: 'Subtask',
          isCompleted: false,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    db.transaction((tx) => {
      expect(() => executeCompletion(task, {}, { tx, userId, now })).toThrow(
        SubtasksConfirmationRequiredError
      );
    });

    const row = sqlite.prepare('SELECT is_completed FROM tasks WHERE id = ?').get('task-1') as any;
    expect(row.is_completed).toBe(0);
  });

  it('marks task completed for simple task (no subtasks, no recurrence)', () => {
    insertTask(sqlite);
    const task = makeTaskResponse();

    let result: { nextInstanceId: string | null } | undefined;
    db.transaction((tx) => {
      result = executeCompletion(task, {}, { tx, userId, now });
    });

    expect(result!.nextInstanceId).toBeNull();
    const row = sqlite.prepare('SELECT is_completed, completed_at FROM tasks WHERE id = ?').get('task-1') as any;
    expect(row.is_completed).toBe(1);
    expect(row.completed_at).toBe(now);
  });

  it('completes open subtasks when confirmed', () => {
    insertTask(sqlite);
    insertSubtask(sqlite, { id: 'sub-1', taskId: 'task-1', isCompleted: 0 });
    insertSubtask(sqlite, { id: 'sub-2', taskId: 'task-1', title: 'Done', isCompleted: 1 });

    const task = makeTaskResponse({
      subtasks: [
        {
          id: 'sub-1', taskId: 'task-1', title: 'Open',
          isCompleted: false, completedAt: null, createdAt: now, updatedAt: now,
        },
        {
          id: 'sub-2', taskId: 'task-1', title: 'Done',
          isCompleted: true, completedAt: now, createdAt: now, updatedAt: now,
        },
      ],
    });

    db.transaction((tx) => {
      executeCompletion(task, { completeRemainingSubtasks: true }, { tx, userId, now });
    });

    const rows = sqlite.prepare('SELECT is_completed FROM subtasks WHERE task_id = ?').all('task-1') as any[];
    expect(rows.every((r: any) => r.is_completed === 1)).toBe(true);
  });

  it('creates new recurring instance when no open instance exists', () => {
    const groupId = 'group-1';
    insertTask(sqlite, {
      recurrenceGroupId: groupId,
      recurrenceRule: JSON.stringify({ type: 'days_after', interval: 7 }),
    });

    const task = makeTaskResponse({
      recurrenceGroupId: groupId,
      recurrenceRule: { type: 'days_after', interval: 7 },
    });

    let result: { nextInstanceId: string | null } | undefined;
    db.transaction((tx) => {
      result = executeCompletion(task, {}, { tx, userId, now });
    });

    expect(result!.nextInstanceId).not.toBeNull();

    const nextRow = sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get(result!.nextInstanceId!) as any;
    expect(nextRow).toBeTruthy();
    expect(nextRow.not_before).toBe('2026-03-27');
    expect(nextRow.recurrence_group_id).toBe(groupId);
    expect(nextRow.is_completed).toBe(0);
  });

  it('reuses existing open recurring instance', () => {
    const groupId = 'group-1';
    insertTask(sqlite, {
      recurrenceGroupId: groupId,
      recurrenceRule: JSON.stringify({ type: 'days_after', interval: 7 }),
    });
    insertTask(sqlite, {
      id: 'existing-next',
      recurrenceGroupId: groupId,
      recurrenceRule: JSON.stringify({ type: 'days_after', interval: 7 }),
      isCompleted: 0,
    });

    const task = makeTaskResponse({
      recurrenceGroupId: groupId,
      recurrenceRule: { type: 'days_after', interval: 7 },
    });

    let result: { nextInstanceId: string | null } | undefined;
    db.transaction((tx) => {
      result = executeCompletion(task, {}, { tx, userId, now });
    });

    expect(result!.nextInstanceId).toBe('existing-next');

    const allTasks = sqlite.prepare('SELECT id FROM tasks WHERE recurrence_group_id = ? AND is_completed = 0').all(groupId) as any[];
    expect(allTasks).toHaveLength(1);
  });

  it('clones subtasks to new recurring instance', () => {
    const groupId = 'group-1';
    insertTask(sqlite, {
      recurrenceGroupId: groupId,
      recurrenceRule: JSON.stringify({ type: 'days_after', interval: 7 }),
    });
    insertSubtask(sqlite, { id: 'sub-1', taskId: 'task-1', title: 'Pack bags', isCompleted: 0 });
    insertSubtask(sqlite, { id: 'sub-2', taskId: 'task-1', title: 'Charge camera', isCompleted: 0 });

    const task = makeTaskResponse({
      recurrenceGroupId: groupId,
      recurrenceRule: { type: 'days_after', interval: 7 },
      subtasks: [
        {
          id: 'sub-1', taskId: 'task-1', title: 'Pack bags',
          isCompleted: false, completedAt: null, createdAt: now, updatedAt: now,
        },
        {
          id: 'sub-2', taskId: 'task-1', title: 'Charge camera',
          isCompleted: false, completedAt: null, createdAt: now, updatedAt: now,
        },
      ],
    });

    let result: { nextInstanceId: string | null } | undefined;
    db.transaction((tx) => {
      result = executeCompletion(
        task,
        { completeRemainingSubtasks: true },
        { tx, userId, now }
      );
    });

    const nextSubtasks = sqlite
      .prepare('SELECT title, is_completed FROM subtasks WHERE task_id = ? ORDER BY created_at')
      .all(result!.nextInstanceId!) as any[];

    expect(nextSubtasks.map((s: any) => s.title)).toEqual(['Pack bags', 'Charge camera']);
    expect(nextSubtasks.every((s: any) => s.is_completed === 0)).toBe(true);
  });
});
