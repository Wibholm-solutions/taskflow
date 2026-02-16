import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function createDb(dbPath: string): { db: ReturnType<typeof drizzle>; sqlite: DatabaseType } {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export function createTestDb(): { db: ReturnType<typeof drizzle>; sqlite: DatabaseType } {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
