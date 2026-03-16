import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { tasks } from '../src/db/schema';
import { nanoid } from 'nanoid';

describe('Database schema', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite);
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
      )
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('should insert and retrieve a task', async () => {
    const id = nanoid();
    await db.insert(tasks).values({
      id,
      title: 'Test task',
      priority: 'high',
    });

    const result = await db.select().from(tasks);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test task');
    expect(result[0].priority).toBe('high');
    expect(result[0].userId).toBe('default');
    expect(result[0].isCompleted).toBe(0);
  });

  it('should store and parse recurrence_rule as JSON string', async () => {
    const id = nanoid();
    const rule = JSON.stringify({ type: 'weekdays', days: [1, 4] });
    await db.insert(tasks).values({
      id,
      title: 'Recurring task',
      recurrenceRule: rule,
      recurrenceGroupId: nanoid(),
    });

    const result = await db.select().from(tasks);
    const parsed = JSON.parse(result[0].recurrenceRule!);
    expect(parsed.type).toBe('weekdays');
    expect(parsed.days).toEqual([1, 4]);
  });

  it('should default user_id to "default"', async () => {
    await db.insert(tasks).values({ id: nanoid(), title: 'Task' });
    const result = await db.select().from(tasks);
    expect(result[0].userId).toBe('default');
  });

  it('creates tasks with sort_order available', () => {
    const result = sqlite.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
    expect(result.some((column) => column.name === 'sort_order')).toBe(true);
  });
});
